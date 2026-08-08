import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
    CodeEditorId,
    CreateProjectResult,
    InstalledRelease,
    RendererType,
} from '@shared/contracts';
import { app } from 'electron';
import logger from 'electron-log';
import type { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import {
    EDITOR_CONFIG_DIRNAME,
    MIN_VERSION,
    PROJECT_RESOURCES_DIRNAME,
    PROJECTS_FILENAME,
    TEMPLATE_DIR_NAME,
} from '../constants.js';
import { t } from '../i18n/index.js';
import { getAssetPath } from '../pathResolver.js';
import { gitAddAndCommit, gitInit } from '../utils/git.utils.js';
import {
    createProjectFile,
    DEFAULT_PROJECT_DEFINITION,
    getProjectDefinition,
    SetProjectEditorRelease,
} from '../utils/godot.utils.js';
import {
    getProjectIconUrlFromParsed,
    parseGodotProjectFile,
} from '../utils/godotProject.utils.js';
import { getDefaultDirs } from '../utils/platform.utils.js';
import { sanitiseProjectDirectoryName } from '../utils/projectDirectoryName.utils.js';
import { writeProjectLauncherConfig } from '../utils/projectLauncherConfig.utils.js';
import { addProjectToList } from '../utils/projects.utils.js';
import { getInstalledTools } from './installedTools.js';
import { getUserPreferences } from './userPreferences.js';

export async function createProject(
    projectName: string,
    release: InstalledRelease,
    renderer: RendererType[5],
    codeEditorId: CodeEditorId | null,
    withGit: boolean,
    codeEditorIntegrationService: CodeEditorIntegrationService,
    overwriteProjectPath?: string,
): Promise<CreateProjectResult> {
    if (codeEditorId) {
        try {
            await codeEditorIntegrationService.assertIntegrationSelectable(
                codeEditorId,
            );
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    const tools = await getInstalledTools();

    const gitTool = tools.find((t) => t.name === 'Git');

    if (withGit && !gitTool) {
        logger.warn(
            'Create Project with Git, but Git is not installed. Setting withGit to false',
        );
        withGit = false;
    }

    projectName = projectName.trim();
    const projectDirectoryName = sanitiseProjectDirectoryName(
        projectName.replaceAll(' ', '-'),
    );

    const { projects_location: projectDir, install_location: installDir } =
        await getUserPreferences();
    logger.info(overwriteProjectPath);
    const projectPath = overwriteProjectPath
        ? path.resolve(path.dirname(overwriteProjectPath), projectDirectoryName)
        : path.resolve(projectDir, projectDirectoryName);

    // If the target exists, allow it only when it's an empty directory.
    if (fs.existsSync(projectPath)) {
        const stat = await fs.promises.lstat(projectPath);

        if (!stat.isDirectory()) {
            return {
                success: false,
                error: t('createProject:errors.pathNotDirectory'),
            };
        }

        const entries = await fs.promises.readdir(projectPath);
        if (entries.length > 0) {
            return {
                success: false,
                error: t('createProject:errors.folderNotEmpty', {
                    name: projectName,
                }),
            };
        }
    }

    // get the editor version, make sure it's a number and greater than the minimum version
    const version = release.version_number;
    if (!version || Number.isNaN(version) || version < MIN_VERSION) {
        return {
            success: false,
            error: t('createProject:errors.invalidEditorVersion', {
                version: version.toString(),
            }),
        };
    }

    const assetsDir = getAssetPath();
    const templatesDir = path.resolve(assetsDir, TEMPLATE_DIR_NAME);
    const projectResDir = path.resolve(assetsDir, PROJECT_RESOURCES_DIRNAME);

    // get the project definition
    const config = getProjectDefinition(version, DEFAULT_PROJECT_DEFINITION);

    if (!config) {
        return {
            success: false,
            error: t('createProject:errors.failedProjectDefinition', {
                version: version.toString(),
            }),
        };
    }

    try {
        // create project file
        let projectFile: string;

        try {
            projectFile = await createProjectFile(
                templatesDir,
                config.configVersion,
                release.version_number,
                projectName,
                renderer,
            );
        } catch (e) {
            return {
                success: false,
                error: t('createProject:errors.failedCreateFile', {
                    error: String(e),
                }),
            };
        }
        const parsedProjectFile = parseGodotProjectFile(projectFile);

        await fs.promises.mkdir(projectPath, { recursive: true });
        // write project file
        await fs.promises.writeFile(
            path.resolve(projectPath, config.projectFilename),
            projectFile,
        );

        // move resources
        for (const resource of config.resources) {
            const src = path.resolve(projectResDir, resource.src);
            const dst = path.resolve(projectPath, resource.dst);
            const dstDir = path.dirname(
                path.resolve(projectPath, resource.dst),
            );

            if (!fs.existsSync(src)) {
                logger.error('Resource not found', src);
                continue;
            }
            if (!fs.existsSync(dstDir)) {
                await fs.promises.mkdir(dstDir, { recursive: true });
            }

            await fs.promises.copyFile(src, dst);
        }

        // set the editor symlink
        const projectEditorPath = path.resolve(
            installDir,
            EDITOR_CONFIG_DIRNAME,
            projectDirectoryName,
        );
        // const launch_path = await setEditorSymlink(projectEditorPath, release.editor_path);
        const launch_path = await SetProjectEditorRelease(
            projectEditorPath,
            release,
        );

        // add gitignore and init git
        if (withGit && gitTool) {
            await fs.promises.copyFile(
                path.resolve(projectResDir, 'default_gitignore'),
                path.resolve(projectPath, '.gitignore'),
            );
            await gitInit(projectPath);
            await gitAddAndCommit(projectPath);
        }

        let editorSettingsPath = path.resolve(
            path.dirname(launch_path),
            'editor_data',
            config.editorConfigFilename(release.version_number),
        );

        if (codeEditorId) {
            const applied = await codeEditorIntegrationService.applyToProject(
                codeEditorId,
                {
                    projectPath,
                    godotLaunchPath: launch_path,
                    godotVersion: release.version_number,
                    mono: release.mono,
                    editorSettingsFile: editorSettingsPath,
                    editorSettingsFilename: config.editorConfigFilename(
                        release.version_number,
                    ),
                    editorSettingsFormat: config.editorConfigFormat,
                },
            );
            editorSettingsPath = applied.editorSettingsFile;
        }

        // setup the editor location for settings
        const result: CreateProjectResult = {
            success: true,
            projectPath,
            projectDetails: {
                name: projectName,
                version: release.version,
                version_number: release.version_number,
                icon_path: getProjectIconUrlFromParsed(
                    projectPath,
                    parsedProjectFile,
                ),
                added_at: new Date(),
                last_opened: null,
                launch_path: launch_path,
                editor_settings_path: path.dirname(editorSettingsPath),
                editor_settings_file: editorSettingsPath,
                path: projectPath,
                release,
                renderer,
                config_version: config.configVersion,
                codeEditorId,
                withGit,
                valid: true,
            },
        };

        // add project to list
        const { configDir } = getDefaultDirs();
        const projectDetails = result.projectDetails;
        if (!projectDetails) {
            throw new Error('Missing project details after creation');
        }
        await writeProjectLauncherConfig(projectPath, {
            release: projectDetails.release,
            launcherVersion: app.getVersion(),
        });
        await addProjectToList(
            path.resolve(configDir, PROJECTS_FILENAME),
            projectDetails,
        );
        return result;
    } catch (error) {
        // clean folder
        await fs.promises.rm(projectPath, { recursive: true, force: true });
        return {
            success: false,
            error: (error as Error).message,
        };
    }
}
