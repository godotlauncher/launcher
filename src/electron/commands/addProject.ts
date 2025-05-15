import * as fs from "node:fs";
import * as path from "node:path";
import logger from "electron-log";

import {
  EDITOR_CONFIG_DIRNAME,
  PROJECTS_FILENAME,
  TEMPLATE_DIR_NAME,
} from "../constants.js";
import { getAssetPath } from "../pathResolver.js";
import {
  DEFAULT_PROJECT_DEFINITION,
  getProjectDefinition,
  SetProjectEditorRelease,
} from "../utils/godot.utils.js";
import {
  createNewEditorSettings,
  getProjectConfigVersionFromParsed,
  getProjectNameFromParsed,
  getProjectRendererFromParsed,
  parseGodotProjectFile,
} from "../utils/godotProject.utils.js";
import { getDefaultDirs } from "../utils/platform.utils.js";
import { addProjectToList } from "../utils/projects.utils.js";
import { getInstalledReleases } from "./releases.js";
import { getUserPreferences } from "./userPreferences.js";
import { sortReleases } from "../utils/releaseSorting.utils.js";
import { getProjectsDetails } from "./projects.js";
import { getInstalledTools } from "./installedTools.js";

export async function addProject(
  projectPath: string
): Promise<AddProjectToListResult> {
  const { configDir } = getDefaultDirs();
  const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);
  const prefs = await getUserPreferences();

  // check if project already exist based on path
  const projects = await getProjectsDetails();

  const dirname = path.dirname(projectPath);

  if (projects.find((p) => p.path === dirname)) {
    return {
      success: false,
      error: `Project '${dirname}' already exists`,
    };
  }

  // check if project.godot exist
  if (!fs.existsSync(projectPath)) {
    return {
      success: false,
      error: "Invalid project path",
    };
  }
  let parsedConfig;
  try {
    // read project file
    const projectFile = await fs.promises.readFile(projectPath, "utf-8");
    parsedConfig = parseGodotProjectFile(projectFile);
    if (!parsedConfig) {
      throw new Error("Invalid project.godot file");
    }
  } catch (e) {
    if (e instanceof Error) {
      return {
        success: false,
        error: e.message,
      };
    }
    return {
      success: false,
      error: "Invalid project file " + e,
    };
  }

  // get project name from path
  const projectName = await getProjectNameFromParsed(parsedConfig);

  // check if project with that name already exist
  if (projects.find((p) => p.name === projectName)) {
    return {
      success: false,
      error: `Project with name '${projectName}' already exists\nPlease rename the project in 'project.godot' or remove the existing one.`,
    };
  }

  // get renderer from project file
  const renderer = await getProjectRendererFromParsed(parsedConfig);

  if (renderer === "Unknown") {
    return {
      success: false,
      error: "Invalid project file",
    };
  }

  const configVersion = await getProjectConfigVersionFromParsed(parsedConfig);

  // select the closest installed release
  const installedReleases = await getInstalledReleases();
  const releaseBaseVersion = configVersion === 5 ? 4.0 : 0;

  if (releaseBaseVersion === 0) {
    return {
      success: false,
      error:
        "Invalid project.godot config_version.\nOnly config version 5 is supported",
    };
  }

  // see if the project has a .csproj or a sln file
  const hasDotNET: boolean = fs
    .readdirSync(dirname)
    .some((f) => f.endsWith(".csproj") || f.endsWith(".sln"));

  let release: InstalledRelease | undefined;

  // find the closest stable release
  // get the highest version number for that major version

  const releases =
    installedReleases
      .filter(
        (r) =>
          parseInt(r.version_number.toString()) ==
            parseInt(releaseBaseVersion.toString()) &&
          r.valid &&
          r.version.toLowerCase().includes("stable")
      )
      .sort(sortReleases) || [];

  if (hasDotNET && !releases.some((r) => r.mono)) {
    // no mono release available for this version
    return {
      success: false,
      error:
        "Project seems to be a .NET project but no Editor with .NET release found",
    };
  }

  release = releases.find((r) => r.mono === hasDotNET);

  if (!release || release.config_version < configVersion) {
    release = undefined;
  }

  let config: ProjectConfig | null = null;
  if (release) {
    config = getProjectDefinition(
      release?.version_number || 0,
      DEFAULT_PROJECT_DEFINITION
    );
  }
  if (!config) {
    return {
      success: false,
      error:
        "Invalid project.godot config_version.\nOnly config version 5 is supported",
    };
  }

  // set launch path
  const projectEditorPath = path.resolve(
    prefs.install_location,
    EDITOR_CONFIG_DIRNAME,
    projectName
  );
  let editorConfigFileName = "";
  let editorSettingsFile = "";

  let launch_path = "";

  if (release) {
    logger.debug("Setting project editor release", release);
    // launch_path = await setEditorSymlink(projectEditorPath, release.editor_path);
    launch_path = await SetProjectEditorRelease(projectEditorPath, release);
    editorConfigFileName = config.editorConfigFilename(release.version_number);
  }

  const withGit = fs.existsSync(path.resolve(dirname, ".git"));
  const withVSCode = fs.existsSync(path.resolve(dirname, ".vscode"));

  const tools = await getInstalledTools();
  const vsCodeTool = tools.find((t) => t.name === "VSCode");

  let shouldReportOnSettings = false;
  let settingsCreated = false;

  if (release && withVSCode && vsCodeTool) {
    // transfer the external text editor settings to new release version
    editorSettingsFile = path.resolve(
      projectEditorPath,
      "editor_data",
      editorConfigFileName
    );

    let vscodeSettingsPath = vsCodeTool.path;

    if (process.platform === "darwin") {
      vscodeSettingsPath = path.resolve(
        vscodeSettingsPath,
        "Contents",
        "MacOS",
        "Electron"
      );
    }

    shouldReportOnSettings = true;

    if (!fs.existsSync(editorSettingsFile)) {
      const templatesDir = path.resolve(getAssetPath(), TEMPLATE_DIR_NAME);

      // create the new editor settings file
      await createNewEditorSettings(
        templatesDir,
        launch_path,
        editorConfigFileName,
        config.editorConfigFormat,
        true,
        vscodeSettingsPath.replace(new RegExp(`\\${path.sep}`, "g"), "\\\\"),
        "{project} --goto {file}:{line}:{col}",
        release.mono
      );

      settingsCreated = true;
    } else {
      logger.warn(
        "Editor settings file already exists, no changes made to editor settings"
      );
      settingsCreated = false;
    }
  }

  const project: ProjectDetails = {
    path: dirname,
    name: projectName,
    version: release?.version ?? releaseBaseVersion.toFixed(1) + " (missing)",
    version_number: release?.version_number ?? releaseBaseVersion,
    renderer,
    last_opened: null,
    launch_path,
    editor_settings_path: editorSettingsFile
      ? path.dirname(editorSettingsFile)
      : "",
    editor_settings_file: editorSettingsFile
      ? path.resolve(path.dirname(editorSettingsFile), editorConfigFileName)
      : "",
    config_version: configVersion as 5,
    withGit,
    withVSCode,
    valid: true,
    release: {
      config_version: configVersion as 5,
      editor_path: release?.editor_path ?? "",
      install_path: release?.install_path ?? "",
      mono: release?.mono ?? false,
      platform: release?.platform ?? "",
      arch: release?.arch ?? "",
      prerelease: release?.prerelease ?? false,
      version: release?.version ?? releaseBaseVersion.toString(),
      version_number: release?.version_number ?? releaseBaseVersion,
      published_at: release?.published_at ?? null,
      valid: true,
    },
  };

  const allProjects = await addProjectToList(projectListPath, project);

  return {
    success: true,
    projects: allProjects,
    newProject: project,
    additionalInfo: {
      settingsCreated,
      shouldReportOnSettings,
    },
  };
}
