import type { ChildProcess, ChildProcessByStdio } from 'node:child_process';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type {
    AddProjectOptions,
    ChangeProjectEditorResult,
    CodeEditorId,
    CreateProjectGitOptions,
    CreateProjectPublicationOptions,
    CreateProjectResult,
    GitIdentity,
    InitializeProjectGitResult,
    InstalledRelease,
    LaunchProjectOptions,
    LaunchProjectResult,
    ProjectDetails,
    ProjectGitIdentityResult,
    ProjectGitIdentityValue,
    ProjectPublicationRecoveryAction,
    RemoteProjectImportRequest,
    RenameProjectOptions,
    RenameProjectResult,
    RendererType,
    ResolveRemoteProjectCloneAction,
    ResolveRemoteProjectCloneResult,
    SetProjectCodeEditorResult,
} from '@shared/contracts';
import { app } from 'electron';
import logger from 'electron-log';
import {
    checkAndUpdateProjectHealth,
    checkAndUpdateProjects,
    checkProjectHealth,
    hasProjectHealthChanged,
    type ProjectValidationOptions,
    checkProjectValid as validateProject,
} from '../checks.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import {
    exportProjectEditorSettings,
    importProjectEditorSettings,
} from '../commands/projectEditorSettings.js';
import { getUserPreferences } from '../commands/userPreferences.js';
import { EDITOR_CONFIG_DIRNAME } from '../constants.js';
import { updateLinuxTray } from '../helpers/tray.helper.js';
import { t } from '../i18n/index.js';
import { getMainWindow } from '../mainWindow.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { TrayAvailabilityService } from '../services/tray-availability.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitService } from '../tool-integration/integrations/git/git.service.js';
import {
    DEFAULT_PROJECT_DEFINITION,
    getProjectDefinition,
    removeProjectEditor,
    SetProjectEditorRelease,
} from '../utils/godot.utils.js';
import {
    readGodotProjectName,
    updateGodotProjectName,
} from '../utils/godotProject.utils.js';
import { sanitiseProjectDirectoryName } from '../utils/projectDirectoryName.utils.js';
import { writeProjectLauncherConfig } from '../utils/projectLauncherConfig.utils.js';
import { ipcWebContentsSend } from '../utils.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectCreationService } from './project-creation.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectImportService } from './project-import.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectPublicationService } from './project-publication.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectRemoteImportService } from './project-remote-import.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectRemoteSourceService } from './project-remote-source.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectRepositoryOriginIndexService } from './project-repository-origin-index.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectsStore } from './projects.store.js';

/** Provides the application-facing boundary for existing project workflows. */
@Injectable()
export class ProjectsService {
    /**
     * Creates the project service.
     *
     * @param codeEditors - Code editor integration facade.
     * @param projectImport - Transactional Add Project workflow.
     * @param git - Guarded Git command service.
     * @param projectCreation - Transactional Create Project workflow.
     * @param trayAvailability - System tray availability service.
     * @param store - Canonical project persistence store.
     * @param remoteSources - Remote project source discovery boundary.
     * @param remoteImport - Cancellable remote clone transaction boundary.
     * @param projectPublication - Follow-on remote publication and retry workflow.
     * @param projectOrigins - Process-local stored-project origin index.
     */
    constructor(
        private readonly codeEditors: CodeEditorIntegrationService,
        private readonly projectImport: ProjectImportService,
        private readonly git: GitService,
        private readonly projectCreation: ProjectCreationService,
        private readonly trayAvailability: TrayAvailabilityService,
        private readonly store: ProjectsStore,
        private readonly remoteSources: ProjectRemoteSourceService,
        private readonly remoteImport: ProjectRemoteImportService,
        private readonly projectPublication: ProjectPublicationService,
        private readonly projectOrigins: ProjectRepositoryOriginIndexService,
    ) {}

    /**
     * Clones and validates one remote project without registering it.
     *
     * @param request - Renderer-safe remote source and destination request.
     */
    importRemoteProject(request: RemoteProjectImportRequest) {
        return this.remoteImport.importRemoteProject(request);
    }

