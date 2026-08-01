import {
    type ChildProcess,
    type ChildProcessByStdio,
    spawn,
} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
    CodeEditorId,
    ProjectDetails,
    RenameProjectOptions,
    RenameProjectResult,
    SetProjectCodeEditorResult,
} from '@shared/contracts';
import { app } from 'electron';
import logger from 'electron-log';
import { checkProjectValid } from '../checks.js';
import type { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import {
    resolveCodeEditorProjectMode,
    resolvePortableCodeEditorIdForWrite,
} from '../codeEditorIntegration/codeEditorProject.utils.js';
import { PROJECTS_FILENAME } from '../constants.js';
import { updateLinuxTray } from '../helpers/tray.helper.js';
import { t } from '../i18n/index.js';
import { getMainWindow } from '../mainWindow.js';
import { gitInit } from '../utils/git.utils.js';
import {
    DEFAULT_PROJECT_DEFINITION,
    getProjectDefinition,
    removeProjectEditor,
} from '../utils/godot.utils.js';
import {
    readGodotProjectName,
    updateGodotProjectName,
} from '../utils/godotProject.utils.js';
import { JsonStoreConflictError } from '../utils/jsonStore.js';
import { getDefaultDirs } from '../utils/platform.utils.js';
import { writeProjectLauncherConfig } from '../utils/projectLauncherConfig.utils.js';
import {
    getProjectsSnapshot,
    removeProjectFromList,
    storeProjectsList,
} from '../utils/projects.utils.js';
import { ipcWebContentsSend } from '../utils.js';
import { getUserPreferences } from './userPreferences.js';

const PROJECT_WRITE_MAX_ATTEMPTS = 2;

function resolveProjectListPath(): string {
    const { configDir } = getDefaultDirs();
    return path.resolve(configDir, PROJECTS_FILENAME);
}

export async function getProjectsDetails(): Promise<ProjectDetails[]> {
    const projectListPath = resolveProjectListPath();
    const { projects } = await getProjectsSnapshot(projectListPath);
    return projects;
}

export async function removeProject(
    project: ProjectDetails,
    codeEditorIntegrationService: CodeEditorIntegrationService,
): Promise<ProjectDetails[]> {
    const defaultDirs = getDefaultDirs();
    const { configDir } = defaultDirs;
    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);

    try {
        const codeEditorId = await resolvePortableCodeEditorIdForWrite(
            project.path,
            resolveCodeEditorProjectMode(project).codeEditorId,
            codeEditorIntegrationService,
        );
        await writeProjectLauncherConfig(project.path, {
            release: project.release,
            launcherVersion: app.getVersion(),
            lastOpened: project.last_opened,
            codeEditorId,
        });
    } catch (error) {
        logger.warn(
            `Failed to write project launcher config for '${project.name}' before removing it`,
            error,
        );
    }

    // remove .editor_settings link to godot
    // await removeEditorSymlink(project.launch_path);
    await removeProjectEditor(project);

    const projects = await removeProjectFromList(projectListPath, project.path);
    if (process.platform === 'linux') {
        await updateLinuxTray();
    }

    return projects;
}

