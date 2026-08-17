import {
    type ChildProcess,
    type ChildProcessByStdio,
    spawn,
} from 'node:child_process';
import * as path from 'node:path';
import type {
    GitIdentity,
    InitializeProjectGitResult,
    LaunchProjectOptions,
    LaunchProjectResult,
    ProjectDetails,
    ProjectGitIdentityResult,
    ProjectGitIdentityValue,
    RenameProjectOptions,
    RenameProjectResult,
} from '@shared/contracts';
import { app } from 'electron';
import logger from 'electron-log';
import { checkProjectValid } from '../checks.js';
import type { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import { PROJECTS_FILENAME } from '../constants.js';
import { updateLinuxTray } from '../helpers/tray.helper.js';
import { t } from '../i18n/index.js';
import { getMainWindow } from '../mainWindow.js';
import type { TrayAvailabilityService } from '../services/tray-availability.service.js';
import type { GitService } from '../tool-integration/integrations/git/git.service.js';
import { removeProjectEditor } from '../utils/godot.utils.js';
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

function isValidPinnedOrder(value: number | undefined): value is number {
    return value !== undefined && Number.isInteger(value) && value >= 0;
}

function getPinnedPathsInOrder(projects: ProjectDetails[]): string[] {
    return projects
        .filter((project) => project.pinned)
        .sort((a, b) => {
            const aOrder = isValidPinnedOrder(a.pinned_order)
                ? a.pinned_order
                : undefined;
            const bOrder = isValidPinnedOrder(b.pinned_order)
                ? b.pinned_order
                : undefined;
            const aHasOrder = aOrder !== undefined;
            const bHasOrder = bOrder !== undefined;

            if (
                aOrder !== undefined &&
                bOrder !== undefined &&
                aOrder !== bOrder
            ) {
                return aOrder - bOrder;
            }
            if (aHasOrder !== bHasOrder) {
                return aHasOrder ? -1 : 1;
            }

            const dateDifference =
                (b.last_opened?.getTime() ?? 0) -
                (a.last_opened?.getTime() ?? 0);
            return dateDifference || a.name.localeCompare(b.name);
        })
        .map((project) => project.path);
}

function applyPinnedOrder(
    projects: ProjectDetails[],
    orderedProjectPaths: string[],
): ProjectDetails[] {
    const orderByPath = new Map(
        orderedProjectPaths.map((projectPath, index) => [projectPath, index]),
    );

    return projects.map((project) => ({
        ...project,
        pinned_order: project.pinned
            ? orderByPath.get(project.path)
            : undefined,
    }));
}

function hasSameProjectPaths(left: string[], right: string[]): boolean {
    return (
        left.length === right.length &&
        new Set(left).size === left.length &&
        new Set(right).size === right.length &&
        left.every((projectPath) => right.includes(projectPath))
    );
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

    try {
        await writeProjectLauncherConfig(project.path, {
            release: project.release,
            launcherVersion: app.getVersion(),
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
    trayAvailabilityService: TrayAvailabilityService,
    options: LaunchProjectOptions = {},
): Promise<LaunchProjectResult> {
    if (project.codeEditorId && !options.allowMissingCodeEditor) {
        const integrationSettings =
            await codeEditorIntegrationService.rescanIntegration(
                project.codeEditorId,
            );

        if (!integrationSettings.installation) {
            return {
                launched: false,
                reason: 'code_editor_unavailable',
                integration: integrationSettings.integration,
            };
        }
    }

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
            await writeProjectLauncherConfig(storedProject.path, {
                release: storedProject.release,
                launcherVersion: app.getVersion(),
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
            if (!(await trayAvailabilityService.isAvailable())) {
                logger.info(
                    'System tray is unavailable; leaving the window visible after project launch',
                );
                break;
            }
            currentMainWindow?.hide();
            if (process.platform === 'darwin') {
                app.dock?.hide();
                app.setActivationPolicy('accessory');
            }
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

    return { launched: true };
}

/**
 * Revalidates one project for an application bridge request.
 *
 * @param project - Project details to validate.
 * @param gitService - Optional Git repository inspection service.
 * @returns The updated project details.
 */
export async function checkProjectIsValid(
    project: ProjectDetails,
    gitService?: GitService,
): Promise<ProjectDetails> {
    return await checkProjectValid(project, {}, gitService);
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

export async function setProjectPinned(
    project: ProjectDetails,
    pinned: boolean,
): Promise<ProjectDetails[]> {
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

        let updatedProjects = [...projects];
        updatedProjects[projectIndex] = {
            ...updatedProjects[projectIndex],
            pinned,
            pinned_order: undefined,
        };
        const currentPinnedPaths = getPinnedPathsInOrder(updatedProjects);
        const orderedPinnedPaths = pinned
            ? [
                  project.path,
                  ...currentPinnedPaths.filter(
                      (projectPath) => projectPath !== project.path,
                  ),
              ]
            : currentPinnedPaths;
        updatedProjects = applyPinnedOrder(updatedProjects, orderedPinnedPaths);

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
        return [];
    }
    ipcWebContentsSend(
        'projects-updated',
        getMainWindow()?.webContents,
        storedProjects,
    );

    return storedProjects;
}

export async function reorderPinnedProjects(
    orderedProjectPaths: string[],
): Promise<ProjectDetails[]> {
    const projectListPath = resolveProjectListPath();

    for (let attempt = 0; attempt < PROJECT_WRITE_MAX_ATTEMPTS; attempt++) {
        const { projects, version } =
            await getProjectsSnapshot(projectListPath);
        const currentPinnedPaths = getPinnedPathsInOrder(projects);

        if (!hasSameProjectPaths(currentPinnedPaths, orderedProjectPaths)) {
            throw new Error(t('projects:pinning.errors.orderChanged'));
        }

        const updatedProjects = applyPinnedOrder(projects, orderedProjectPaths);

        try {
            const storedProjects = await storeProjectsList(
                projectListPath,
                updatedProjects,
                { expectedVersion: version },
            );
            ipcWebContentsSend(
                'projects-updated',
                getMainWindow()?.webContents,
                storedProjects,
            );
            return storedProjects;
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

    throw new Error(t('projects:pinning.errors.orderChanged'));
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

export {
    resetProjectCodeEditorConfig,
    setProjectCodeEditor,
} from './projectCodeEditor.js';
/**
 * Initializes Git for an existing project and persists its updated metadata.
 *
 * @param project - Project selected for Git initialization.
 * @param gitService - Typed Git command service.
 * @returns The updated project details.
 */
export async function initializeProjectGit(
    project: ProjectDetails,
    gitService: GitService,
): Promise<InitializeProjectGitResult> {
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

        let inspection = await gitService.inspectRepository(targetProject.path);
        let gitSetup: InitializeProjectGitResult['gitSetup'];
        if (inspection.status === 'inside-work-tree') {
            gitSetup = {
                status: 'existing-repository',
                root: inspection.root,
                isProjectRoot: inspection.isProjectRoot,
                kind: inspection.kind,
            };
        } else if (inspection.status === 'not-a-repository') {
            if (!(await gitService.init(targetProject.path))) {
                inspection = await gitService.inspectRepository(
                    targetProject.path,
                );
                if (inspection.status !== 'inside-work-tree') {
                    throw new Error(t('projects:initGit.errors.initFailed'));
                }
                gitSetup = {
                    status: 'existing-repository',
                    root: inspection.root,
                    isProjectRoot: inspection.isProjectRoot,
                    kind: inspection.kind,
                };
            } else {
                inspection = await gitService.inspectRepository(
                    targetProject.path,
                );
                if (
                    inspection.status !== 'inside-work-tree' ||
                    !inspection.isProjectRoot
                ) {
                    throw new Error(t('projects:initGit.errors.initFailed'));
                }
                gitSetup = {
                    status: 'initialized',
                    root: inspection.root,
                    isProjectRoot: inspection.isProjectRoot,
                    kind: inspection.kind,
                };
            }
        } else {
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

            return { project: latestProject, gitSetup };
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

/**
 * Gets the effective Git identity for a stored project.
 *
 * @param project - Project selected in Launcher settings.
 * @param gitService - Typed Git command service.
 * @returns Effective identity values and whether local updates are allowed.
 */
export async function getProjectGitIdentity(
    project: ProjectDetails,
    gitService: GitService,
): Promise<ProjectGitIdentityResult> {
    const { projects } = await getProjectsSnapshot(resolveProjectListPath());
    const storedProject = projects.find((item) => item.path === project.path);
    if (!storedProject) {
        throw new Error(t('projects:initGit.errors.projectNotFound'));
    }

    const inspection = await gitService.inspectRepository(storedProject.path);
    if (inspection.status !== 'inside-work-tree') {
        return inspection;
    }

    const [effectiveIdentity, localIdentity] = await Promise.all([
        gitService.getIdentity(storedProject.path),
        gitService.getLocalIdentity(storedProject.path),
    ]);
    const identityValue = (
        effectiveValue: string,
        localValue: string,
    ): ProjectGitIdentityValue => ({
        value: effectiveValue,
        source: localValue
            ? 'repository'
            : effectiveValue
              ? 'inherited'
              : 'missing',
    });

    return {
        status: 'available',
        repository: inspection,
        name: identityValue(effectiveIdentity.name, localIdentity.name),
        email: identityValue(effectiveIdentity.email, localIdentity.email),
        canUpdate:
            inspection.isProjectRoot && inspection.kind !== 'linked-worktree',
    };
}

/**
 * Sets a repository-local Git identity for a stored project.
 *
 * @param project - Project selected in Launcher settings.
 * @param identity - Name and email to save in the project repository.
 * @param gitService - Typed Git command service.
 * @returns Refreshed effective identity values.
 */
export async function setProjectGitIdentity(
    project: ProjectDetails,
    identity: GitIdentity,
    gitService: GitService,
): Promise<ProjectGitIdentityResult> {
    const { projects } = await getProjectsSnapshot(resolveProjectListPath());
    const storedProject = projects.find((item) => item.path === project.path);
    if (!storedProject) {
        throw new Error(t('projects:initGit.errors.projectNotFound'));
    }

    const inspection = await gitService.inspectRepository(storedProject.path);
    if (
        inspection.status !== 'inside-work-tree' ||
        !inspection.isProjectRoot ||
        inspection.kind === 'linked-worktree'
    ) {
        throw new Error(
            t('projects:editProject.sourceControl.updateNotAllowed'),
        );
    }

    const saved = await gitService.setIdentity(
        identity.name,
        identity.email,
        'repository',
        storedProject.path,
    );
    if (!saved) {
        throw new Error(t('projects:editProject.sourceControl.updateFailed'));
    }

    return getProjectGitIdentity(storedProject, gitService);
}
