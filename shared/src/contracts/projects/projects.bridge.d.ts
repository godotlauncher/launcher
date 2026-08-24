import type { CodeEditorId } from '../codeEditorIntegration/index.js';
import type { InstalledRelease } from '../releases/index.js';
import type {
    AddProjectOptions,
    AddProjectToListResult,
    CancelRemoteProjectImportResult,
    ChangeProjectEditorResult,
    CreateProjectGitOptions,
    CreateProjectResult,
    GitIdentity,
    InitialiseRemoteProjectSubmodulesResult,
    InitializeProjectGitResult,
    LaunchProjectOptions,
    LaunchProjectResult,
    ListConnectedRepositoriesResult,
    ProjectDetails,
    ProjectGitIdentityResult,
    PublicGitSourceInspectionResult,
    RemoteProjectImportRequest,
    RemoteProjectImportResult,
    RenameProjectOptions,
    RenameProjectResult,
    RendererType,
    ResolveRemoteProjectCloneAction,
    ResolveRemoteProjectCloneResult,
    SetProjectCodeEditorResult,
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

    /** Creates and registers a project. */
    createProject(
        name: string,
        release: InstalledRelease,
        renderer: RendererType[5],
        codeEditorId: CodeEditorId | null,
        withGit: boolean,
        overwriteProjectPath?: string,
        gitOptions?: CreateProjectGitOptions,
    ): Promise<CreateProjectResult>;

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
