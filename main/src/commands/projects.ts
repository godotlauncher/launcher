import {
    type ChildProcess,
    type ChildProcessByStdio,
    spawn,
} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
    ProjectDetails,
    RenameProjectOptions,
    RenameProjectResult,
    SetProjectVSCodeResult,
} from '@shared/contracts';
import { app } from 'electron';
import logger from 'electron-log';
import { checkProjectValid } from '../checks.js';
import { PROJECTS_FILENAME, TEMPLATE_DIR_NAME } from '../constants.js';
import { updateLinuxTray } from '../helpers/tray.helper.js';
import { t } from '../i18n/index.js';
import { getMainWindow } from '../mainWindow.js';
import { getAssetPath } from '../pathResolver.js';
import { getCachedTools } from '../services/toolCache.js';
import { gitInit } from '../utils/git.utils.js';
import {
    DEFAULT_PROJECT_DEFINITION,
    getProjectDefinition,
    removeProjectEditor,
} from '../utils/godot.utils.js';
import {
    createNewEditorSettings,
    readGodotProjectName,
    updateEditorSettings,
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
import {
    addOrUpdateVSCodeRecommendedExtensions,
    addVSCodeNETLaunchConfig,
    updateVSCodeSettings,
} from '../utils/vscode.utils.js';
import { ipcWebContentsSend } from '../utils.js';
import { getUserPreferences } from './userPreferences.js';

const PROJECT_WRITE_MAX_ATTEMPTS = 2;

function resolveProjectListPath(): string {
    const { configDir } = getDefaultDirs();
    return path.resolve(configDir, PROJECTS_FILENAME);
}

function toProjectRelativeDisplayPath(
    projectDir: string,
    filePath: string,
): string {
    return path
        .relative(projectDir, filePath)
        .split(path.sep)
        .join(path.posix.sep);
}

export async function getProjectsDetails(): Promise<ProjectDetails[]> {
    const projectListPath = resolveProjectListPath();
    const { projects } = await getProjectsSnapshot(projectListPath);
    return projects;
}

export async function removeProject(
    project: ProjectDetails,
): Promise<ProjectDetails[]> {
    const defaultDirs = getDefaultDirs();
    const { configDir } = defaultDirs;
    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);

    // remove .editor_settings link to godot
    // await removeEditorSymlink(project.launch_path);
    await removeProjectEditor(project);

    if (project.last_opened) {
        try {
            await writeProjectLauncherConfig(
                project.path,
                project.release,
                app.getVersion(),
                project.last_opened,
            );
        } catch (error) {
            logger.warn(
                `Failed to write project launcher config for '${project.name}' before removing it`,
                error,
            );
        }
    }

    const projects = await removeProjectFromList(projectListPath, project.path);
    if (process.platform === 'linux') {
        await updateLinuxTray();
    }

    return projects;
}

