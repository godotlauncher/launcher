import { randomUUID } from 'node:crypto';
import { Injectable } from '@mariodebono/di';
import type {
    AddProjectOptions,
    ChangeProjectEditorResult,
    ClearProjectNewStatusResult,
    CodeEditorId,
    CreateProjectDestinationInspection,
    CreateProjectGitOptions,
    CreateProjectParentRepositoryConsent,
    CreateProjectPublicationOptions,
    CreateProjectResult,
    CreateProjectSource,
    GitIdentity,
    InstalledRelease,
    LaunchProjectOptions,
    LaunchProjectResult,
    OpenProjectCodeEditorResult,
    ProjectDetails,
    ProjectEditorSelection,
    ProjectEditorSelectionExpectation,
    ProjectGitIdentityResult,
    ProjectPublicationRecoveryAction,
    RemoteProjectImportRequest,
    RenameProjectOptions,
    RenameProjectResult,
    RendererType,
    ResolveRemoteProjectCloneAction,
    ResolveRemoteProjectCloneResult,
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
import { updateLinuxTray } from '../helpers/tray.helper.js';
import { t } from '../i18n/index.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectTagService } from '../project-tags/project-tag.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitService } from '../tool-integration/integrations/git/git.service.js';
import { removeProjectEditor } from '../utils/godot.utils.js';
import {
    readGodotProjectName,
    updateGodotProjectName,
} from '../utils/godotProject.utils.js';
import { writeProjectLauncherConfig } from '../utils/projectLauncherConfig.utils.js';
import { ipcSendToMainWindowSync } from '../utils.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectCreationService } from './project-creation.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectEditorService } from './project-editor.service.js';
import { publishProjectUpdates } from './project-events.util.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectGitService } from './project-git.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectImportService } from './project-import.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectLaunchService } from './project-launch.service.js';
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
    private readonly newStatusUndo = new Map<
        string,
        { token: string; addedAt: number | undefined }
    >();
    /**
     * Creates the project service.
     *
     * @param codeEditors - Code editor integration facade.
     * @param projectImport - Transactional Add Project workflow.
     * @param git - Guarded Git command service.
     * @param projectCreation - Transactional Create Project workflow.
     * @param projectLaunch - Native Godot dispatch and post-launch actions.
     * @param projectEditors - Project-specific Godot and code editor configuration.
     * @param store - Canonical project persistence store.
     * @param remoteSources - Remote project source discovery boundary.
     * @param remoteImport - Cancellable remote clone transaction boundary.
     * @param projectPublication - Follow-on remote publication and retry workflow.
     * @param projectOrigins - Process-local stored-project origin index.
     * @param projectTags - Launcher-owned project tag assignments.
     * @param projectGit - Guarded project Git setup and identity workflows.
     */
    constructor(
        private readonly codeEditors: CodeEditorIntegrationService,
        private readonly projectImport: ProjectImportService,
        private readonly git: GitService,
        private readonly projectCreation: ProjectCreationService,
        private readonly projectLaunch: ProjectLaunchService,
        private readonly projectEditors: ProjectEditorService,
        private readonly store: ProjectsStore,
        private readonly remoteSources: ProjectRemoteSourceService,
        private readonly remoteImport: ProjectRemoteImportService,
        private readonly projectPublication: ProjectPublicationService,
        private readonly projectOrigins: ProjectRepositoryOriginIndexService,
        private readonly projectTags: ProjectTagService,
        private readonly projectGit: ProjectGitService,
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
     * Inspects whether the final planned Create Project directory can be used.
     *
     * @param projectName - Display name for the new project.
     * @param overwriteProjectPath - Optional path used to choose the project parent directory.
     * @returns Whether the final sanitised project path is available.
     */
    inspectCreateProjectDestination(
        projectName: string,
        overwriteProjectPath?: string,
    ): Promise<CreateProjectDestinationInspection> {
        return this.projectCreation.inspectCreateProjectDestination(
            projectName,
            overwriteProjectPath,
        );
    }

    /**
     * Inspects the final planned Create Project path for an enclosing repository.
     *
     * @param projectName - Display name for the new project.
     * @param overwriteProjectPath - Optional path used to choose the project parent directory.
     */
    inspectCreateProjectRepository(
        projectName: string,
        overwriteProjectPath?: string,
    ) {
        return this.projectCreation.inspectCreateProjectRepository(
            projectName,
            overwriteProjectPath,
        );
    }

    /** Cancels the exact active source-copy operation.
     * @param jobId - Active creation job identifier.
     */
    async cancelCreateProjectCopy(jobId: string) {
        return this.projectCreation.cancelCreateProjectCopy(jobId);
    }

    /** Creates a project using the existing creation and publication pipeline.
     * @param name - New name.
     * @param release - Selected editor.
     * @param renderer - Selected renderer.
     * @param codeEditorId - Selected integration.
     * @param withGit - Git choice.
     * @param overwriteProjectPath - Destination.
     * @param gitOptions - Git options.
     * @param publication - Publication options.
     * @param parentRepositoryConsent - Accepted parent repository.
     * @param source - Optional project source.
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
        parentRepositoryConsent?: CreateProjectParentRepositoryConsent,
        source?: CreateProjectSource,
    ): Promise<CreateProjectResult> {
        if (
            publication &&
            !parentRepositoryConsent &&
            (!withGit || gitOptions?.initialCommit === 'skip')
        ) {
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
            parentRepositoryConsent,
            ...(source ? [source] : []),
        );
        const usesParentRepository =
            result.gitSetup?.status === 'existing-repository' &&
            !result.gitSetup.isProjectRoot;
        if (
            !publication ||
            !result.success ||
            !result.projectDetails ||
            usesParentRepository
        ) {
            return {
                ...result,
                publication: { status: 'not-requested' as const },
            };
        }
        if (source) {
            try {
                ipcSendToMainWindowSync('project-copy-progress', {
                    jobId: source.jobId,
                    stage: 'publishing',
                    canCancel: false,
                });
            } catch {
                // Progress delivery does not determine publication success.
            }
        }
        const publicationOutcome = await this.projectPublication.publish(
            result.projectDetails,
            publication,
            result.gitLfsSetup?.status === 'configured',
            result.gitSetup?.status === 'initialized',
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
     * Removes one project from Launcher without changing its launcher metadata or deleting its directory.
     *
     * @param project - Project to remove.
     */
    async removeProject(project: ProjectDetails) {
        await removeProjectEditor(project);
        const projects = await this.store.remove(project.path);
        this.newStatusUndo.delete(project.path);
        try {
            await this.projectTags.removeProjectAssignments(project.path);
        } catch (error) {
            // Project removal has already succeeded; tag reads retry orphan cleanup.
            logger.warn(
                'Could not clean up removed project tag assignments',
                error,
            );
        }
        publishProjectUpdates(projects);

        return projects;
    }

    /**
     * Renames a project, saves its import name, and optionally renames its Godot project.
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
        try {
            await writeProjectLauncherConfig(latestProject.path, {
                release: latestProject.release,
                projectName: latestProject.name,
                launcherVersion: app.getVersion(),
            });
        } catch (error) {
            logger.warn(
                `Failed to save renamed project metadata for '${latestProject.name}'`,
                error,
            );
        }
        publishProjectUpdates(projects);

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
     * Reads the names of explicitly selected project files without registering them.
     * @param paths - Bounded list of selected project files.
     */
    inspectProjectImports(paths: string[]) {
        return this.projectImport.inspectProjectImports(paths);
    }

    /**
     * Adds an existing project through the current characterized workflow.
     *
     * @param projectPath - Selected project file or directory path.
     * @param options - Optional missing-editor resolution.
     * @returns The import result after publishing a successful project-list update.
     */
    async addProject(projectPath: string, options?: AddProjectOptions) {
        const result = await this.projectImport.addProject(
            projectPath,
            options,
        );
        if (result.success && result.projects) {
            publishProjectUpdates(result.projects);
        }
        return result;
    }

    /**
     * Changes the Godot editor assigned to a project.
     *
     * @param project - Project to update.
     * @param selection - Installed editor or official editor selection to assign.
     * @param expectedEditor - Optional current selection required for repair.
     */
    async setProjectEditor(
        project: ProjectDetails,
        selection: ProjectEditorSelection,
        expectedEditor?: ProjectEditorSelectionExpectation,
    ): Promise<ChangeProjectEditorResult> {
        return this.projectEditors.setProjectEditor(
            project,
            selection,
            expectedEditor,
        );
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
        publishProjectUpdates(projects);
        return updatedProject;
    }

    /**
     * Changes whether a project launches with a visible console.
     *
     * @param project - Project to update.
     * @param launchWithConsole - Whether to request console mode.
     */
    async setProjectLaunchWithConsole(
        project: ProjectDetails,
        launchWithConsole: boolean,
    ) {
        const projects = await this.store.update((currentProjects) =>
            currentProjects.map((candidate) =>
                candidate.path === project.path
                    ? { ...candidate, launch_with_console: launchWithConsole }
                    : candidate,
            ),
        );
        const updatedProject = projects.find(
            (candidate) => candidate.path === project.path,
        );
        if (!updatedProject) {
            throw new Error('Project not found');
        }
        publishProjectUpdates(projects);
        return updatedProject;
    }

    /**
     * Clears only the current project's New flag after an atomic save.
     * @param project - Project whose currently displayed New status is being cleared.
     */
    async clearProjectNewStatus(
        project: ProjectDetails,
    ): Promise<ClearProjectNewStatusResult> {
        const token = randomUUID();
        const projects = await this.store.update((currentProjects) => {
            const current = currentProjects.find(
                (candidate) => candidate.path === project.path,
            );
            if (
                !current?.is_new ||
                current.last_opened ||
                current.added_at?.getTime() !== project.added_at?.getTime()
            )
                throw new Error(t('projects:newStatus.unavailable'));
            return currentProjects.map((candidate) =>
                candidate === current
                    ? { ...candidate, is_new: false }
                    : candidate,
            );
        });
        const updated = projects.find(
            (candidate) => candidate.path === project.path,
        );
        if (!updated) throw new Error(t('projects:newStatus.unavailable'));
        this.newStatusUndo.set(project.path, {
            token,
            addedAt: updated.added_at?.getTime(),
        });
        publishProjectUpdates(projects);
        return { project: updated, undoToken: token };
    }

    /**
     * Restores New only for the unchanged, unopened project owned by this Undo.
     * @param undoToken - Transient identity returned by the matching clear operation.
     */
    async undoClearProjectNewStatus(
        undoToken: string,
    ): Promise<ProjectDetails> {
        const entry = [...this.newStatusUndo].find(
            ([, undo]) => undo.token === undoToken,
        );
        if (!entry) throw new Error(t('projects:newStatus.unavailable'));
        const [projectPath, undo] = entry;
        const projects = await this.store.update((currentProjects) => {
            const current = currentProjects.find(
                (candidate) => candidate.path === projectPath,
            );
            if (
                this.newStatusUndo.get(projectPath) !== undo ||
                !current ||
                current.last_opened ||
                current.is_new ||
                current.added_at?.getTime() !== undo.addedAt
            )
                throw new Error(t('projects:newStatus.unavailable'));
            return currentProjects.map((candidate) =>
                candidate === current
                    ? { ...candidate, is_new: true }
                    : candidate,
            );
        });
        if (this.newStatusUndo.get(projectPath) === undo)
            this.newStatusUndo.delete(projectPath);
        publishProjectUpdates(projects);
        const restored = projects.find(
            (candidate) => candidate.path === projectPath,
        );
        if (!restored) throw new Error(t('projects:newStatus.unavailable'));
        return restored;
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
        publishProjectUpdates(projects);
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
        publishProjectUpdates(projects);
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
        return this.projectEditors.setProjectCodeEditor(project, codeEditorId);
    }

    /**
     * Resets Launcher-owned code editor configuration for a project.
     *
     * @param project - Project whose configuration should be reset.
     */
    resetProjectCodeEditorConfig(project: ProjectDetails) {
        return this.projectEditors.resetProjectCodeEditorConfig(project);
    }

    /**
     * Initialises or detects the Git repository for a project.
     *
     * @param project - Project to inspect or initialise.
     */
    async initializeProjectGit(project: ProjectDetails) {
        return this.projectGit.initializeProjectGit(project);
    }

    /**
     * Gets effective Git identity values for a project.
     *
     * @param project - Project whose Git identity is required.
     */
    async getProjectGitIdentity(
        project: ProjectDetails,
    ): Promise<ProjectGitIdentityResult> {
        return this.projectGit.getProjectGitIdentity(project);
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
        return this.projectGit.setProjectGitIdentity(project, identity);
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
     * Opens a stored project's folder without changing its Godot launch state.
     * @param projectPath - Exact registered project folder.
     */
    async openProjectCodeEditor(
        projectPath: string,
    ): Promise<OpenProjectCodeEditorResult> {
        return this.projectEditors.openProjectCodeEditor(projectPath);
    }

    /**
     * Launches a project with its configured post-launch action.
     * Console launches confirm the terminal hand-off before optional code editor opening.
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
            publishProjectUpdates(updatedProjects);
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
                    ? {
                          ...candidate,
                          last_opened: new Date(),
                          ...(candidate.is_new !== undefined
                              ? { is_new: false }
                              : {}),
                      }
                    : candidate,
            ),
        );
        const launchedProject = projects.find(
            (candidate) => candidate.path === project.path,
        );
        this.newStatusUndo.delete(project.path);

        if (launchedProject) {
            project = launchedProject;
            try {
                await writeProjectLauncherConfig(launchedProject.path, {
                    release: launchedProject.release,
                    projectName: launchedProject.name,
                    launcherVersion: app.getVersion(),
                });
            } catch (error) {
                logger.warn(
                    `Failed to write project launcher config for '${launchedProject.name}'`,
                    error,
                );
            }
        }

        const result = await this.projectLaunch.launchProject(
            project,
            prefs,
            options,
        );
        publishProjectUpdates(projects);
        return result;
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
            publishProjectUpdates(projects);
        } else {
            void updateLinuxTray();
        }
        return projects;
    }

    /** Quickly refreshes renderer-visible health for every stored project. */
    async refreshProjectHealth(): Promise<void> {
        const result = await checkAndUpdateProjectHealth(this.store);
        if (result.changed) {
            publishProjectUpdates(result.projects);
        }
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
