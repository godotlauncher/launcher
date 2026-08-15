import type { CodeEditorId } from '../codeEditorIntegration/index.js';
import type { UserPreferences } from '../preferences/index.js';
import type {
    AddProjectOptions,
    AddProjectToListResult,
    ChangeProjectEditorResult,
    CreateProjectGitOptions,
    CreateProjectResult,
    LaunchProjectOptions,
    LaunchProjectResult,
    ProjectDetails,
    RenameProjectOptions,
    RenameProjectResult,
    RendererType,
    SetProjectCodeEditorResult,
} from '../projects/index.js';
import type {
    AvailableReleasesResult,
    CreateCustomEngineManifestResult,
    CustomEngineManifest,
    InstalledRelease,
    InstallReleaseResult,
    RegisterCustomEngineResult,
    ReleaseSummary,
    RemovedReleaseResult,
} from '../releases/index.js';
import type {
    AppUpdateMessage,
    CheckForUpdatesOptions,
    SetAutoStartResult,
} from './index.js';

export type AppFileFilter = {
    name: string;
    extensions: string[];
};

export type AppOpenDialogProperty =
    | 'openFile'
    | 'openDirectory'
    | 'multiSelections'
    | 'showHiddenFiles'
    | 'createDirectory'
    | 'promptToCreate'
    | 'noResolveAliases'
    | 'treatPackageAsDirectory'
    | 'dontAddToRecent';

export type AppOpenDialogResult = {
    canceled: boolean;
    filePaths: string[];
    bookmarks?: string[];
};

export type OnboardingRecommendedLocations = {
    projectsLocation: string;
    editorLocation: string;
};

export type AppBridge = {
    getUserPreferences(): Promise<UserPreferences>;
    getOnboardingRecommendedLocations(): Promise<OnboardingRecommendedLocations>;
    setUserPreferences(prefs: UserPreferences): Promise<UserPreferences>;
    setAutoStart(
        autoStart: boolean,
        hidden: boolean,
    ): Promise<SetAutoStartResult>;
    setAutoCheckUpdates(enabled: boolean): Promise<boolean>;
    setReceiveBetaUpdates(enabled: boolean): Promise<boolean>;
    openFileDialog(
        defaultPath: string,
        title: string,
        filters?: AppFileFilter[],
        properties?: AppOpenDialogProperty[],
    ): Promise<AppOpenDialogResult>;
    openDirectoryDialog(
        defaultPath: string,
        title: string,
        filters?: AppFileFilter[],
        properties?: AppOpenDialogProperty[],
    ): Promise<AppOpenDialogResult>;
    openShellFolder(pathToOpen: string): Promise<void>;
    openExternal(url: string): Promise<void>;
    pathExists(pathToCheck: string): Promise<boolean>;
    fileExists(pathToCheck: string): Promise<boolean>;
    ensureDirectory(pathToCheck: string): Promise<boolean>;
    getAvailableReleases(): Promise<AvailableReleasesResult>;
    getAvailablePrereleases(): Promise<AvailableReleasesResult>;
    getInstalledReleases(): Promise<InstalledRelease[]>;
    installRelease(
        release: ReleaseSummary,
        mono: boolean,
    ): Promise<InstallReleaseResult>;
    removeRelease(release: InstalledRelease): Promise<RemovedReleaseResult>;
    reinstallRelease(release: InstalledRelease): Promise<InstallReleaseResult>;
    registerCustomEngine(
        manifestPath: string,
        options?: { replaceExisting?: boolean },
    ): Promise<RegisterCustomEngineResult>;
    createCustomEngineManifest(
        outputDirectory: string,
        manifest: CustomEngineManifest,
    ): Promise<CreateCustomEngineManifestResult>;
    openEditorProjectManager(release: InstalledRelease): Promise<void>;
    checkAllReleasesValid(): Promise<InstalledRelease[]>;
    clearReleaseCache(): Promise<void>;
    getProjectsDetails(): Promise<ProjectDetails[]>;
    createProject(
        name: string,
        release: InstalledRelease,
        renderer: RendererType[5],
        codeEditorId: CodeEditorId | null,
        withGit: boolean,
        overwriteProjectPath?: string,
        gitOptions?: CreateProjectGitOptions,
    ): Promise<CreateProjectResult>;
    removeProject(project: ProjectDetails): Promise<ProjectDetails[]>;
    renameProject(
        project: ProjectDetails,
        options: RenameProjectOptions,
    ): Promise<RenameProjectResult>;
    getProjectGodotName(project: ProjectDetails): Promise<string | null>;
    addProject(
        path: string,
        options?: AddProjectOptions,
    ): Promise<AddProjectToListResult>;
    setProjectEditor(
        project: ProjectDetails,
        release: InstalledRelease,
    ): Promise<ChangeProjectEditorResult>;
    setProjectWindowed(
        project: ProjectDetails,
        openWindowed: boolean,
    ): Promise<ProjectDetails>;
    setProjectPinned(
        project: ProjectDetails,
        pinned: boolean,
    ): Promise<ProjectDetails[]>;
    reorderPinnedProjects(
        orderedProjectPaths: string[],
    ): Promise<ProjectDetails[]>;
    setProjectCodeEditor(
        project: ProjectDetails,
        codeEditorId: CodeEditorId | null,
    ): Promise<SetProjectCodeEditorResult>;
    resetProjectCodeEditorConfig(
        project: ProjectDetails,
    ): Promise<SetProjectCodeEditorResult>;
    initializeProjectGit(project: ProjectDetails): Promise<ProjectDetails>;
    exportProjectEditorSettings(project: ProjectDetails): Promise<void>;
    importProjectEditorSettings(project: ProjectDetails): Promise<void>;
    launchProject(
        project: ProjectDetails,
        options?: LaunchProjectOptions,
    ): Promise<LaunchProjectResult>;
    checkProjectValid(project: ProjectDetails): Promise<ProjectDetails>;
    checkAllProjectsValid(): Promise<ProjectDetails[]>;
    getPlatform(): Promise<string>;
    getTrayAvailability(): Promise<boolean>;
    getAppVersion(): Promise<string>;
    relaunchApp(): Promise<void>;
    installUpdateAndRestart(): Promise<void>;
    downloadAppUpdate(): Promise<void>;
    skipAppUpdate(version: string): Promise<string>;
    unskipAppUpdate(): Promise<void>;
    checkForUpdates(
        options?: CheckForUpdatesOptions,
    ): Promise<AppUpdateMessage>;
    changeLanguage(lang: string): Promise<string>;
    rendererReady(): Promise<void>;
};
