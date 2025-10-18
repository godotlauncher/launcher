import * as fs from 'node:fs';
import * as path from 'node:path';
import logger from 'electron-log';

import { getDefaultDirs } from '../utils/platform.utils.js';
import { getUserPreferences } from './userPreferences.js';
import { getStoredProjectsList, storeProjectsList } from '../utils/projects.utils.js';
import { DEFAULT_PROJECT_DEFINITION, getProjectDefinition, SetProjectEditorRelease } from '../utils/godot.utils.js';
import { EDITOR_CONFIG_DIRNAME, PROJECTS_FILENAME, TEMPLATE_DIR_NAME } from '../constants.js';
import { createNewEditorSettings } from '../utils/godotProject.utils.js';
import { getAssetPath } from '../pathResolver.js';
import { getInstalledTools } from './installedTools.js';
import { addOrUpdateVSCodeRecommendedExtensions, addVSCodeNETLaunchConfig } from '../utils/vscode.utils.js';
import { t } from '../i18n/index.js';


export async function setProjectEditor(project: ProjectDetails, newRelease: InstalledRelease): Promise<ChangeProjectEditorResult> {

    const { configDir } = getDefaultDirs();
    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);
    const allProjects = await getStoredProjectsList(projectListPath);

    // check if the project is already using the release
    if (project.release.version === newRelease.version && project.release.mono == newRelease.mono) {
        logger.warn(`Project already using the selected release, ${newRelease.version} - ${newRelease.mono ? 'mono' : ''}`);
        return {
            success: true,
            projects: allProjects,
        };
    }

    const { install_location: installLocation } = await getUserPreferences();

    const projectIndex = allProjects.findIndex(p => p.path === project.path);
    if (projectIndex === -1) {
        return {
            success: false,
            error: t('projects:changeEditor.errors.projectNotFound'),
        };
    }

    // check the config version and compare with the release version
    // cannot use release with config version lower than the already existing one

    const config = getProjectDefinition(newRelease.version_number, DEFAULT_PROJECT_DEFINITION);

    if (!config) {
        return {
            success: false,
            error: t('projects:changeEditor.errors.invalidEditorVersion'),
        };
    }

    // only allow same major version
    if (parseInt(project.version_number.toString()) != parseInt(newRelease.version_number.toString())) {
        return {
            success: false,
            error: t('projects:changeEditor.errors.differentMajorVersion'),
        };
    }

    const projectEditorPath = path.resolve(installLocation, EDITOR_CONFIG_DIRNAME, project.name);

    const newLaunchPath = await SetProjectEditorRelease(projectEditorPath, newRelease, project.release);
    const newEditorSettingsFile = path.resolve(path.dirname(project.launch_path), 'editor_data', config.editorConfigFilename(newRelease.version_number));

    const tools = await getInstalledTools();
    const vsCodeTool = tools.find(t => t.name === 'VSCode');

    let shouldReportOnSettings = false;
    let settingsCreated = false;
    if (project.withVSCode && vsCodeTool) {

        // update vscode launch.json file with new launch path
        await addVSCodeNETLaunchConfig(project.path, newLaunchPath);
        await addOrUpdateVSCodeRecommendedExtensions(project.path, newRelease.mono);

        const needsNewEditorSettings: boolean = fs.existsSync(newEditorSettingsFile) ? false : true;

        shouldReportOnSettings = true;

        if (needsNewEditorSettings) {
            const templatesDir = path.resolve(getAssetPath(), TEMPLATE_DIR_NAME);

            // create the new editor settings file
            await createNewEditorSettings(
                templatesDir,
                newLaunchPath,
                config.editorConfigFilename(newRelease.version_number),
                config.editorConfigFormat,
                true,
                vsCodeTool.path,
                '{project} --goto {file}:{line}:{col}',
                newRelease.mono,
            );

            settingsCreated = true;
        }
        else {
            logger.warn('Editor settings file already exists, no changes made to editor settings');
            settingsCreated = false;
        }
    }

    // set the project release
    project.release = newRelease;
    project.version = newRelease.version;
    project.version_number = newRelease.version_number;
    project.release = newRelease;
    project.launch_path = newLaunchPath;
    project.editor_settings_path = path.resolve(path.dirname(newEditorSettingsFile));
    project.editor_settings_file = newEditorSettingsFile;
    project.valid = true;
    project.release.valid = true;

    allProjects[projectIndex] = project;
    const updatedProjects = await storeProjectsList(projectListPath, allProjects);

    return {
        success: true,
        projects: updatedProjects,
        additionalInfo: {
            settingsCreated,
            shouldReportOnSettings,
        }
    };
}