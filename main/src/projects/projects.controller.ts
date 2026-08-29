import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
import type {
    AddProjectOptions,
    CodeEditorId,
    CreateProjectGitOptions,
    CreateProjectPublicationOptions,
    GitIdentity,
    InstalledRelease,
    LaunchProjectOptions,
    ProjectDetails,
    ProjectsBridge,
    RemoteProjectImportRequest,
    RenameProjectOptions,
    RendererType,
    ResolveRemoteProjectCloneAction,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectsService } from './projects.service.js';

const ProjectsHandler = createIpcHandleTyped<ProjectsBridge>();

/** Handles project requests from the renderer. */
@BridgeController({ namespace: 'projects' })
export class ProjectsController implements ProjectsBridge {
    /**
     * Creates the project controller.
     *
     * @param projects - Project workflow facade.
     */
    constructor(private readonly projects: ProjectsService) {}

    /**
     * Clones a remote repository and discovers its Godot projects.
     *
     * @param request - Renderer-safe remote source and destination request.
     */
    @ProjectsHandler('importRemoteProject')
    importRemoteProject(request: RemoteProjectImportRequest) {
        return this.projects.importRemoteProject(request);
    }

    /**
     * Cancels the active remote clone job.
     *
     * @param jobId - Exact process-local clone job ID.
     */
    @ProjectsHandler('cancelRemoteProjectImport')
    cancelRemoteProjectImport(jobId: string) {
        return this.projects.cancelRemoteProjectImport(jobId);
    }

    /**
     * Keeps or deletes the exact final clone owned by an import job.
     *
     * @param jobId - Exact process-local clone job ID.
     * @param action - Whether to retain the clone or delete it.
     */
    @ProjectsHandler('resolveRemoteProjectClone')
    resolveRemoteProjectClone(
        jobId: string,
        action: ResolveRemoteProjectCloneAction,
    ) {
        return this.projects.resolveRemoteProjectClone(jobId, action);
    }

    /**
     * Sets repository-scoped Git identity for an unchanged imported clone.
     *
     * @param jobId - Exact process-local clone job ID.
     * @param identity - Complete identity to write to the clone.
     */
    @ProjectsHandler('setRemoteProjectGitIdentity')
    setRemoteProjectGitIdentity(jobId: string, identity: GitIdentity) {
        return this.projects.setRemoteProjectGitIdentity(jobId, identity);
    }

    /**
     * Initialises validated public submodules for one retained remote clone.
     *
     * @param jobId - Exact process-local clone job ID.
     */
    @ProjectsHandler('initialiseRemoteProjectSubmodules')
    initialiseRemoteProjectSubmodules(jobId: string) {
        return this.projects.initialiseRemoteProjectSubmodules(jobId);
    }

    /**
     * Inspects one anonymous public Git source.
     *
     * @param url - Anonymous HTTPS repository URL.
     */
    @ProjectsHandler('inspectPublicGitSource')
    inspectPublicGitSource(url: string) {
        return this.projects.inspectPublicGitSource(url);
    }

    /**
     * Lists one page of connected hosting repositories.
     *
     * @param providerId - Registered hosting provider ID.
     * @param cursor - Optional opaque browse cursor.
     */
    @ProjectsHandler('listConnectedRepositories')
    listConnectedRepositories(providerId: string, cursor?: string) {
        return this.projects.listConnectedRepositories(providerId, cursor);
    }

    /** Gets every stored project. */
    @ProjectsHandler('getProjectsDetails')
    getProjectsDetails() {
        return this.projects.getProjectsDetails();
    }

