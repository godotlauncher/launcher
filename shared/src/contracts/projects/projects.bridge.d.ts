import type { CodeEditorId } from '../codeEditorIntegration/index.js';
import type { InstalledRelease } from '../releases/index.js';
import type {
    AddProjectOptions,
    AddProjectToListResult,
    CancelRemoteProjectImportResult,
    ChangeProjectEditorResult,
    CheckCreateProjectRepositoryNameAvailabilityResult,
    CreateProjectGitOptions,
    CreateProjectParentRepositoryConsent,
    CreateProjectPublicationOptions,
    CreateProjectResult,
    GitIdentity,
    GitRepositoryInspection,
    InitialiseRemoteProjectSubmodulesResult,
    InitializeProjectGitResult,
    LaunchProjectOptions,
    LaunchProjectResult,
    ListConnectedRepositoriesResult,
    ListCreateProjectPublicationTargetsResult,
    ProjectDetails,
    ProjectGitHubLink,
    ProjectGitIdentityResult,
    ProjectPublicationRecoveryAction,
    PublicGitSourceInspectionResult,
    RemoteProjectImportRequest,
    RemoteProjectImportResult,
    RenameProjectOptions,
    RenameProjectResult,
    RendererType,
    ResolveRemoteProjectCloneAction,
    ResolveRemoteProjectCloneResult,
    SetProjectCodeEditorResult,
    SetRemoteProjectGitIdentityResult,
} from './index.js';

/** Defines project requests available to the renderer. */
export type ProjectsBridge = {
    /** Clones a repository and discovers its Godot projects. */
    importRemoteProject(
        request: RemoteProjectImportRequest,
    ): Promise<RemoteProjectImportResult>;

    /** Cancels the active remote project import when it is still cancellable. */
    cancelRemoteProjectImport(
        jobId: string,
    ): Promise<CancelRemoteProjectImportResult>;

    /** Keeps or deletes the exact final clone owned by an import job. */
    resolveRemoteProjectClone(
        jobId: string,
        action: ResolveRemoteProjectCloneAction,
    ): Promise<ResolveRemoteProjectCloneResult>;

    /** Sets repository-scoped Git identity for an unchanged imported clone. */
    setRemoteProjectGitIdentity(
        jobId: string,
        identity: GitIdentity,
    ): Promise<SetRemoteProjectGitIdentityResult>;

    /** Initialises validated anonymous public submodules for an owned clone. */
    initialiseRemoteProjectSubmodules(
        jobId: string,
    ): Promise<InitialiseRemoteProjectSubmodulesResult>;

    /** Inspects an anonymous public Git repository URL. */
    inspectPublicGitSource(
        url: string,
    ): Promise<PublicGitSourceInspectionResult>;

    /** Lists repositories available through a connected hosting provider. */
    listConnectedRepositories(
        providerId: string,
        cursor?: string,
    ): Promise<ListConnectedRepositoriesResult>;

    /** Gets every stored project. */
    getProjectsDetails(): Promise<ProjectDetails[]>;

    /** Refreshes safe GitHub links for the current stored projects. */
    refreshProjectGitHubLinks(): Promise<readonly ProjectGitHubLink[]>;

    /** Lists current GitHub owners eligible for Create Project publishing. */
    listCreateProjectPublicationTargets(
        providerId: string,
    ): Promise<ListCreateProjectPublicationTargetsResult>;

    /** Checks whether one owner route visibly contains the requested repository name. */
    checkCreateProjectRepositoryNameAvailability(
        publication: CreateProjectPublicationOptions,
    ): Promise<CheckCreateProjectRepositoryNameAvailabilityResult>;

    /** Inspects the final planned Create Project path for an enclosing repository. */
    inspectCreateProjectRepository(
        projectName: string,
        overwriteProjectPath?: string,
    ): Promise<GitRepositoryInspection>;

    /** Creates and registers a project. */
    createProject(
        name: string,
        release: InstalledRelease,
        renderer: RendererType[5],
        codeEditorId: CodeEditorId | null,
        withGit: boolean,
        overwriteProjectPath?: string,
        gitOptions?: CreateProjectGitOptions,
        publication?: CreateProjectPublicationOptions,
        parentRepositoryConsent?: CreateProjectParentRepositoryConsent,
    ): Promise<CreateProjectResult>;

    /** Retries one process-local publication attempt for its exact project. */
    retryCreateProjectPublication(
        attemptId: string,
        publication?: CreateProjectPublicationOptions,
        recoveryAction?: ProjectPublicationRecoveryAction,
    ): Promise<CreateProjectResult>;

    /** Discards one process-local publication attempt without changing either repository. */
    discardCreateProjectPublication(attemptId: string): Promise<void>;

    /** Removes a project from Launcher without deleting its directory. */
    removeProject(project: ProjectDetails): Promise<ProjectDetails[]>;

    /** Renames a stored project and optionally its Godot project name. */
    renameProject(
        project: ProjectDetails,
        options: RenameProjectOptions,
    ): Promise<RenameProjectResult>;

    /** Reads the project name stored in project.godot. */
    getProjectGodotName(project: ProjectDetails): Promise<string | null>;

    /** Adds an existing project to Launcher. */
    addProject(
        path: string,
        options?: AddProjectOptions,
    ): Promise<AddProjectToListResult>;

    /** Changes the Godot editor assigned to a project. */
    setProjectEditor(
        project: ProjectDetails,
        release: InstalledRelease,
    ): Promise<ChangeProjectEditorResult>;

    /** Changes whether a project opens in windowed mode. */
    setProjectWindowed(
        project: ProjectDetails,
        openWindowed: boolean,
    ): Promise<ProjectDetails>;

    /** Changes whether a project is pinned. */
    setProjectPinned(
        project: ProjectDetails,
        pinned: boolean,
    ): Promise<ProjectDetails[]>;

    /** Reorders the pinned projects. */
    reorderPinnedProjects(
        orderedProjectPaths: string[],
    ): Promise<ProjectDetails[]>;

    /** Changes the code editor assigned to a project. */
    setProjectCodeEditor(
        project: ProjectDetails,
        codeEditorId: CodeEditorId | null,
    ): Promise<SetProjectCodeEditorResult>;

    /** Resets Launcher-owned code editor configuration for a project. */
    resetProjectCodeEditorConfig(
        project: ProjectDetails,
    ): Promise<SetProjectCodeEditorResult>;

    /** Initializes or detects the Git repository for a project. */
    initializeProjectGit(
        project: ProjectDetails,
    ): Promise<InitializeProjectGitResult>;

    /** Gets effective Git identity values for a project. */
    getProjectGitIdentity(
        project: ProjectDetails,
    ): Promise<ProjectGitIdentityResult>;

    /** Saves repository-scoped Git identity for a project. */
    setProjectGitIdentity(
        project: ProjectDetails,
        identity: GitIdentity,
    ): Promise<ProjectGitIdentityResult>;

    /** Exports the Godot editor settings for a project. */
    exportProjectEditorSettings(project: ProjectDetails): Promise<void>;

    /** Imports Godot editor settings into a project. */
    importProjectEditorSettings(project: ProjectDetails): Promise<void>;

    /** Launches a project with its configured editor and post-launch action. */
    launchProject(
        project: ProjectDetails,
        options?: LaunchProjectOptions,
    ): Promise<LaunchProjectResult>;

    /** Revalidates one project. */
    checkProjectValid(project: ProjectDetails): Promise<ProjectDetails>;

    /** Revalidates and persists every project. */
    checkAllProjectsValid(): Promise<ProjectDetails[]>;
};