export async function launchProject(project: ProjectDetails): Promise<void> {
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
            await writeProjectLauncherConfig(
                storedProject.path,
                storedProject.release,
                app.getVersion(),
                storedProject.last_opened,
            );
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

export async function setProjectVSCode(
    project: ProjectDetails,
    enable: boolean,
): Promise<SetProjectVSCodeResult> {
    const projectListPath = resolveProjectListPath();
    const recoveredVSCodeConfigFiles = new Set<string>();

    for (let attempt = 0; attempt < PROJECT_WRITE_MAX_ATTEMPTS; attempt++) {
        const { projects, version } =
            await getProjectsSnapshot(projectListPath);
        const projectIndex = projects.findIndex((p) => p.path === project.path);

        if (projectIndex === -1) {
            throw new Error(t('projects:toggleVSCode.errors.projectNotFound'));
        }

        const updatedProjects = [...projects];
        const targetProject: ProjectDetails = {
            ...updatedProjects[projectIndex],
            release: { ...updatedProjects[projectIndex].release },
        };

        if (targetProject.withVSCode === enable) {
            return targetProject;
        }

        if (enable) {
            const cachedTools = await getCachedTools();
            const vsCodeTool = cachedTools.find(
                (t) => t.name === 'VSCode' && t.verified,
            );

            if (!vsCodeTool) {
                throw new Error(
                    t('projects:toggleVSCode.errors.vscodeNotInstalled'),
                );
            }

            if (!targetProject.launch_path) {
                throw new Error(
                    t('projects:toggleVSCode.errors.missingLaunchPath'),
                );
            }

            const projectDefinition = getProjectDefinition(
                targetProject.release.version_number,
                DEFAULT_PROJECT_DEFINITION,
            );

            if (!projectDefinition) {
                throw new Error(
                    t('projects:toggleVSCode.errors.invalidProjectDefinition'),
                );
            }

            const templatesDir = path.resolve(
                getAssetPath(),
                TEMPLATE_DIR_NAME,
            );

            let vscodeExecPath = vsCodeTool.path;
            if (process.platform === 'darwin') {
                vscodeExecPath = path.resolve(
                    vscodeExecPath,
                    'Contents',
                    'MacOS',
                    'Electron',
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

            if (fs.existsSync(editorSettingsFile)) {
                await updateEditorSettings(editorSettingsFile, {
                    execPath: vscodeExecPath,
                    execFlags: '{project} --goto {file}:{line}:{col}',
                    useExternalEditor: true,
                    isMono: targetProject.release.mono,
                });
            } else {
                const createdEditorSettings = await createNewEditorSettings(
                    templatesDir,
                    targetProject.launch_path,
                    editorSettingsFilename,
                    projectDefinition.editorConfigFormat,
                    true,
                    vscodeExecPath,
                    '{project} --goto {file}:{line}:{col}',
                    targetProject.release.mono,
                );
                editorSettingsFile = createdEditorSettings;
            }

            targetProject.editor_settings_file = editorSettingsFile;
            targetProject.editor_settings_path =
                path.dirname(editorSettingsFile);

            const recoveredSettingsFiles = await updateVSCodeSettings(
                targetProject.path,
                targetProject.launch_path,
                targetProject.release.version_number,
                targetProject.release.mono,
            );
            for (const recoveredFile of recoveredSettingsFiles ?? []) {
                recoveredVSCodeConfigFiles.add(
                    toProjectRelativeDisplayPath(
                        targetProject.path,
                        recoveredFile,
                    ),
                );
            }

            const recoveredExtensionFiles =
                await addOrUpdateVSCodeRecommendedExtensions(
                    targetProject.path,
                    targetProject.release.mono,
                );
            for (const recoveredFile of recoveredExtensionFiles ?? []) {
                recoveredVSCodeConfigFiles.add(
                    toProjectRelativeDisplayPath(
                        targetProject.path,
                        recoveredFile,
                    ),
                );
            }

            if (targetProject.release.mono) {
                const recoveredLaunchFiles = await addVSCodeNETLaunchConfig(
                    targetProject.path,
                    targetProject.launch_path,
                );
                for (const recoveredFile of recoveredLaunchFiles ?? []) {
                    recoveredVSCodeConfigFiles.add(
                        toProjectRelativeDisplayPath(
                            targetProject.path,
                            recoveredFile,
                        ),
                    );
                }
            }
        } else if (
            targetProject.editor_settings_file &&
            fs.existsSync(targetProject.editor_settings_file)
        ) {
            await updateEditorSettings(targetProject.editor_settings_file, {
                useExternalEditor: false,
            });
        }

        targetProject.withVSCode = enable;
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

            project.withVSCode = latestProject.withVSCode;
            project.editor_settings_file = latestProject.editor_settings_file;
            project.editor_settings_path = latestProject.editor_settings_path;

            return {
                ...latestProject,
                recoveredVSCodeConfigFiles:
                    recoveredVSCodeConfigFiles.size > 0
                        ? [...recoveredVSCodeConfigFiles]
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

    throw new Error('Failed to update VSCode integration for project');
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
