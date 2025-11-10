import * as fs from 'node:fs';
import * as path from 'node:path';
import logger from 'electron-log';
import type {
    AddProjectToListResult,
    InstalledRelease,
    ProjectConfig,
    ProjectDetails,
} from '../../types/index.js';

import {
    EDITOR_CONFIG_DIRNAME,
    PROJECTS_FILENAME,
    TEMPLATE_DIR_NAME,
} from '../constants.js';
import { t } from '../i18n/index.js';
import { getAssetPath } from '../pathResolver.js';
import {
    DEFAULT_PROJECT_DEFINITION,
    getProjectDefinition,
    SetProjectEditorRelease,
} from '../utils/godot.utils.js';
import {
    createNewEditorSettings,
    type GodotProjectFile,
    getProjectConfigVersionFromParsed,
    getProjectNameFromParsed,
    getProjectRendererFromParsed,
    parseGodotProjectFile,
    updateEditorSettings,
} from '../utils/godotProject.utils.js';
import { getDefaultDirs } from '../utils/platform.utils.js';
import { addProjectToList } from '../utils/projects.utils.js';
import { sortReleases } from '../utils/releaseSorting.utils.js';
import {
    addOrUpdateVSCodeRecommendedExtensions,
    addVSCodeNETLaunchConfig,
    updateVSCodeSettings,
} from '../utils/vscode.utils.js';
import { getInstalledTools } from './installedTools.js';
import { getProjectsDetails } from './projects.js';
import { getInstalledReleases } from './releases.js';
import { getUserPreferences } from './userPreferences.js';