    /**
     * Cancels the active remote clone job.
     *
     * @param jobId - Exact process-local clone job ID.
     */
    cancelRemoteProjectImport(jobId: string) {
        return this.remoteImport.cancelRemoteProjectImport(jobId);
    }

    /**
     * Keeps or deletes the exact final clone owned by an import job.
     *
     * @param jobId - Exact process-local clone job ID.
     * @param action - Whether to retain the clone or delete it.
     */
    resolveRemoteProjectClone(
        jobId: string,
        action: ResolveRemoteProjectCloneAction,
    ): Promise<ResolveRemoteProjectCloneResult> {
        return this.remoteImport.resolveRemoteProjectClone(jobId, action);
    }

    /**
     * Sets repository-scoped Git identity for an unchanged imported clone.
     *
     * @param jobId - Exact process-local clone job ID.
     * @param identity - Complete identity to write to the clone.
     */
    setRemoteProjectGitIdentity(jobId: string, identity: GitIdentity) {
        return this.remoteImport.setRemoteProjectGitIdentity(jobId, identity);
    }

    /**
     * Initialises validated public submodules for one retained remote clone.
     *
     * @param jobId - Exact process-local clone job ID.
     */
    initialiseRemoteProjectSubmodules(jobId: string) {
        return this.remoteImport.initialiseRemoteProjectSubmodules(jobId);
    }

    /**
     * Inspects one anonymous public Git source.
     *
     * @param url - Anonymous HTTPS repository URL.
     */
    inspectPublicGitSource(url: string) {
        return this.remoteSources.inspectPublicGitSource(url);
    }

    /**
     * Lists one page of connected hosting repositories.
     *
     * @param providerId - Registered hosting provider ID.
     * @param cursor - Optional opaque browse cursor.
     */
    listConnectedRepositories(providerId: string, cursor?: string) {
        return this.remoteSources.listConnectedRepositories(providerId, cursor);
    }

    /** Gets every stored project. */
    getProjectsDetails() {
        return this.store.list();
    }

    /** Refreshes safe GitHub links for the current stored projects. */
    refreshProjectGitHubLinks() {
        return this.projectOrigins.refreshGitHubLinks();
    }

    /**
     * Lists current owner routes eligible for Create Project publishing.
     *
     * @param providerId - Registered repository provider ID.
     */
    listCreateProjectPublicationTargets(providerId: string) {
        return this.projectPublication.listTargets(providerId);
    }

    /**
     * Checks whether one selected owner visibly contains a repository name.
     *
     * @param publication - Renderer-safe owner route and repository name.
     */
    checkCreateProjectRepositoryNameAvailability(
        publication: CreateProjectPublicationOptions,
    ) {
        return this.projectPublication.checkRepositoryNameAvailability(
            publication,
        );
    }

    /**
     * Creates and registers a project.
     *
     * @param name - Display name for the new project.
     * @param release - Godot editor assigned to the project.
     * @param renderer - Godot renderer selected for the project.
     * @param codeEditorId - Optional code editor integration.
     * @param withGit - Whether Git setup is requested.
     * @param overwriteProjectPath - Optional existing target to replace.
     * @param gitOptions - Optional initial commit, identity, and Git LFS choices.
     * @param publication - Optional private repository publication request.
     */
    async createProject(
        name: string,
        release: InstalledRelease,
        renderer: RendererType[5],
        codeEditorId: CodeEditorId | null,
        withGit: boolean,
        overwriteProjectPath?: string,
        gitOptions?: CreateProjectGitOptions,
        publication?: CreateProjectPublicationOptions,
    ): Promise<CreateProjectResult> {
        if (publication && (!withGit || gitOptions?.initialCommit === 'skip')) {
            return {
                success: false,
                error: t('createProject:publishToGitHub.requiresInitialCommit'),
                publication: { status: 'not-requested' as const },
            };
        }
        const result = await this.projectCreation.createProject(
            name,
            release,
            renderer,
            codeEditorId,
            withGit,
            overwriteProjectPath,
            gitOptions,
        );
        if (!publication || !result.success || !result.projectDetails) {
            return {
                ...result,
                publication: { status: 'not-requested' as const },
            };
        }
        const publicationOutcome = await this.projectPublication.publish(
            result.projectDetails,
            publication,
            result.gitLfsSetup?.status === 'configured',
        );
        return publicationOutcome.status === 'published'
            ? { ...result, publication: publicationOutcome }
            : {
                  ...result,
                  success: false,
                  error: t('createProject:publishToGitHub.publicationFailed'),
                  publication: publicationOutcome,
              };
    }

