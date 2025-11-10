// biome-ignore lint/correctness/noUnusedVariables: Used but not explicitly
type EventChannelMapping = {
    // ##### user-preferences #####
    'get-user-preferences': Promise<UserPreferences>;
    'set-user-preferences': Promise<UserPreferences>;
    'set-auto-start': Promise<SetAutoStartResult>;
    'set-auto-check-updates': Promise<boolean>;

    // ##### app #####
    'get-version': Promise<string>;
    'app-updates': AppUpdateMessage;
    'check-updates': Promise<void>;

    // ##### dialogs #####
    'open-file-dialog': Promise<Electron.OpenDialogReturnValue>;
    'open-directory-dialog': Promise<Electron.OpenDialogReturnValue>;
    'shell-open-folder': Promise<void>;

    'show-project-menu': Promise<void>;
    'show-release-menu': Promise<void>;

    'open-external': Promise<void>;
    'relaunch-app': Promise<void>;
    'install-update-and-restart': Promise<void>;

    // ##### releases #####

    'get-available-releases': Promise<ReleaseSummary[]>;
    'get-available-prereleases': Promise<ReleaseSummary[]>;
    'get-installed-releases': Promise<InstalledRelease[]>;
    'install-release': Promise<InstallReleaseResult>;
    'remove-release': Promise<RemovedReleaseResult>;

    'open-editor-project-manager': Promise<void>;
    'check-all-releases-valid': Promise<InstalledRelease[]>;
    'clear-release-cache': Promise<void>;

    // ##### projects #####

    'create-project': Promise<CreateProjectResult>;
    'get-projects-details': Promise<ProjectDetails[]>;
    'remove-project': Promise<ProjectDetails[]>;
    'add-project': Promise<AddProjectToListResult>;
    'set-project-editor': Promise<ChangeProjectEditorResult>;
    'launch-project': Promise<void>;
    'check-project-valid': Promise<ProjectDetails>;
    'check-all-projects-valid': Promise<ProjectDetails[]>;

    // ##### tools #####
    'get-installed-tools': Promise<InstalledTool[]>;
    'get-cached-tools': Promise<CachedTool[]>;
    'refresh-tool-cache': Promise<CachedTool[]>;

    'projects-updated': ProjectDetails[];
    'releases-updated': InstalledRelease[];

    'get-platform': Promise<string>;
    'get-app-version': Promise<string>;
    'promotion-clicked': Promise<void>;

    // ##### i18n #####
    'i18n:get-current-language': Promise<string>;
    'i18n:get-available-languages': Promise<string[]>;
    'i18n:get-all-translations': Promise<
        Record<string, Record<string, unknown>>
    >;
    'i18n:change-language': Promise<Record<string, Record<string, unknown>>>;
};

// biome-ignore lint/correctness/noUnusedVariables: Used but not explicitly
interface Window {
    electron: {
        // ##### user-preferences #####

        getUserPreferences: () => Promise<UserPreferences>;
        setUserPreferences: (
            prefs: UserPreferences,
        ) => Promise<UserPreferences>;
        setAutoStart: (
            autoStart: boolean,
            hidden: boolean,
        ) => Promise<SetAutoStartResult>;
        setAutoCheckUpdates: (enabled: boolean) => Promise<boolean>;

        openFileDialog: (
            defaultPath: string,
            title: string,
            filters?: Electron.FileFilter[],
        ) => Promise<Electron.OpenDialogReturnValue>;
        openDirectoryDialog: (
            defaultPath: string,
            title: string,
            filters?: Electron.FileFilter[],
        ) => Promise<Electron.OpenDialogReturnValue>;
        openShellFolder: (pathToOpen: string) => Promise<void>;

        showProjectMenu: (project: ProjectDetails) => Promise<void>;
        showReleaseMenu: (release: InstalledRelease) => Promise<void>;

        // ##### releases #####

        getAvailableReleases: () => Promise<ReleaseSummary[]>;
        getAvailablePrereleases: () => Promise<ReleaseSummary[]>;
        getInstalledReleases: () => Promise<InstalledRelease[]>;

        installRelease: (
            release: ReleaseSummary,
            mono: boolean,
        ) => Promise<InstallReleaseResult>;
        removeRelease: (
            release: InstalledRelease,
        ) => Promise<RemovedReleaseResult>;

        openEditorProjectManager: (release: InstalledRelease) => Promise<void>;
        checkAllReleasesValid: () => Promise<InstalledRelease[]>;
        clearReleaseCache: () => Promise<void>;

        // ##### projects #####

        getProjectsDetails: () => Promise<ProjectDetails[]>;
        createProject: (
            name: string,
            release: InstalledRelease,
            renderer: RendererType[4 | 5],
            withVSCode: boolean,
            withGit: boolean,
        ) => Promise<CreateProjectResult>;
        removeProject: (project: ProjectDetails) => Promise<ProjectDetails[]>;
        addProject: (path: string) => Promise<AddProjectToListResult>;
        setProjectEditor: (
            project: ProjectDetails,
            release: InstalledRelease,
        ) => Promise<ChangeProjectEditorResult>;
        launchProject: (project: ProjectDetails) => Promise<void>;
        checkProjectValid: (project: ProjectDetails) => Promise<ProjectDetails>;
        checkAllProjectsValid: () => Promise<ProjectDetails[]>;

        // ##### tools #####
        getInstalledTools: () => Promise<InstalledTool[]>;
        getCachedTools: (options?: {
            refreshIfStale?: boolean;
        }) => Promise<CachedTool[]>;
        refreshToolCache: () => Promise<CachedTool[]>;

        getPlatform: () => Promise<string>;
        getAppVersion: () => Promise<string>;

        // ##### OTHER #####
        promotionClicked: (payload: PromotionClickPayload) => Promise<void>;
        subscribeProjects: (
            callback: (projects: ProjectDetails[]) => void,
        ) => UnsubscribeFunction;
        subscribeReleases: (
            callback: (releases: InstalledRelease[]) => void,
        ) => UnsubscribeFunction;

        subscribeAppUpdates: (
            callback: (message: AppUpdateMessage) => void,
        ) => UnsubscribeFunction;

        openExternal: (url: string) => Promise<void>;

        relaunchApp: () => Promise<void>;
        installUpdateAndRestart: () => Promise<void>;
        checkForUpdates: () => Promise<void>;

        // ##### i18n #####
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
}