export async function addProject(
    projectPath: string,
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
            error: t('projects:addProject.errors.projectExists', {
                path: dirname,
            }),
        };
    }

    // check if project.godot exist
    if (!fs.existsSync(projectPath)) {
        return {
            success: false,
            error: t('projects:addProject.errors.invalidPath'),
        };
    }
    let parsedConfig: GodotProjectFile | null = null;
    try {
        // read project file
        const projectFile = await fs.promises.readFile(projectPath, 'utf-8');
        parsedConfig = parseGodotProjectFile(projectFile);
        if (!parsedConfig) {
            throw new Error(t('projects:addProject.errors.invalidProjectFile'));
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
            error: `${t('projects:addProject.errors.invalidProjectFile')} ${e}`,
        };
    }

    // get project name from path
    const projectName = await getProjectNameFromParsed(parsedConfig);

    // check if project with that name already exist
    if (projects.find((p) => p.name === projectName)) {
        return {
            success: false,
            error: t('projects:addProject.errors.nameExists', {
                name: projectName,
            }),
        };
    }

    // get renderer from project file
    const renderer = await getProjectRendererFromParsed(parsedConfig);

    if (renderer === 'Unknown') {
        return {
            success: false,
            error: t('projects:addProject.errors.invalidRenderer'),
        };
    }

    const configVersion = await getProjectConfigVersionFromParsed(parsedConfig);

    // select the closest installed release
    const installedReleases = await getInstalledReleases();
    const releaseBaseVersion = configVersion === 5 ? 4.0 : 0;

    if (releaseBaseVersion === 0) {
        return {
            success: false,
            error: t('projects:addProject.errors.invalidConfigVersion'),
        };
    }

    // see if the project has a .csproj or a sln file
    const hasDotNET: boolean = fs
        .readdirSync(dirname)
        .some((f) => f.endsWith('.csproj') || f.endsWith('.sln'));

    let release: InstalledRelease | undefined;

    // find the closest stable release
    // get the highest version number for that major version

    const releases =
        installedReleases
            .filter(
                (r) =>
                    parseInt(r.version_number.toString(), 10) ===
                        parseInt(releaseBaseVersion.toString(), 10) &&
                    r.valid &&
                    r.version.toLowerCase().includes('stable'),
            )
            .sort(sortReleases) || [];

    if (releases.length === 0) {
        return {
            success: false,
            error: t('projects:addProject.errors.noStableReleases', {
                version: releaseBaseVersion,
            }),
        };
    }

    if (hasDotNET && !releases.some((r) => r.mono)) {
        // no mono release available for this version
        return {
            success: false,
            error: t('projects:addProject.errors.noDotNetRelease'),
        };
    }

    const compatibleReleases = releases.filter(
        (r) => r.config_version >= configVersion,
    );

    release =
        compatibleReleases.find((r) => r.mono === hasDotNET) ??
        compatibleReleases[0];

    if (!release) {
        return {
            success: false,
            error: t('projects:addProject.errors.noCompatibleRelease', {
                version: releaseBaseVersion,
                configVersion: configVersion,
            }),
        };
    }

    let config: ProjectConfig | null = null;
    if (release) {
        config = getProjectDefinition(
            release?.version_number || 0,
            DEFAULT_PROJECT_DEFINITION,
        );
    }
    if (!config) {
        return {
            success: false,
            error: t('projects:addProject.errors.invalidConfigVersion'),
        };
    }

    // set launch path
    const projectEditorPath = path.resolve(
        prefs.install_location,
        EDITOR_CONFIG_DIRNAME,
        projectName,
    );
    let editorConfigFileName = '';
    let editorSettingsFile = '';

    let launch_path = '';

    if (release) {
        logger.debug('Setting project editor release', release);
        // launch_path = await setEditorSymlink(projectEditorPath, release.editor_path);
        launch_path = await SetProjectEditorRelease(projectEditorPath, release);
        editorConfigFileName = config.editorConfigFilename(
            release.version_number,
        );
    }

    const withGit = fs.existsSync(path.resolve(dirname, '.git'));
    const withVSCode = fs.existsSync(path.resolve(dirname, '.vscode'));

    const tools = await getInstalledTools();
    const vsCodeTool = tools.find((t) => t.name === 'VSCode');

    if (release && withVSCode && vsCodeTool) {
        // setup external text editor settings for VSCode integration
        editorSettingsFile = path.resolve(
            projectEditorPath,
            'editor_data',
            editorConfigFileName,
        );

        let vscodeSettingsPath = vsCodeTool.path;

        if (process.platform === 'darwin') {
            vscodeSettingsPath = path.resolve(
                vscodeSettingsPath,
                'Contents',
                'MacOS',
                'Electron',
            );
        }

        const templatesDir = path.resolve(getAssetPath(), TEMPLATE_DIR_NAME);
        const editorSettingsExists = fs.existsSync(editorSettingsFile);

        if (editorSettingsExists) {
            // Update existing editor settings
            await updateEditorSettings(editorSettingsFile, {
                execPath: vscodeSettingsPath,
                execFlags: '{project} --goto {file}:{line}:{col}',
                useExternalEditor: true,
                isMono: release.mono,
            });
        } else {
            // Create new editor settings from template
            await createNewEditorSettings(
                templatesDir,
                launch_path,
                editorConfigFileName,
                config.editorConfigFormat,
                true,
                vscodeSettingsPath,
                '{project} --goto {file}:{line}:{col}',
                release.mono,
            );
        }

        // Always update VSCode settings
        await updateVSCodeSettings(
            dirname,
            launch_path,
            release.version_number,
            release.mono,
        );

        // Always update VSCode recommended extensions
        await addOrUpdateVSCodeRecommendedExtensions(dirname, release.mono);

        // Always setup .NET launch config if using mono
        if (release.mono) {
            await addVSCodeNETLaunchConfig(dirname, launch_path);
        }
    }

    const project: ProjectDetails = {
        path: dirname,
        name: projectName,
        version:
            release?.version ?? `${releaseBaseVersion.toFixed(1)} (missing)`,
        version_number: release?.version_number ?? releaseBaseVersion,
        renderer,
        last_opened: null,
        launch_path,
        editor_settings_path: editorSettingsFile
            ? path.dirname(editorSettingsFile)
            : '',
        editor_settings_file: editorSettingsFile
            ? path.resolve(
                  path.dirname(editorSettingsFile),
                  editorConfigFileName,
              )
            : '',
        config_version: configVersion as 5,
        withGit,
        withVSCode,
        valid: true,
        release: {
            config_version: configVersion as 5,
            editor_path: release?.editor_path ?? '',
            install_path: release?.install_path ?? '',
            mono: release?.mono ?? false,
            platform: release?.platform ?? '',
            arch: release?.arch ?? '',
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
    };
}
