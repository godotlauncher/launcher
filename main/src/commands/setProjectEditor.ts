import * as path from 'node:path';
import type {
    ChangeProjectEditorResult,
    InstalledRelease,
    ProjectDetails,
} from '@shared/contracts';
import { app } from 'electron';
import logger from 'electron-log';
import type { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import { resolveCodeEditorProjectMode } from '../codeEditorIntegration/codeEditorProjectMode.js';
import { resolvePortableCodeEditorIdForWrite } from '../codeEditorIntegration/codeEditorProjectSidecar.js';
import { EDITOR_CONFIG_DIRNAME, PROJECTS_FILENAME } from '../constants.js';
import { t } from '../i18n/index.js';
import {
    DEFAULT_PROJECT_DEFINITION,
    getProjectDefinition,
    SetProjectEditorRelease,
} from '../utils/godot.utils.js';
import { JsonStoreConflictError } from '../utils/jsonStore.js';
import { getDefaultDirs } from '../utils/platform.utils.js';
import { writeProjectLauncherConfig } from '../utils/projectLauncherConfig.utils.js';
import {
    getProjectsSnapshot,
    storeProjectsList,
} from '../utils/projects.utils.js';
import { getUserPreferences } from './userPreferences.js';

const PROJECT_EDITOR_MAX_ATTEMPTS = 2;

function resolveProjectEditorPath(
    project: ProjectDetails,
    installLocation: string,
): string {
    if (project.launch_path) {
        return path.dirname(project.launch_path);
    }

    if (project.editor_settings_file) {
        return path.dirname(path.dirname(project.editor_settings_file));
    }

    if (project.editor_settings_path) {
        return path.dirname(project.editor_settings_path);
    }

    return path.resolve(installLocation, EDITOR_CONFIG_DIRNAME, project.name);
}

export async function setProjectEditor(
    project: ProjectDetails,
    newRelease: InstalledRelease,
    codeEditorIntegrationService: CodeEditorIntegrationService,
): Promise<ChangeProjectEditorResult> {
    const { configDir } = getDefaultDirs();
    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);
    const { install_location: installLocation } = await getUserPreferences();
    const recoveredCodeEditorConfigFiles = new Set<string>();

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
            currentProject.release.mono === newRelease.mono &&
            currentProject.release.editor_path === newRelease.editor_path &&
            currentProject.release.valid !== false
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

        const projectEditorPath = resolveProjectEditorPath(
            currentProject,
            installLocation,
        );

        const newLaunchPath = await SetProjectEditorRelease(
            projectEditorPath,
            newRelease,
            currentProject.release,
        );
        const editorSettingsFilename = config.editorConfigFilename(
            newRelease.version_number,
        );
        let newEditorSettingsFile = path.resolve(
            projectEditorPath,
            'editor_data',
            editorSettingsFilename,
        );

        if (currentProject.codeEditorId) {
            const installation =
                await codeEditorIntegrationService.scanIntegration(
                    currentProject.codeEditorId,
                );
            if (installation) {
                const applied =
                    await codeEditorIntegrationService.applyToProject(
                        currentProject.codeEditorId,
                        {
                            projectPath: currentProject.path,
                            godotLaunchPath: newLaunchPath,
                            godotVersion: newRelease.version_number,
                            mono: newRelease.mono,
                            editorSettingsFile: newEditorSettingsFile,
                            editorSettingsFilename,
                            editorSettingsFormat: config.editorConfigFormat,
                            configurationMode: 'update',
                        },
                    );
                newEditorSettingsFile = applied.editorSettingsFile;
                for (const recoveredFile of applied.recoveredConfigFiles) {
                    recoveredCodeEditorConfigFiles.add(recoveredFile);
                }
            }
        } else {
            await codeEditorIntegrationService.disableForProject(
                newEditorSettingsFile,
                newRelease.mono ? 'dotnet' : 'standard',
            );
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
            const codeEditorId = await resolvePortableCodeEditorIdForWrite(
                updatedProject.path,
                resolveCodeEditorProjectMode(updatedProject).codeEditorId,
                codeEditorIntegrationService,
            );
            await writeProjectLauncherConfig(updatedProject.path, {
                release: updatedProject.release,
                launcherVersion: app.getVersion(),
                lastOpened: updatedProject.last_opened,
                codeEditorId,
            });
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
            project.codeEditorId = updatedProject.codeEditorId;

            return {
                success: true,
                projects: storedProjects,
                recoveredCodeEditorConfigFiles:
                    recoveredCodeEditorConfigFiles.size > 0
                        ? [...recoveredCodeEditorConfigFiles]
                        : undefined,
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