export async function launchProject(
    project: ProjectDetails,
    codeEditorIntegrationService: CodeEditorIntegrationService,
): Promise<void> {
    const projectListPath = resolveProjectListPath();

    const prefs = await getUserPreferences();

    let persistedProjects: ProjectDetails[] | null = null;

    for (let attempt = 0; attempt < PROJECT_WRITE_MAX_ATTEMPTS; attempt++) {
        const { projects, version } =
            await getProjectsSnapshot(projectListPath);
        const projectIndex = projects.findIndex((p) => p.path === project.path);

        if (projectIndex === -1) {
            persistedProjects = projects;
            break;
        }

        const updatedProjects = [...projects];
        updatedProjects[projectIndex] = {
            ...updatedProjects[projectIndex],
            last_opened: new Date(),
        };

        try {
            persistedProjects = await storeProjectsList(
                projectListPath,
                updatedProjects,
                { expectedVersion: version },
            );
            break;
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

    if (!persistedProjects) {
        throw new Error('Failed to update project last opened time');
    }

    const projects = persistedProjects;
    const storedProject = projects.find((p) => p.path === project.path);

    if (storedProject) {
        project = storedProject;
        try {
            const codeEditorId = await resolvePortableCodeEditorIdForWrite(
                storedProject.path,
                resolveCodeEditorProjectMode(storedProject).codeEditorId,
                codeEditorIntegrationService,
            );
            await writeProjectLauncherConfig(storedProject.path, {
                release: storedProject.release,
                launcherVersion: app.getVersion(),
                lastOpened: storedProject.last_opened,
                codeEditorId,
            });
        } catch (error) {
            logger.warn(
                `Failed to write project launcher config for '${storedProject.name}'`,
                error,
            );
        }
    }

    const command = project.launch_path;

    let editor: ChildProcess | ChildProcessByStdio<null, null, null> | null =
        null;

    // const stdio = ['ignore', 'inherit', 'inherit'];

    if (process.platform === 'darwin') {
        // macOS
        const options = [command, '--args', '--path', project.path, '-e'];
        if (project.open_windowed) {
            options.push('-w');
        }

        editor = spawn('open', options, { detached: true, stdio: 'ignore' });
    } else {
        const options = ['--path', project.path, '-e'];
        if (project.open_windowed) {
            options.push('-w');
        }
        editor = spawn(command, options, { detached: true, stdio: 'ignore' });
    }

    editor.on('error', (err: Error) => {
        logger.error(`Failed to start process: ${err.message}`);
    });

    editor.on('exit', (code: number, signal: NodeJS.Signals | null) => {
        if (code !== 0 && code !== null) {
            logger.error(`Editor exited with error code ${code}`);
            logger.error(editor.stderr);
        } else if (signal) {
            logger.error(`Editor was killed by signal: ${signal}`);
        }
    });

    editor.unref();

    const currentMainWindow = getMainWindow();

    switch (prefs.post_launch_action) {
        case 'minimize':
            currentMainWindow?.minimize();
            break;
        case 'close_to_tray':
            currentMainWindow?.close();
            break;
    }

    if (process.platform === 'linux') {
        await updateLinuxTray();
    }

    ipcWebContentsSend(
        'projects-updated',
        currentMainWindow?.webContents,
        projects,
    );
}

export async function checkProjectIsValid(
    project: ProjectDetails,
): Promise<ProjectDetails> {
    return await checkProjectValid(project);
}

export async function setProjectWindowed(
    project: ProjectDetails,
    openWindowed: boolean,
): Promise<ProjectDetails> {
    project.open_windowed = openWindowed;

    const projectListPath = resolveProjectListPath();
    let storedProjects: ProjectDetails[] | null = null;

    for (let attempt = 0; attempt < PROJECT_WRITE_MAX_ATTEMPTS; attempt++) {
        const { projects, version } =
            await getProjectsSnapshot(projectListPath);
        const projectIndex = projects.findIndex((p) => p.path === project.path);

        if (projectIndex === -1) {
            storedProjects = projects;
            break;
        }

        const updatedProjects = [...projects];
        updatedProjects[projectIndex] = {
            ...updatedProjects[projectIndex],
            open_windowed: openWindowed,
        };

        try {
            storedProjects = await storeProjectsList(
                projectListPath,
                updatedProjects,
                { expectedVersion: version },
            );
            break;
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

    if (!storedProjects) {
        return project;
    }

    const updatedProject =
        storedProjects.find((p) => p.path === project.path) ?? project;
    ipcWebContentsSend(
        'projects-updated',
        getMainWindow()?.webContents,
        storedProjects,
    );

    return updatedProject;
}

function validateProjectName(name: string): RenameProjectResult | null {
    if (name.length === 0) {
        return {
            success: false,
            error: t('projects:renameProject.errors.nameRequired'),
            errorField: 'name',
        };
    }

    if (hasControlCharacters(name)) {
        return {
            success: false,
            error: t('projects:renameProject.errors.invalidName'),
            errorField: 'name',
        };
    }

    return null;
}

function hasControlCharacters(value: string): boolean {
    return Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || codePoint === 127;
    });
}

export async function getProjectGodotName(
    project: ProjectDetails,
): Promise<string | null> {
    return await readGodotProjectName(project.path);
}

export async function renameProject(
    project: ProjectDetails,
    options: RenameProjectOptions,
): Promise<RenameProjectResult> {
    const projectListPath = resolveProjectListPath();
    const newName = options.name.trim();
    const validationError = validateProjectName(newName);

    if (validationError) {
        return validationError;
    }

    for (let attempt = 0; attempt < PROJECT_WRITE_MAX_ATTEMPTS; attempt++) {
        const { projects, version } =
            await getProjectsSnapshot(projectListPath);
        const projectIndex = projects.findIndex((p) => p.path === project.path);

        if (projectIndex === -1) {
            return {
                success: false,
                error: t('projects:renameProject.errors.projectNotFound'),
            };
        }

        const duplicateProject = projects.find(
            (p) => p.path !== project.path && p.name === newName,
        );

        if (duplicateProject) {
            return {
                success: false,
                error: t('projects:renameProject.errors.nameExists', {
                    name: newName,
                }),
                errorField: 'name',
            };
        }

        if (options.renameGodotProject) {
            try {
                await updateGodotProjectName(
                    projects[projectIndex].path,
                    newName,
                );
            } catch (error) {
                return {
                    success: false,
                    error:
                        error instanceof Error ? error.message : String(error),
                    errorField: 'godot',
                };
            }
        }

        const updatedProject: ProjectDetails = {
            ...projects[projectIndex],
            name: newName,
        };
        const updatedProjects = [...projects];
        updatedProjects[projectIndex] = updatedProject;

        try {
            const storedProjects = await storeProjectsList(
                projectListPath,
                updatedProjects,
                { expectedVersion: version },
            );
            const latestProject =
                storedProjects.find((p) => p.path === updatedProject.path) ??
                updatedProject;

            project.name = latestProject.name;

            ipcWebContentsSend(
                'projects-updated',
                getMainWindow()?.webContents,
                storedProjects,
            );

            return {
                success: true,
                project: latestProject,
                projects: storedProjects,
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

    throw new Error('Failed to rename project due to concurrent modifications');
}

export async function setProjectCodeEditor(
    project: ProjectDetails,
    codeEditorId: CodeEditorId | null,
    codeEditorIntegrationService: CodeEditorIntegrationService,
): Promise<SetProjectCodeEditorResult> {
    const projectListPath = resolveProjectListPath();
    const recoveredCodeEditorConfigFiles = new Set<string>();

    for (let attempt = 0; attempt < PROJECT_WRITE_MAX_ATTEMPTS; attempt++) {
        const { projects, version } =
            await getProjectsSnapshot(projectListPath);
        const projectIndex = projects.findIndex((p) => p.path === project.path);

        if (projectIndex === -1) {
            throw new Error(t('projects:setCodeEditor.errors.projectNotFound'));
        }

        const updatedProjects = [...projects];
        const targetProject: ProjectDetails = {
            ...updatedProjects[projectIndex],
            release: { ...updatedProjects[projectIndex].release },
        };

        const currentCodeEditorId =
            resolveCodeEditorProjectMode(targetProject).codeEditorId;

        if (codeEditorId && currentCodeEditorId === codeEditorId) {
            return targetProject;
        }

        if (codeEditorId) {
            await codeEditorIntegrationService.assertIntegrationSelectable(
                codeEditorId,
            );

            if (!targetProject.launch_path) {
                throw new Error(
                    t('projects:setCodeEditor.errors.missingLaunchPath'),
                );
            }

            const projectDefinition = getProjectDefinition(
                targetProject.release.version_number,
                DEFAULT_PROJECT_DEFINITION,
            );

            if (!projectDefinition) {
                throw new Error(
                    t('projects:setCodeEditor.errors.invalidProjectDefinition'),
                );
            }

            const editorSettingsFilename =
                projectDefinition.editorConfigFilename(
                    targetProject.release.version_number,
                );
            let editorSettingsFile = targetProject.editor_settings_file;

            if (!editorSettingsFile) {
                editorSettingsFile = path.resolve(
                    path.dirname(targetProject.launch_path),
                    'editor_data',
                    editorSettingsFilename,
                );
            }

            const applied = await codeEditorIntegrationService.applyToProject(
                codeEditorId,
                {
                    projectPath: targetProject.path,
                    godotLaunchPath: targetProject.launch_path,
                    godotVersion: targetProject.release.version_number,
                    mono: targetProject.release.mono,
                    editorSettingsFile,
                    editorSettingsFilename,
                    editorSettingsFormat: projectDefinition.editorConfigFormat,
                },
            );

            targetProject.editor_settings_file = applied.editorSettingsFile;
            targetProject.editor_settings_path = path.dirname(
                applied.editorSettingsFile,
            );
            for (const recoveredFile of applied.recoveredConfigFiles) {
                recoveredCodeEditorConfigFiles.add(recoveredFile);
            }
        } else {
            await codeEditorIntegrationService.disableForProject(
                targetProject.editor_settings_file,
                targetProject.release.mono ? 'dotnet' : 'standard',
            );
        }

        targetProject.codeEditorId = codeEditorId;
        targetProject.withVSCode = codeEditorId === 'vscode';
        updatedProjects[projectIndex] = targetProject;

        try {
            await writeProjectLauncherConfig(targetProject.path, {
                release: targetProject.release,
                launcherVersion: app.getVersion(),
                lastOpened: targetProject.last_opened,
                codeEditorId,
            });

            const storedProjects = await storeProjectsList(
                projectListPath,
                updatedProjects,
                { expectedVersion: version },
            );
            const latestProject =
                storedProjects.find((p) => p.path === targetProject.path) ??
                targetProject;

            ipcWebContentsSend(
                'projects-updated',
                getMainWindow()?.webContents,
                storedProjects,
            );

            project.withVSCode = latestProject.withVSCode;
            project.codeEditorId = latestProject.codeEditorId;
            project.editor_settings_file = latestProject.editor_settings_file;
            project.editor_settings_path = latestProject.editor_settings_path;

            return {
                ...latestProject,
                recoveredCodeEditorConfigFiles:
                    recoveredCodeEditorConfigFiles.size > 0
                        ? [...recoveredCodeEditorConfigFiles]
                        : undefined,
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

    throw new Error('Failed to update code editor integration for project');
}

export async function initializeProjectGit(
    project: ProjectDetails,
): Promise<ProjectDetails> {
    const projectListPath = resolveProjectListPath();

    for (let attempt = 0; attempt < PROJECT_WRITE_MAX_ATTEMPTS; attempt++) {
        const { projects, version } =
            await getProjectsSnapshot(projectListPath);
        const projectIndex = projects.findIndex((p) => p.path === project.path);

        if (projectIndex === -1) {
            throw new Error(t('projects:initGit.errors.projectNotFound'));
        }

        const updatedProjects = [...projects];
        const targetProject: ProjectDetails = {
            ...updatedProjects[projectIndex],
            release: { ...updatedProjects[projectIndex].release },
        };

        if (targetProject.withGit) {
            return targetProject;
        }

        const gitInitialized = await gitInit(targetProject.path);
        const gitFolderExists = fs.existsSync(
            path.resolve(targetProject.path, '.git'),
        );

        if (!gitInitialized || !gitFolderExists) {
            throw new Error(t('projects:initGit.errors.initFailed'));
        }

        targetProject.withGit = true;
        updatedProjects[projectIndex] = targetProject;

        try {
            const storedProjects = await storeProjectsList(
                projectListPath,
                updatedProjects,
                { expectedVersion: version },
            );
            const latestProject =
                storedProjects.find((p) => p.path === targetProject.path) ??
                targetProject;

            ipcWebContentsSend(
                'projects-updated',
                getMainWindow()?.webContents,
                storedProjects,
            );

            project.withGit = latestProject.withGit;

            return latestProject;
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

    throw new Error('Failed to initialise git for project');
}
