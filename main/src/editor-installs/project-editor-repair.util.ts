import * as path from 'node:path';
import type {
    ChangeProjectEditorResult,
    InstalledRelease,
    ProjectDetails,
} from '@shared/contracts';
import { app } from 'electron';
import logger from 'electron-log';
import type { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import { getUserPreferences } from '../commands/userPreferences.js';
import { EDITOR_CONFIG_DIRNAME } from '../constants.js';
import { t } from '../i18n/index.js';
import type { ProjectsStore } from '../projects/projects.store.js';
import {
    DEFAULT_PROJECT_DEFINITION,
    getProjectDefinition,
    SetProjectEditorRelease,
} from '../utils/godot.utils.js';
import { sanitiseProjectDirectoryName } from '../utils/projectDirectoryName.utils.js';
import { writeProjectLauncherConfig } from '../utils/projectLauncherConfig.utils.js';

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

    return path.resolve(
        installLocation,
        EDITOR_CONFIG_DIRNAME,
        sanitiseProjectDirectoryName(project.name),
    );
}

/**
 * Assigns an installed editor to one stored project.
 *
 * @param project - Project to update.
 * @param newRelease - Installed editor to assign.
 * @param codeEditorIntegrationService - Code editor integration facade.
 * @param projectsStore - Canonical project store.
 * @returns The bridge-compatible editor change result.
 */
export async function setProjectEditor(
    project: ProjectDetails,
    newRelease: InstalledRelease,
    codeEditorIntegrationService: CodeEditorIntegrationService,
    projectsStore: ProjectsStore,
): Promise<ChangeProjectEditorResult> {
    const { install_location: installLocation } = await getUserPreferences();
    const recoveredCodeEditorConfigFiles = new Set<string>();
    let failure: ChangeProjectEditorResult | undefined;
    let updatedProject: ProjectDetails | undefined;

    const projects = await projectsStore.update(async (currentProjects) => {
        const projectIndex = currentProjects.findIndex(
            (candidate) => candidate.path === project.path,
        );
        if (projectIndex === -1) {
            failure = {
                success: false,
                error: t('projects:changeEditor.errors.projectNotFound'),
            };
            return currentProjects;
        }

        const currentProject = currentProjects[projectIndex];

        if (
            currentProject.release.version === newRelease.version &&
            currentProject.release.mono === newRelease.mono &&
            currentProject.release.editor_path === newRelease.editor_path &&
            currentProject.release.valid !== false
        ) {
            logger.warn(
                `Project already using the selected release, ${newRelease.version} - ${newRelease.mono ? 'mono' : ''}`,
            );
            return currentProjects;
        }

        const config = getProjectDefinition(
            newRelease.version_number,
            DEFAULT_PROJECT_DEFINITION,
        );

        if (!config) {
            failure = {
                success: false,
                error: t('projects:changeEditor.errors.invalidEditorVersion'),
            };
            return currentProjects;
        }

        if (
            parseInt(currentProject.version_number.toString(), 10) !==
            parseInt(newRelease.version_number.toString(), 10)
        ) {
            failure = {
                success: false,
                error: t('projects:changeEditor.errors.differentMajorVersion'),
            };
            return currentProjects;
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

        updatedProject = {
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

        await writeProjectLauncherConfig(updatedProject.path, {
            release: updatedProject.release,
            launcherVersion: app.getVersion(),
        });
        const updatedProjects = [...currentProjects];
        updatedProjects[projectIndex] = updatedProject;
        return updatedProjects;
    });

    if (failure) {
        return failure;
    }

    const latestProject =
        projects.find((candidate) => candidate.path === project.path) ??
        updatedProject;
    if (latestProject) {
        project.release = latestProject.release;
        project.version = latestProject.version;
        project.version_number = latestProject.version_number;
        project.launch_path = latestProject.launch_path;
        project.editor_settings_file = latestProject.editor_settings_file;
        project.editor_settings_path = latestProject.editor_settings_path;
        project.valid = latestProject.valid;
        project.codeEditorId = latestProject.codeEditorId;
    }

    return {
        success: true,
        projects,
        recoveredCodeEditorConfigFiles:
            recoveredCodeEditorConfigFiles.size > 0
                ? [...recoveredCodeEditorConfigFiles]
                : undefined,
    };
}
