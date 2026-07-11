import type {
    AppUpdateMessage,
    CheckForUpdatesOptions,
    SetAutoStartResult,
} from '../app/index.js';
import type { UserPreferences } from '../preferences/index.js';
import type {
    AddProjectOptions,
    AddProjectToListResult,
    ChangeProjectEditorResult,
    CreateProjectResult,
    ProjectDetails,
    RenameProjectOptions,
    RenameProjectResult,
    RendererType,
    SetProjectVSCodeResult,
} from '../projects/index.js';
import type {
    AvailableReleasesResult,
    CreateCustomEngineManifestResult,
    CustomEngineManifest,
    InstalledRelease,
    InstallReleaseResult,
    RegisterCustomEngineResult,
    ReleaseInstallProgress,
    ReleaseSummary,
    RemovedReleaseResult,
} from '../releases/index.js';
import type { CachedTool, InstalledTool } from '../tools/index.js';

export type UnsubscribeFunction = () => void;

export type ElectronRendererApi = {
    getUserPreferences: () => Promise<UserPreferences>;
    setUserPreferences: (prefs: UserPreferences) => Promise<UserPreferences>;
    setAutoStart: (
        autoStart: boolean,
        hidden: boolean,
    ) => Promise<SetAutoStartResult>;
    setAutoCheckUpdates: (enabled: boolean) => Promise<boolean>;
    setReceiveBetaUpdates: (enabled: boolean) => Promise<boolean>;

    openFileDialog: (
        defaultPath: string,
        title: string,
        filters?: Electron.FileFilter[],
        properties?: Electron.OpenDialogOptions['properties'],
    ) => Promise<Electron.OpenDialogReturnValue>;
    openDirectoryDialog: (
        defaultPath: string,
        title: string,
        filters?: Electron.FileFilter[],
        properties?: Electron.OpenDialogOptions['properties'],
    ) => Promise<Electron.OpenDialogReturnValue>;
    openShellFolder: (pathToOpen: string) => Promise<void>;

    getPathForFile: (file: File) => string;
    pathExists: (pathToCheck: string) => Promise<boolean>;
    fileExists: (pathToCheck: string) => Promise<boolean>;
    ensureDirectory: (pathToCheck: string) => Promise<boolean>;

    getAvailableReleases: () => Promise<AvailableReleasesResult>;
    getAvailablePrereleases: () => Promise<AvailableReleasesResult>;
    getInstalledReleases: () => Promise<InstalledRelease[]>;
    installRelease: (
        release: ReleaseSummary,
        mono: boolean,
    ) => Promise<InstallReleaseResult>;
    removeRelease: (release: InstalledRelease) => Promise<RemovedReleaseResult>;
    reinstallRelease: (
        release: InstalledRelease,
    ) => Promise<InstallReleaseResult>;
    registerCustomEngine: (
        manifestPath: string,
        options?: { replaceExisting?: boolean },
    ) => Promise<RegisterCustomEngineResult>;
    createCustomEngineManifest: (
        outputDirectory: string,
        manifest: CustomEngineManifest,
    ) => Promise<CreateCustomEngineManifestResult>;

    openEditorProjectManager: (release: InstalledRelease) => Promise<void>;
    checkAllReleasesValid: () => Promise<InstalledRelease[]>;
    clearReleaseCache: () => Promise<void>;

    getProjectsDetails: () => Promise<ProjectDetails[]>;
    createProject: (
        name: string,
        release: InstalledRelease,
        renderer: RendererType[5],
        withVSCode: boolean,
        withGit: boolean,
        overwriteProjectPath?: string,
    ) => Promise<CreateProjectResult>;
    removeProject: (project: ProjectDetails) => Promise<ProjectDetails[]>;
    renameProject: (
        project: ProjectDetails,
        options: RenameProjectOptions,
    ) => Promise<RenameProjectResult>;
    getProjectGodotName: (project: ProjectDetails) => Promise<string | null>;
    addProject: (
        path: string,
        options?: AddProjectOptions,
    ) => Promise<AddProjectToListResult>;
    setProjectEditor: (
        project: ProjectDetails,
        release: InstalledRelease,
    ) => Promise<ChangeProjectEditorResult>;
    setProjectWindowed: (
        project: ProjectDetails,
        openWindowed: boolean,
    ) => Promise<ProjectDetails>;
    setProjectVSCode: (
        project: ProjectDetails,
        enable: boolean,
    ) => Promise<SetProjectVSCodeResult>;
    initializeProjectGit: (project: ProjectDetails) => Promise<ProjectDetails>;
    exportProjectEditorSettings: (project: ProjectDetails) => Promise<void>;
    importProjectEditorSettings: (project: ProjectDetails) => Promise<void>;
    launchProject: (project: ProjectDetails) => Promise<void>;
    checkProjectValid: (project: ProjectDetails) => Promise<ProjectDetails>;
    checkAllProjectsValid: () => Promise<ProjectDetails[]>;

    getInstalledTools: () => Promise<InstalledTool[]>;
    getCachedTools: (options?: {
        refreshIfStale?: boolean;
    }) => Promise<CachedTool[]>;
    refreshToolCache: () => Promise<CachedTool[]>;

    getPlatform: () => Promise<string>;
    getAppVersion: () => Promise<string>;

    subscribeProjects: (
        callback: (projects: ProjectDetails[]) => void,
    ) => UnsubscribeFunction;
    subscribeReleases: (
        callback: (releases: InstalledRelease[]) => void,
    ) => UnsubscribeFunction;
    subscribeReleaseInstallProgress: (
        callback: (progress: ReleaseInstallProgress) => void,
    ) => UnsubscribeFunction;
    subscribeAppUpdates: (
        callback: (message: AppUpdateMessage) => void,
    ) => UnsubscribeFunction;

    openExternal: (url: string) => Promise<void>;

    relaunchApp: () => Promise<void>;
    installUpdateAndRestart: () => Promise<void>;
    downloadAppUpdate: () => Promise<void>;
    skipAppUpdate: (version: string) => Promise<string>;
    unskipAppUpdate: () => Promise<void>;
    checkForUpdates: (
        options?: CheckForUpdatesOptions,
    ) => Promise<AppUpdateMessage>;

    i18n: {
        getCurrentLanguage: () => Promise<string>;
        getAvailableLanguages: () => Promise<string[]>;
        getAllTranslations: (
            language?: string,
        ) => Promise<Record<string, Record<string, unknown>>>;
        changeLanguage: (
            lang: string,
        ) => Promise<Record<string, Record<string, unknown>>>;
    };
};
