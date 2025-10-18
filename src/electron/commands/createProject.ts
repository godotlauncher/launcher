import *  as fs from 'node:fs';
import * as path from 'node:path';
import logger from 'electron-log';

import { getDefaultDirs } from '../utils/platform.utils.js';
import { getInstalledTools } from './installedTools.js';
import { getUserPreferences } from './userPreferences.js';
import { EDITOR_CONFIG_DIRNAME, MIN_VERSION, PROJECT_RESOURCES_DIRNAME, PROJECTS_FILENAME, TEMPLATE_DIR_NAME } from '../constants.js';
import { getAssetPath } from '../pathResolver.js';
import { createProjectFile, DEFAULT_PROJECT_DEFINITION, getProjectDefinition, SetProjectEditorRelease } from '../utils/godot.utils.js';
import { gitAddAndCommit, gitInit } from '../utils/git.utils.js';
import { addOrUpdateVSCodeRecommendedExtensions, addVSCodeSettings } from '../utils/vscode.utils.js';
import { createNewEditorSettings } from '../utils/godotProject.utils.js';
import { addProjectToList } from '../utils/projects.utils.js';
import { t } from '../i18n/index.js';

export async function createProject(
    projectName: string,
    release: InstalledRelease,
    renderer: RendererType,
    withVSCode: boolean,
    withGit: boolean): Promise<CreateProjectResult> {

    const tools = await getInstalledTools();

    const vsCodeTool = tools.find(t => t.name === 'VSCode');
    const gitTool = tools.find(t => t.name === 'Git');


    if (withVSCode && !vsCodeTool) {

        logger.warn('Create Project with VS Code, but VSCode is not installed. Setting withVSCode to false');
        withVSCode = false;
    }

    if (withGit && !gitTool) {

        logger.warn('Create Project with Git, but Git is not installed. Setting withGit to false');
        withGit = false;
    }

    // clean name, remove spaces and replace with -
    projectName = projectName.trim().replaceAll(' ', '-');

    const { projects_location: projectDir, install_location: installDir } = await getUserPreferences();
    const projectPath = path.resolve(projectDir, projectName);

    // check if path exist
    if (fs.existsSync(projectPath)) {
        return {
            success: false,
            error: t('createProject:errors.projectExists', { name: projectName }),
        };
    }

    // get the editor version, make sure it's a number and greater than the minimum version
    const version = release.version_number;
    if (!version || isNaN(version) || version < MIN_VERSION) {
        return {
            success: false,
            error: t('createProject:errors.invalidEditorVersion', { version: version.toString() }),
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
            error: t('createProject:errors.failedProjectDefinition', { version: version.toString() }),
        };
    }


    try {

        // create project folder

        // check if project folder exists and fail if not empty
        if (fs.existsSync(projectPath) && (await fs.promises.readdir(projectPath)).length > 0) {
            return {
                success: false,
                error: t('createProject:errors.folderNotEmpty', { name: projectName }),
            };
        }

        // create project file
        let projectFile: string;

        try {
            projectFile = await createProjectFile(templatesDir, config.configVersion, release.version_number, projectName, renderer as unknown as RendererType[5]);
        }
        catch (e) {
            return {
                success: false,
                error: t('createProject:errors.failedCreateFile', { error: String(e) }),
            };
        }

        await fs.promises.mkdir(projectPath, { recursive: true });
        // write project file
        await fs.promises.writeFile(path.resolve(projectPath, config.projectFilename), projectFile);

        // move resources
        for (const resource of config.resources) {

            const src = path.resolve(projectResDir, resource.src);
            const dst = path.resolve(projectPath, resource.dst);
            const dstDir = path.dirname(path.resolve(projectPath, resource.dst));

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
        const projectEditorPath = path.resolve(installDir, EDITOR_CONFIG_DIRNAME, projectName);
        // const launch_path = await setEditorSymlink(projectEditorPath, release.editor_path);
        const launch_path = await SetProjectEditorRelease(projectEditorPath, release);

        // add gitignore and init git
        if (withGit && gitTool) {
            await fs.promises.copyFile(path.resolve(projectResDir, 'default_gitignore'), path.resolve(projectPath, '.gitignore'));
            await gitInit(projectPath);
            await gitAddAndCommit(projectPath);
        }

        if (withVSCode && vsCodeTool) {

            await addVSCodeSettings(projectPath, launch_path, release.version_number, release.mono);
            await addOrUpdateVSCodeRecommendedExtensions(projectPath, release.mono);

            let vscodeSettingsPath = vsCodeTool.path;

            // on macos we need to go into the app bundle
            if (process.platform === 'darwin') {
                vscodeSettingsPath = path.resolve(vscodeSettingsPath, 'Contents', 'MacOS', 'Electron');
            }

            // create editor settings for vscode
            await createNewEditorSettings(
                templatesDir,
                launch_path,
                config.editorConfigFilename(release.version_number),
                config.editorConfigFormat,
                true,
                vscodeSettingsPath,
                '{project} --goto {file}:{line}:{col}',
                release.mono,
            );

        }

        const editorSettingsPath = path.resolve(path.dirname(launch_path), 'editor_data', config.editorConfigFilename(release.version_number));

        // setup the editor location for settings
        const result: CreateProjectResult = {
            success: true,
            projectPath,
            projectDetails: {
                name: projectName,
                version: release.version,
                version_number: release.version_number,
                last_opened: null,
                launch_path: launch_path,
                editor_settings_path: path.dirname(editorSettingsPath),
                editor_settings_file: editorSettingsPath,
                path: projectPath,
                release,
                renderer: renderer as unknown as RendererType[5],
                config_version: config.configVersion,
                withVSCode,
                withGit,
                valid: true,
            },
        };

        // add project to list
        const { configDir } = getDefaultDirs();
        await addProjectToList(path.resolve(configDir, PROJECTS_FILENAME), result.projectDetails!);
        return result;
    }
    catch (error) {
        // clean folder
        await fs.promises.rm(projectPath, { recursive: true, force: true });
        return {
            success: false,
            error: (error as Error).message,
        };
    }
}
