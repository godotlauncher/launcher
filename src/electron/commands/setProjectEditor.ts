import * as fs from 'node:fs';
import * as path from 'node:path';
import logger from 'electron-log';
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
    updateEditorSettings,
} from '../utils/godotProject.utils.js';
import { JsonStoreConflictError } from '../utils/jsonStore.js';
import { getDefaultDirs } from '../utils/platform.utils.js';
import {
    getProjectsSnapshot,
    storeProjectsList,
} from '../utils/projects.utils.js';
import {
    addOrUpdateVSCodeRecommendedExtensions,
    addVSCodeNETLaunchConfig,
    updateVSCodeSettings,
} from '../utils/vscode.utils.js';
import { getInstalledTools } from './installedTools.js';
import { getUserPreferences } from './userPreferences.js';

const PROJECT_EDITOR_MAX_ATTEMPTS = 2;

export async function setProjectEditor(
    project: ProjectDetails,
    newRelease: InstalledRelease,
): Promise<ChangeProjectEditorResult> {
    const { configDir } = getDefaultDirs();
    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);
    const { install_location: installLocation } = await getUserPreferences();

    for (let attempt = 0; attempt < PROJECT_EDITOR_MAX_ATTEMPTS; attempt++) {
        const { projects, version } =
            await getProjectsSnapshot(projectListPath);

        const projectIndex = projects.findIndex((p) => p.path === project.path);
        if (projectIndex === -1) {
            return {
                success: false,
                error: t('projects:changeEditor.errors.projectNotFound'),
            };
        }

        const currentProject = projects[projectIndex];

        if (
            currentProject.release.version === newRelease.version &&
            currentProject.release.mono === newRelease.mono
        ) {
            logger.warn(
                `Project already using the selected release, ${newRelease.version} - ${newRelease.mono ? 'mono' : ''}`,
            );
            return {
                success: true,
                projects,
            };
        }

        const config = getProjectDefinition(
            newRelease.version_number,
            DEFAULT_PROJECT_DEFINITION,
        );

        if (!config) {
            return {
                success: false,
                error: t('projects:changeEditor.errors.invalidEditorVersion'),
            };
        }

        if (
            parseInt(currentProject.version_number.toString(), 10) !==
            parseInt(newRelease.version_number.toString(), 10)
        ) {
            return {
                success: false,
                error: t('projects:changeEditor.errors.differentMajorVersion'),
            };
        }

        const projectEditorPath = path.resolve(
            installLocation,
            EDITOR_CONFIG_DIRNAME,
            currentProject.name,
        );

        const newLaunchPath = await SetProjectEditorRelease(
            projectEditorPath,
            newRelease,
            currentProject.release,
        );
        const editorSettingsFilename = config.editorConfigFilename(
            newRelease.version_number,
        );
        const newEditorSettingsFile = path.resolve(
            path.dirname(currentProject.launch_path),
            'editor_data',
            editorSettingsFilename,
        );

        const tools = await getInstalledTools();
        const vsCodeTool = tools.find((t) => t.name === 'VSCode');

        if (currentProject.withVSCode && vsCodeTool) {
            const templatesDir = path.resolve(
                getAssetPath(),
                TEMPLATE_DIR_NAME,
            );
            const editorSettingsExists = fs.existsSync(newEditorSettingsFile);

            let vscodeSettingsPath = vsCodeTool.path;

            if (process.platform === 'darwin') {
                vscodeSettingsPath = path.resolve(
                    vscodeSettingsPath,
                    'Contents',
                    'MacOS',
                    'Electron',
                );
            }

            if (editorSettingsExists) {
                await updateEditorSettings(newEditorSettingsFile, {
                    execPath: vscodeSettingsPath,
                    execFlags: '{project} --goto {file}:{line}:{col}',
                    useExternalEditor: true,
                    isMono: newRelease.mono,
                });
            } else {
                await createNewEditorSettings(
                    templatesDir,
                    newLaunchPath,
                    editorSettingsFilename,
                    config.editorConfigFormat,
                    true,
                    vscodeSettingsPath,
                    '{project} --goto {file}:{line}:{col}',
                    newRelease.mono,
                );
            }

            await updateVSCodeSettings(
                project.path,
                newLaunchPath,
                newRelease.version_number,
                newRelease.mono,
            );

            await addOrUpdateVSCodeRecommendedExtensions(
                project.path,
                newRelease.mono,
            );

            if (newRelease.mono) {
                await addVSCodeNETLaunchConfig(project.path, newLaunchPath);
            }
        }

        const updatedProject: ProjectDetails = {
            ...currentProject,
            release: {
                ...newRelease,
                valid: true,
            },
            version: newRelease.version,
            version_number: newRelease.version_number,
            launch_path: newLaunchPath,
            editor_settings_path: path.resolve(
                path.dirname(newEditorSettingsFile),
            ),
            editor_settings_file: newEditorSettingsFile,
            valid: true,
        };

        const updatedProjects = [...projects];
        updatedProjects[projectIndex] = updatedProject;

        try {
            const storedProjects = await storeProjectsList(
                projectListPath,
                updatedProjects,
                { expectedVersion: version },
            );

            project.release = updatedProject.release;
            project.version = updatedProject.version;
            project.version_number = updatedProject.version_number;
            project.launch_path = updatedProject.launch_path;
            project.editor_settings_file = updatedProject.editor_settings_file;
            project.editor_settings_path = updatedProject.editor_settings_path;
            project.valid = updatedProject.valid;
            project.withVSCode = updatedProject.withVSCode;

            return {
                success: true,
                projects: storedProjects,
            };
        } catch (error) {
            if (
                error instanceof JsonStoreConflictError &&
                attempt < PROJECT_EDITOR_MAX_ATTEMPTS - 1
            ) {
                continue;
            }
            throw error;
        }
    }

    throw new Error(
        'Failed to update project editor due to concurrent modifications',
    );
}