    /**
     * Retries one process-local publication attempt for its exact project.
     *
     * @param attemptId - Opaque failed publication attempt ID.
     * @param publication - Optional edited selection before remote creation.
     * @param recoveryAction - Exact uncertain-recovery action shown by main.
     */
    async retryCreateProjectPublication(
        attemptId: string,
        publication?: CreateProjectPublicationOptions,
        recoveryAction?: ProjectPublicationRecoveryAction,
    ): Promise<CreateProjectResult> {
        const result = await this.projectPublication.retry(
            attemptId,
            publication,
            recoveryAction,
        );
        if (!result) {
            return {
                success: false,
                error: t('createProject:publishToGitHub.attemptExpired'),
                publication: { status: 'not-requested' as const },
            };
        }
        const success = result.publication.status === 'published';
        return {
            success,
            projectPath: result.projectDetails.path,
            projectDetails: result.projectDetails,
            publication: result.publication,
            ...(success
                ? {}
                : {
                      error: t(
                          'createProject:publishToGitHub.publicationFailed',
                      ),
                  }),
        };
    }

    /**
     * Discards one process-local retry attempt without changing repositories.
     *
     * @param attemptId - Opaque failed publication attempt ID.
     */
    async discardCreateProjectPublication(attemptId: string): Promise<void> {
        this.projectPublication.discard(attemptId);
    }

    /**
     * Removes one project from Launcher without deleting its directory.
     *
     * @param project - Project to remove.
     */
    async removeProject(project: ProjectDetails) {
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

        await removeProjectEditor(project);
        const projects = await this.store.remove(project.path);
        this.publishProjects(projects);

        if (process.platform === 'linux') {
            await updateLinuxTray();
        }

        return projects;
    }

    /**
     * Renames a project and optionally its Godot project name.
     *
     * @param project - Project to rename.
     * @param options - New name and Godot project update choice.
     */
    async renameProject(
        project: ProjectDetails,
        options: RenameProjectOptions,
    ) {
        const newName = options.name.trim();
        const validationError = validateProjectName(newName);

        if (validationError) {
            return validationError;
        }

        let updatedProject: ProjectDetails | undefined;
        let failure: RenameProjectResult | undefined;
        const projects = await this.store.update(async (currentProjects) => {
            const projectIndex = currentProjects.findIndex(
                (candidate) => candidate.path === project.path,
            );

            if (projectIndex === -1) {
                failure = {
                    success: false,
                    error: t('projects:renameProject.errors.projectNotFound'),
                };
                return currentProjects;
            }

            if (
                currentProjects.some(
                    (candidate) =>
                        candidate.path !== project.path &&
                        candidate.name === newName,
                )
            ) {
                failure = {
                    success: false,
                    error: t('projects:renameProject.errors.nameExists', {
                        name: newName,
                    }),
                    errorField: 'name',
                };
                return currentProjects;
            }

            if (options.renameGodotProject) {
                try {
                    await updateGodotProjectName(
                        currentProjects[projectIndex].path,
                        newName,
                    );
                } catch (error) {
                    failure = {
                        success: false,
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                        errorField: 'godot',
                    };
                    return currentProjects;
                }
            }

            updatedProject = {
                ...currentProjects[projectIndex],
                name: newName,
            };
            const updatedProjects = [...currentProjects];
            updatedProjects[projectIndex] = updatedProject;
            return updatedProjects;
        });

        if (failure) {
            return failure;
        }

        if (!updatedProject) {
            throw new Error('Failed to rename project');
        }

        const latestProject =
            projects.find((candidate) => candidate.path === project.path) ??
            updatedProject;
        project.name = latestProject.name;
        this.publishProjects(projects);

        return {
            success: true,
            project: latestProject,
            projects,
        };
    }

    /**
     * Reads the project name stored in project.godot.
     *
     * @param project - Project whose Godot name is required.
     */
    getProjectGodotName(project: ProjectDetails) {
        return readGodotProjectName(project.path);
    }

