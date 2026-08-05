import path from 'node:path';
import type {
    CodeEditorId,
    ProjectDetails,
    SetProjectCodeEditorResult,
} from '@shared/contracts';
import type { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import { PROJECTS_FILENAME } from '../constants.js';
import { t } from '../i18n/index.js';
import { getMainWindow } from '../mainWindow.js';
import {
    DEFAULT_PROJECT_DEFINITION,
    getProjectDefinition,
} from '../utils/godot.utils.js';
import { JsonStoreConflictError } from '../utils/jsonStore.js';
import { getDefaultDirs } from '../utils/platform.utils.js';
import {
    getProjectsSnapshot,
    storeProjectsList,
} from '../utils/projects.utils.js';
import { ipcWebContentsSend } from '../utils.js';

const PROJECT_WRITE_MAX_ATTEMPTS = 2;

async function applyConfiguration(
    project: ProjectDetails,
    codeEditorId: CodeEditorId,
    previousCodeEditorId: CodeEditorId | null,
    service: CodeEditorIntegrationService,
): Promise<string[]> {
    await service.assertIntegrationSelectable(codeEditorId);

    if (!project.launch_path) {
        throw new Error(t('projects:setCodeEditor.errors.missingLaunchPath'));
    }

    const definition = getProjectDefinition(
        project.release.version_number,
        DEFAULT_PROJECT_DEFINITION,
    );
    if (!definition) {
        throw new Error(
            t('projects:setCodeEditor.errors.invalidProjectDefinition'),
        );
    }

    const settingsFilename = definition.editorConfigFilename(
        project.release.version_number,
    );
    const settingsFile =
        project.editor_settings_file ||
        path.resolve(
            path.dirname(project.launch_path),
            'editor_data',
            settingsFilename,
        );
    const applied = await service.applyToProject(codeEditorId, {
        projectPath: project.path,
        godotLaunchPath: project.launch_path,
        godotVersion: project.release.version_number,
        mono: project.release.mono,
        editorSettingsFile: settingsFile,
        editorSettingsFilename: settingsFilename,
        editorSettingsFormat: definition.editorConfigFormat,
        previousCodeEditorId,
    });

    project.editor_settings_file = applied.editorSettingsFile;
    project.editor_settings_path = path.dirname(applied.editorSettingsFile);
    return applied.recoveredConfigFiles;
}

async function updateProjectCodeEditor(
    project: ProjectDetails,
    requestedCodeEditorId: CodeEditorId | null,
    service: CodeEditorIntegrationService,
    reapply: boolean,
): Promise<SetProjectCodeEditorResult> {
    const projectListPath = path.resolve(
        getDefaultDirs().configDir,
        PROJECTS_FILENAME,
    );
    const recoveredFiles = new Set<string>();

    for (let attempt = 0; attempt < PROJECT_WRITE_MAX_ATTEMPTS; attempt++) {
        const { projects, version } =
            await getProjectsSnapshot(projectListPath);
        const projectIndex = projects.findIndex(
            (storedProject) => storedProject.path === project.path,
        );
        if (projectIndex === -1) {
            throw new Error(t('projects:setCodeEditor.errors.projectNotFound'));
        }

        const targetProject: ProjectDetails = {
            ...projects[projectIndex],
            release: { ...projects[projectIndex].release },
        };
        const currentCodeEditorId = targetProject.codeEditorId;
        const codeEditorId = reapply
            ? currentCodeEditorId
            : requestedCodeEditorId;

        if (reapply && !codeEditorId) {
            throw new Error(
                t('projects:setCodeEditor.errors.noEditorSelected'),
            );
        }
        if (!reapply && codeEditorId && currentCodeEditorId === codeEditorId) {
            return targetProject;
        }

        if (codeEditorId) {
            const recovered = await applyConfiguration(
                targetProject,
                codeEditorId,
                reapply ? null : currentCodeEditorId,
                service,
            );
            for (const recoveredFile of recovered) {
                recoveredFiles.add(recoveredFile);
            }
        } else {
            await service.disableForProject(
                targetProject.editor_settings_file,
                targetProject.release.mono ? 'dotnet' : 'standard',
            );
        }

        targetProject.codeEditorId = codeEditorId;
        const updatedProjects = [...projects];
        updatedProjects[projectIndex] = targetProject;

        try {
            const storedProjects = await storeProjectsList(
                projectListPath,
                updatedProjects,
                { expectedVersion: version },
            );
            const latestProject =
                storedProjects.find(
                    (storedProject) =>
                        storedProject.path === targetProject.path,
                ) ?? targetProject;

            ipcWebContentsSend(
                'projects-updated',
                getMainWindow()?.webContents,
                storedProjects,
            );
            project.codeEditorId = latestProject.codeEditorId;
            project.editor_settings_file = latestProject.editor_settings_file;
            project.editor_settings_path = latestProject.editor_settings_path;

            return {
                ...latestProject,
                recoveredCodeEditorConfigFiles:
                    recoveredFiles.size > 0 ? [...recoveredFiles] : undefined,
            };
        } catch (error) {
            if (
                error instanceof JsonStoreConflictError &&
                attempt < PROJECT_WRITE_MAX_ATTEMPTS - 1
            ) {
                continue;
            }
            throw error;
        }
    }

    throw new Error(
        reapply
            ? 'Failed to reset code editor configuration for project'
            : 'Failed to update code editor integration for project',
    );
}

export function setProjectCodeEditor(
    project: ProjectDetails,
    codeEditorId: CodeEditorId | null,
    service: CodeEditorIntegrationService,
): Promise<SetProjectCodeEditorResult> {
    return updateProjectCodeEditor(project, codeEditorId, service, false);
}

export function resetProjectCodeEditorConfig(
    project: ProjectDetails,
    service: CodeEditorIntegrationService,
): Promise<SetProjectCodeEditorResult> {
    return updateProjectCodeEditor(project, null, service, true);
}