    /**
     * Lists current owner routes eligible for Create Project publishing.
     *
     * @param providerId - Registered repository provider ID.
     */
    @ProjectsHandler('listCreateProjectPublicationTargets')
    listCreateProjectPublicationTargets(providerId: string) {
        return this.projects.listCreateProjectPublicationTargets(providerId);
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
    @ProjectsHandler('createProject')
    createProject(
        name: string,
        release: InstalledRelease,
        renderer: RendererType[5],
        codeEditorId: CodeEditorId | null,
        withGit: boolean,
        overwriteProjectPath?: string,
        gitOptions?: CreateProjectGitOptions,
        publication?: CreateProjectPublicationOptions,
    ) {
        const args = [
            name,
            release,
            renderer,
            codeEditorId,
            withGit,
            overwriteProjectPath,
            gitOptions,
        ] as const;
        return publication
            ? this.projects.createProject(...args, publication)
            : this.projects.createProject(...args);
    }

    /**
     * Retries one process-local publication attempt for its exact project.
     *
     * @param attemptId - Opaque failed publication attempt ID.
     * @param publication - Optional edited selection before remote creation.
     */
    @ProjectsHandler('retryCreateProjectPublication')
    retryCreateProjectPublication(
        attemptId: string,
        publication?: CreateProjectPublicationOptions,
    ) {
        return this.projects.retryCreateProjectPublication(
            attemptId,
            publication,
        );
    }

    /**
     * Discards one process-local publication attempt without changing repositories.
     *
     * @param attemptId - Opaque failed publication attempt ID.
     */
    @ProjectsHandler('discardCreateProjectPublication')
    discardCreateProjectPublication(attemptId: string) {
        return this.projects.discardCreateProjectPublication(attemptId);
    }

    /**
     * Removes one project from Launcher without deleting its directory.
     *
     * @param project - Project to remove.
     */
    @ProjectsHandler('removeProject')
    removeProject(project: ProjectDetails) {
        return this.projects.removeProject(project);
    }

    /**
     * Renames a project and optionally its Godot project name.
     *
     * @param project - Project to rename.
     * @param options - New name and Godot project update choice.
     */
    @ProjectsHandler('renameProject')
    renameProject(project: ProjectDetails, options: RenameProjectOptions) {
        return this.projects.renameProject(project, options);
    }

    /**
     * Reads the project name stored in project.godot.
     *
     * @param project - Project whose Godot name is required.
     */
    @ProjectsHandler('getProjectGodotName')
    getProjectGodotName(project: ProjectDetails) {
        return this.projects.getProjectGodotName(project);
    }

    /**
     * Adds an existing project to Launcher.
     *
     * @param projectPath - Selected project file or directory path.
     * @param options - Optional missing-editor resolution.
     */
    @ProjectsHandler('addProject')
    addProject(projectPath: string, options?: AddProjectOptions) {
        return this.projects.addProject(projectPath, options);
    }

    /**
     * Changes the Godot editor assigned to a project.
     *
     * @param project - Project to update.
     * @param release - Godot editor to assign.
     */
    @ProjectsHandler('setProjectEditor')
    setProjectEditor(project: ProjectDetails, release: InstalledRelease) {
        return this.projects.setProjectEditor(project, release);
    }

    /**
     * Changes whether a project opens in windowed mode.
     *
     * @param project - Project to update.
     * @param openWindowed - Whether to request windowed mode.
     */
    @ProjectsHandler('setProjectWindowed')
    setProjectWindowed(project: ProjectDetails, openWindowed: boolean) {
        return this.projects.setProjectWindowed(project, openWindowed);
    }

    /**
     * Changes whether a project is pinned.
     *
     * @param project - Project to update.
     * @param pinned - Whether the project should be pinned.
     */
    @ProjectsHandler('setProjectPinned')
    setProjectPinned(project: ProjectDetails, pinned: boolean) {
        return this.projects.setProjectPinned(project, pinned);
    }

    /**
     * Reorders the pinned projects.
     *
     * @param orderedProjectPaths - Pinned project paths in display order.
     */
    @ProjectsHandler('reorderPinnedProjects')
    reorderPinnedProjects(orderedProjectPaths: string[]) {
        return this.projects.reorderPinnedProjects(orderedProjectPaths);
    }

    /**
     * Changes the code editor assigned to a project.
     *
     * @param project - Project to update.
     * @param codeEditorId - Code editor to assign, or null to disable it.
     */
    @ProjectsHandler('setProjectCodeEditor')
    setProjectCodeEditor(
        project: ProjectDetails,
        codeEditorId: CodeEditorId | null,
    ) {
        return this.projects.setProjectCodeEditor(project, codeEditorId);
    }

    /**
     * Resets Launcher-owned code editor configuration for a project.
     *
     * @param project - Project whose configuration should be reset.
     */
    @ProjectsHandler('resetProjectCodeEditorConfig')
    resetProjectCodeEditorConfig(project: ProjectDetails) {
        return this.projects.resetProjectCodeEditorConfig(project);
    }

    /**
     * Initializes or detects the Git repository for a project.
     *
     * @param project - Project to inspect or initialize.
     */
    @ProjectsHandler('initializeProjectGit')
    initializeProjectGit(project: ProjectDetails) {
        return this.projects.initializeProjectGit(project);
    }

    /**
     * Gets effective Git identity values for a project.
     *
     * @param project - Project whose Git identity is required.
     */
    @ProjectsHandler('getProjectGitIdentity')
    getProjectGitIdentity(project: ProjectDetails) {
        return this.projects.getProjectGitIdentity(project);
    }

    /**
     * Saves repository-scoped Git identity for a project.
     *
     * @param project - Project whose repository should be configured.
     * @param identity - Git identity to save.
     */
    @ProjectsHandler('setProjectGitIdentity')
    setProjectGitIdentity(project: ProjectDetails, identity: GitIdentity) {
        return this.projects.setProjectGitIdentity(project, identity);
    }

    /**
     * Exports the Godot editor settings for a project.
     *
     * @param project - Project whose settings should be exported.
     */
    @ProjectsHandler('exportProjectEditorSettings')
    exportProjectEditorSettings(project: ProjectDetails) {
        return this.projects.exportProjectEditorSettings(project);
    }

    /**
     * Imports Godot editor settings into a project.
     *
     * @param project - Project that receives the imported settings.
     */
    @ProjectsHandler('importProjectEditorSettings')
    importProjectEditorSettings(project: ProjectDetails) {
        return this.projects.importProjectEditorSettings(project);
    }

    /**
     * Launches a project with its configured post-launch action.
     *
     * @param project - Project to launch.
     * @param options - Optional launch overrides.
     */
    @ProjectsHandler('launchProject')
    launchProject(project: ProjectDetails, options?: LaunchProjectOptions) {
        return this.projects.launchProject(project, options);
    }

    /**
     * Revalidates one project.
     *
     * @param project - Project to validate.
     */
    @ProjectsHandler('checkProjectValid')
    checkProjectValid(project: ProjectDetails) {
        return this.projects.checkProjectValid(project);
    }

    /** Revalidates and persists every project. */
    @ProjectsHandler('checkAllProjectsValid')
    checkAllProjectsValid() {
        return this.projects.checkAllProjectsValid();
    }
}