    /**
     * Adds an existing project through the current characterized workflow.
     *
     * @param projectPath - Selected project file or directory path.
     * @param options - Optional missing-editor resolution.
     */
    addProject(projectPath: string, options?: AddProjectOptions) {
        return this.projectImport.addProject(projectPath, options);
    }

    /**
     * Changes the Godot editor assigned to a project.
     *
     * @param project - Project to update.
     * @param release - Godot editor to assign.
     */
    async setProjectEditor(
        project: ProjectDetails,
        release: InstalledRelease,
    ): Promise<ChangeProjectEditorResult> {
        const { install_location: installLocation } =
            await getUserPreferences();
        const recoveredFiles = new Set<string>();
        let failure: ChangeProjectEditorResult | undefined;
        let updatedProject: ProjectDetails | undefined;

        const projects = await this.store.update(async (currentProjects) => {
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
                currentProject.release.version === release.version &&
                currentProject.release.mono === release.mono &&
                currentProject.release.editor_path === release.editor_path &&
                currentProject.release.valid !== false
            ) {
                logger.warn(
                    `Project already using the selected release, ${release.version} - ${release.mono ? 'mono' : ''}`,
                );
                return currentProjects;
            }

            const config = getProjectDefinition(
                release.version_number,
                DEFAULT_PROJECT_DEFINITION,
            );
            if (!config) {
                failure = {
                    success: false,
                    error: t(
                        'projects:changeEditor.errors.invalidEditorVersion',
                    ),
                };
                return currentProjects;
            }
            if (
                parseInt(currentProject.version_number.toString(), 10) !==
                parseInt(release.version_number.toString(), 10)
            ) {
                failure = {
                    success: false,
                    error: t(
                        'projects:changeEditor.errors.differentMajorVersion',
                    ),
                };
                return currentProjects;
            }

            const projectEditorPath = resolveProjectEditorPath(
                currentProject,
                installLocation,
            );
            const newLaunchPath = await SetProjectEditorRelease(
                projectEditorPath,
                release,
                currentProject.release,
            );
            const editorSettingsFilename = config.editorConfigFilename(
                release.version_number,
            );
            let newEditorSettingsFile = path.resolve(
                projectEditorPath,
                'editor_data',
                editorSettingsFilename,
            );

            if (currentProject.codeEditorId) {
                const installation = await this.codeEditors.scanIntegration(
                    currentProject.codeEditorId,
                );
                if (installation) {
                    const applied = await this.codeEditors.applyToProject(
                        currentProject.codeEditorId,
                        {
                            projectPath: currentProject.path,
                            godotLaunchPath: newLaunchPath,
                            godotVersion: release.version_number,
                            mono: release.mono,
                            editorSettingsFile: newEditorSettingsFile,
                            editorSettingsFilename,
                            editorSettingsFormat: config.editorConfigFormat,
                        },
                    );
                    newEditorSettingsFile = applied.editorSettingsFile;
                    for (const recoveredFile of applied.recoveredConfigFiles) {
                        recoveredFiles.add(recoveredFile);
                    }
                }
            } else {
                await this.codeEditors.disableForProject(
                    newEditorSettingsFile,
                    release.mono ? 'dotnet' : 'standard',
                );
            }

            updatedProject = {
                ...currentProject,
                release: { ...release, valid: true },
                version: release.version,
                version_number: release.version_number,
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
                recoveredFiles.size > 0 ? [...recoveredFiles] : undefined,
        };
    }

    /**
     * Changes whether a project opens in windowed mode.
     *
     * @param project - Project to update.
     * @param openWindowed - Whether to request windowed mode.
     */
    async setProjectWindowed(project: ProjectDetails, openWindowed: boolean) {
        project.open_windowed = openWindowed;
        const projects = await this.store.update((currentProjects) =>
            currentProjects.map((candidate) =>
                candidate.path === project.path
                    ? { ...candidate, open_windowed: openWindowed }
                    : candidate,
            ),
        );
        const updatedProject =
            projects.find((candidate) => candidate.path === project.path) ??
            project;
        this.publishProjects(projects);
        return updatedProject;
    }

    /**
     * Changes whether a project is pinned.
     *
     * @param project - Project to update.
     * @param pinned - Whether the project should be pinned.
     */
    async setProjectPinned(project: ProjectDetails, pinned: boolean) {
        const projects = await this.store.update((currentProjects) => {
            const projectIndex = currentProjects.findIndex(
                (candidate) => candidate.path === project.path,
            );
            if (projectIndex === -1) {
                return currentProjects;
            }

            let updatedProjects = [...currentProjects];
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
            updatedProjects = applyPinnedOrder(
                updatedProjects,
                orderedPinnedPaths,
            );
            return updatedProjects;
        });
        this.publishProjects(projects);
        return projects;
    }

    /**
     * Reorders the pinned projects.
     *
     * @param orderedProjectPaths - Pinned project paths in display order.
     */
    async reorderPinnedProjects(orderedProjectPaths: string[]) {
        const projects = await this.store.update((currentProjects) => {
            const currentPinnedPaths = getPinnedPathsInOrder(currentProjects);
            if (!hasSameProjectPaths(currentPinnedPaths, orderedProjectPaths)) {
                throw new Error(t('projects:pinning.errors.orderChanged'));
            }
            return applyPinnedOrder(currentProjects, orderedProjectPaths);
        });
        this.publishProjects(projects);
        return projects;
    }

    /**
     * Changes the code editor assigned to a project.
     *
     * @param project - Project to update.
     * @param codeEditorId - Code editor to assign, or null to disable it.
     */
    setProjectCodeEditor(
        project: ProjectDetails,
        codeEditorId: CodeEditorId | null,
    ) {
        return this.updateProjectCodeEditor(project, codeEditorId, false);
    }

    /**
     * Resets Launcher-owned code editor configuration for a project.
     *
     * @param project - Project whose configuration should be reset.
     */
    resetProjectCodeEditorConfig(project: ProjectDetails) {
        return this.updateProjectCodeEditor(project, null, true);
    }

    /**
     * Initializes or detects the Git repository for a project.
     *
     * @param project - Project to inspect or initialize.
     */
    async initializeProjectGit(project: ProjectDetails) {
        let gitSetup: InitializeProjectGitResult['gitSetup'] | undefined;
        let updatedProject: ProjectDetails | undefined;

        const projects = await this.store.update(async (currentProjects) => {
            const projectIndex = currentProjects.findIndex(
                (candidate) => candidate.path === project.path,
            );
            if (projectIndex === -1) {
                throw new Error(t('projects:initGit.errors.projectNotFound'));
            }

            const targetProject: ProjectDetails = {
                ...currentProjects[projectIndex],
                release: { ...currentProjects[projectIndex].release },
            };
            let inspection = await this.git.inspectRepository(
                targetProject.path,
            );

            if (inspection.status === 'inside-work-tree') {
                gitSetup = {
                    status: 'existing-repository',
                    root: inspection.root,
                    isProjectRoot: inspection.isProjectRoot,
                    kind: inspection.kind,
                };
            } else if (inspection.status === 'not-a-repository') {
                if (!(await this.git.init(targetProject.path))) {
                    inspection = await this.git.inspectRepository(
                        targetProject.path,
                    );
                    if (inspection.status !== 'inside-work-tree') {
                        throw new Error(
                            t('projects:initGit.errors.initFailed'),
                        );
                    }
                    gitSetup = {
                        status: 'existing-repository',
                        root: inspection.root,
                        isProjectRoot: inspection.isProjectRoot,
                        kind: inspection.kind,
                    };
                } else {
                    inspection = await this.git.inspectRepository(
                        targetProject.path,
                    );
                    if (
                        inspection.status !== 'inside-work-tree' ||
                        !inspection.isProjectRoot
                    ) {
                        throw new Error(
                            t('projects:initGit.errors.initFailed'),
                        );
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
            updatedProject = targetProject;
            const updatedProjects = [...currentProjects];
            updatedProjects[projectIndex] = targetProject;
            return updatedProjects;
        });

        const latestProject =
            projects.find((candidate) => candidate.path === project.path) ??
            updatedProject;
        if (!latestProject || !gitSetup) {
            throw new Error('Failed to initialise git for project');
        }

        project.withGit = latestProject.withGit;
        this.publishProjects(projects);
        return { project: latestProject, gitSetup };
    }

    /**
     * Gets effective Git identity values for a project.
     *
     * @param project - Project whose Git identity is required.
     */
    async getProjectGitIdentity(
        project: ProjectDetails,
    ): Promise<ProjectGitIdentityResult> {
        const storedProject = (await this.store.list()).find(
            (candidate) => candidate.path === project.path,
        );
        if (!storedProject) {
            throw new Error(t('projects:initGit.errors.projectNotFound'));
        }

        const inspection = await this.git.inspectRepository(storedProject.path);
        if (inspection.status !== 'inside-work-tree') {
            return inspection;
        }

        const [effectiveIdentity, localIdentity] = await Promise.all([
            this.git.getIdentity(storedProject.path),
            this.git.getLocalIdentity(storedProject.path),
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
                inspection.isProjectRoot &&
                inspection.kind !== 'linked-worktree',
        };
    }

    /**
     * Saves repository-scoped Git identity for a project.
     *
     * @param project - Project whose repository should be configured.
     * @param identity - Git identity to save.
     */
    async setProjectGitIdentity(
        project: ProjectDetails,
        identity: GitIdentity,
    ): Promise<ProjectGitIdentityResult> {
        const storedProject = (await this.store.list()).find(
            (candidate) => candidate.path === project.path,
        );
        if (!storedProject) {
            throw new Error(t('projects:initGit.errors.projectNotFound'));
        }

        const inspection = await this.git.inspectRepository(storedProject.path);
        if (
            inspection.status !== 'inside-work-tree' ||
            !inspection.isProjectRoot ||
            inspection.kind === 'linked-worktree'
        ) {
            throw new Error(
                t('projects:editProject.sourceControl.updateNotAllowed'),
            );
        }

        const saved = await this.git.setIdentity(
            identity.name,
            identity.email,
            'repository',
            storedProject.path,
        );
        if (!saved) {
            throw new Error(
                t('projects:editProject.sourceControl.updateFailed'),
            );
        }

        return this.getProjectGitIdentity(storedProject);
    }

    /**
     * Exports the Godot editor settings for a project.
     *
     * @param project - Project whose settings should be exported.
     */
    exportProjectEditorSettings(project: ProjectDetails) {
        return exportProjectEditorSettings(project);
    }

    /**
     * Imports Godot editor settings into a project.
     *
     * @param project - Project that receives the imported settings.
     */
    importProjectEditorSettings(project: ProjectDetails) {
        return importProjectEditorSettings(project);
    }

    /**
     * Launches a project with its configured post-launch action.
     *
     * @param project - Project to launch.
     * @param options - Optional launch overrides.
     */
    async launchProject(
        project: ProjectDetails,
        options: LaunchProjectOptions = {},
    ): Promise<LaunchProjectResult> {
        const currentProject = (await this.store.list()).find(
            (candidate) => candidate.path === project.path,
        );
        const checkedProject = await checkProjectHealth(
            currentProject ?? project,
        );
        if (
            hasProjectHealthChanged(currentProject ?? project, checkedProject)
        ) {
            const updatedProjects = await this.store.update((currentProjects) =>
                currentProjects.map((candidate) =>
                    candidate.path === checkedProject.path
                        ? checkedProject
                        : candidate,
                ),
            );
            this.publishProjects(updatedProjects);
        }
        project = checkedProject;

        if (!project.valid) {
            return {
                launched: false,
                reason: 'project_unavailable',
                project,
            };
        }

        if (project.codeEditorId && !options.allowMissingCodeEditor) {
            const integrationSettings =
                await this.codeEditors.rescanIntegration(project.codeEditorId);
            if (!integrationSettings.installation) {
                return {
                    launched: false,
                    reason: 'code_editor_unavailable',
                    integration: integrationSettings.integration,
                };
            }
        }

        const prefs = await getUserPreferences();
        const projects = await this.store.update((currentProjects) =>
            currentProjects.map((candidate) =>
                candidate.path === project.path
                    ? { ...candidate, last_opened: new Date() }
                    : candidate,
            ),
        );
        const launchedProject = projects.find(
            (candidate) => candidate.path === project.path,
        );

        if (launchedProject) {
            project = launchedProject;
            try {
                await writeProjectLauncherConfig(launchedProject.path, {
                    release: launchedProject.release,
                    launcherVersion: app.getVersion(),
                });
            } catch (error) {
                logger.warn(
                    `Failed to write project launcher config for '${launchedProject.name}'`,
                    error,
                );
            }
        }

        const command = project.launch_path;
        let editor: ChildProcess | ChildProcessByStdio<null, null, null>;

        if (process.platform === 'darwin') {
            const launchArguments = [
                command,
                '--args',
                '--path',
                project.path,
                '-e',
            ];
            if (project.open_windowed) {
                launchArguments.push('-w');
            }
            editor = spawn('open', launchArguments, {
                detached: true,
                stdio: 'ignore',
            });
        } else {
            const launchArguments = ['--path', project.path, '-e'];
            if (project.open_windowed) {
                launchArguments.push('-w');
            }
            editor = spawn(command, launchArguments, {
                detached: true,
                stdio: 'ignore',
            });
        }

        editor.on('error', (error: Error) => {
            logger.error(`Failed to start process: ${error.message}`);
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
                if (!(await this.trayAvailability.isAvailable())) {
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

        this.publishProjects(projects);
        return { launched: true };
    }

    /**
     * Revalidates one project.
     *
     * @param project - Project to validate.
     */
    checkProjectValid(project: ProjectDetails) {
        return validateProject(project, {}, this.git);
    }

    /**
     * Revalidates and persists every project.
     *
     * @param options - Optional validation behaviour for internal consumers.
     */
    async checkAllProjectsValid(options: ProjectValidationOptions = {}) {
        const projects = await checkAndUpdateProjects(
            options,
            this.git,
            this.store,
        );
        if (options.publishResult) {
            this.publishProjects(projects);
        }
        return projects;
    }

    /** Quickly refreshes renderer-visible health for every stored project. */
    async refreshProjectHealth(): Promise<void> {
        const result = await checkAndUpdateProjectHealth(this.store);
        if (result.changed) {
            this.publishProjects(result.projects);
        }
    }

    /**
     * Applies or reapplies a code editor selection and persists the project.
     *
     * @param project - Project to update.
     * @param requestedCodeEditorId - Requested editor, or null to disable it.
     * @param reapply - Whether to reapply the existing selection.
     */
    private async updateProjectCodeEditor(
        project: ProjectDetails,
        requestedCodeEditorId: CodeEditorId | null,
        reapply: boolean,
    ): Promise<SetProjectCodeEditorResult> {
        const recoveredFiles = new Set<string>();
        let updatedProject: ProjectDetails | undefined;
        let unchanged = false;

        const projects = await this.store.update(async (currentProjects) => {
            const projectIndex = currentProjects.findIndex(
                (candidate) => candidate.path === project.path,
            );
            if (projectIndex === -1) {
                throw new Error(
                    t('projects:setCodeEditor.errors.projectNotFound'),
                );
            }

            const targetProject: ProjectDetails = {
                ...currentProjects[projectIndex],
                release: { ...currentProjects[projectIndex].release },
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
            if (
                !reapply &&
                codeEditorId &&
                currentCodeEditorId === codeEditorId
            ) {
                unchanged = true;
                updatedProject = targetProject;
                return currentProjects;
            }

            if (codeEditorId) {
                const recovered = await this.applyCodeEditorConfiguration(
                    targetProject,
                    codeEditorId,
                    reapply ? null : currentCodeEditorId,
                );
                for (const recoveredFile of recovered) {
                    recoveredFiles.add(recoveredFile);
                }
            } else {
                await this.codeEditors.disableForProject(
                    targetProject.editor_settings_file,
                    targetProject.release.mono ? 'dotnet' : 'standard',
                );
            }

            targetProject.codeEditorId = codeEditorId;
            updatedProject = targetProject;
            const updatedProjects = [...currentProjects];
            updatedProjects[projectIndex] = targetProject;
            return updatedProjects;
        });

        const latestProject =
            projects.find((candidate) => candidate.path === project.path) ??
            updatedProject;
        if (!latestProject) {
            throw new Error(t('projects:setCodeEditor.errors.projectNotFound'));
        }

        if (!unchanged) {
            this.publishProjects(projects);
        }
        project.codeEditorId = latestProject.codeEditorId;
        project.editor_settings_file = latestProject.editor_settings_file;
        project.editor_settings_path = latestProject.editor_settings_path;

        return {
            ...latestProject,
            recoveredCodeEditorConfigFiles:
                recoveredFiles.size > 0 ? [...recoveredFiles] : undefined,
        };
    }

    /**
     * Applies one code editor integration to a project configuration.
     *
     * @param project - Project configuration to update.
     * @param codeEditorId - Code editor integration to apply.
     * @param previousCodeEditorId - Previously configured integration.
     */
    private async applyCodeEditorConfiguration(
        project: ProjectDetails,
        codeEditorId: CodeEditorId,
        previousCodeEditorId: CodeEditorId | null,
    ): Promise<string[]> {
        await this.codeEditors.assertIntegrationSelectable(codeEditorId);

        if (!project.launch_path) {
            throw new Error(
                t('projects:setCodeEditor.errors.missingLaunchPath'),
            );
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
        const applied = await this.codeEditors.applyToProject(codeEditorId, {
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

    /**
     * Publishes a successfully persisted project list to the renderer.
     *
     * @param projects - Final persisted project list.
     */
    private publishProjects(projects: ProjectDetails[]): void {
        const webContents = getMainWindow()?.webContents;
        if (!webContents || webContents.isDestroyed?.()) {
            return;
        }
        ipcWebContentsSend('projects-updated', webContents, projects);
    }
}

/**
 * Validates a project display name.
 *
 * @param name - Trimmed project name.
 * @returns A bridge-compatible validation failure, or null.
 */
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

/**
 * Checks whether a value contains ASCII control characters.
 *
 * @param value - Value to inspect.
 * @returns Whether the value contains a control character.
 */
function hasControlCharacters(value: string): boolean {
    return Array.from(value).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 31 || codePoint === 127;
    });
}

/**
 * Resolves the isolated editor configuration directory for a project.
 *
 * @param project - Project whose editor directory is required.
 * @param installLocation - Configured editor installation location.
 * @returns The project editor directory.
 */
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
 * Returns pinned project paths in their current display order.
 *
 * @param projects - Current project list.
 * @returns Ordered pinned project paths.
 */
function getPinnedPathsInOrder(projects: ProjectDetails[]): string[] {
    return projects
        .filter((project) => project.pinned)
        .sort((first, second) => {
            const firstOrder = isValidPinnedOrder(first.pinned_order)
                ? first.pinned_order
                : undefined;
            const secondOrder = isValidPinnedOrder(second.pinned_order)
                ? second.pinned_order
                : undefined;

            if (
                firstOrder !== undefined &&
                secondOrder !== undefined &&
                firstOrder !== secondOrder
            ) {
                return firstOrder - secondOrder;
            }
            if ((firstOrder !== undefined) !== (secondOrder !== undefined)) {
                return firstOrder !== undefined ? -1 : 1;
            }

            const dateDifference =
                (second.last_opened?.getTime() ?? 0) -
                (first.last_opened?.getTime() ?? 0);
            return dateDifference || first.name.localeCompare(second.name);
        })
        .map((project) => project.path);
}

/**
 * Applies a complete pinned ordering to the project list.
 *
 * @param projects - Current project list.
 * @param orderedProjectPaths - Pinned project paths in display order.
 * @returns Updated project list.
 */
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

/**
 * Checks whether two path lists contain the same unique paths.
 *
 * @param left - First path list.
 * @param right - Second path list.
 * @returns Whether both lists contain the same unique paths.
 */
function hasSameProjectPaths(left: string[], right: string[]): boolean {
    return (
        left.length === right.length &&
        new Set(left).size === left.length &&
        new Set(right).size === right.length &&
        left.every((projectPath) => right.includes(projectPath))
    );
}

/**
 * Checks whether a pinned order is usable.
 *
 * @param value - Candidate pinned order.
 * @returns Whether the order is a non-negative integer.
 */
function isValidPinnedOrder(value: number | undefined): value is number {
    return value !== undefined && Number.isInteger(value) && value >= 0;
}
