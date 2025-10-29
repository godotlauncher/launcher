type LaunchPath = string;

type PublishedReleases = {
    releases: ReleaseSummary[];
    lastPublishDate: Date;
};
type ReleaseSummary = {
    version: string;
    version_number: number;
    name: string;
    published_at: string | null;
    draft: boolean;
    prerelease: boolean;
    assets: AssetSummary[];
    tag?: string;
};

type AssetSummary = {
    name: string;
    download_url: string;
    platform_tags: string[];
    mono: boolean;
};


type UserPreferences = {
    prefs_version: number;
    install_location: string;
    config_location: string;
    projects_location: string;
    post_launch_action: 'none' | 'minimize' | 'close_to_tray';
    auto_check_updates: boolean;
    auto_start: boolean;
    start_in_tray: boolean;
    confirm_project_remove: boolean;
    first_run: boolean;
    windows_enable_symlinks: boolean;
    windows_symlink_win_notify: boolean;
    vs_code_path?: string;
    language?: string; // 'system' for auto-detect, or locale code like 'en', 'es', 'fr'
};

type InstalledRelease = {
    version: string;
    version_number: number;
    install_path: string;
    editor_path: string;
    platform: string;
    arch: string;
    mono: boolean;
    prerelease: boolean;
    config_version: 4 | 5;
    published_at: string | null;
    valid: boolean;

};

type ProjectDetails = {
    name: string;
    version: string;
    version_number: number;
    renderer: string;
    path: string;
    editor_settings_path: string;
    editor_settings_file: string;
    last_opened: Date | null;
    open_windowed?: boolean;
    release: InstalledRelease;
    launch_path: string;
    config_version: 4 | 5;
    withVSCode: boolean;
    withGit: boolean;
    valid: boolean;

};

type BackendResult = {
    success: boolean;
    error?: string;
};

type InstallReleaseResult = BackendResult & {
    version: string;
    release?: InstalledRelease;
};

type RemovedReleaseResult = BackendResult & {
    version: string;
    mono: boolean;
    releases: InstalledRelease[];
};

type CreateProjectResult = BackendResult & {
    projectPath?: string;
    projectDetails?: ProjectDetails;
};

type AddProjectToListResult = BackendResult & {
    projects?: ProjectDetails[];
    newProject?: ProjectDetails;
};

type InstalledTool = {
    name: string;
    version: string | null;
    path: string;
};

type ChangeProjectEditorResult = BackendResult & {
    projects?: ProjectDetails[];
};


/**
 * Defines the types of renderers available for Godot Engine config version 5 (godot 4+).
 * 
 * @property {('FORWARD_PLUS' | 'MOBILE' | 'COMPATIBLE')} 5 - The renderer options for Godot 4+:
 *   - FORWARD_PLUS: Default renderer with advanced lighting features
 *   - MOBILE: Optimized renderer for mobile devices with limited capabilities
 *   - COMPATIBLE: Renderer designed for compatibility with older hardware
 */
type RendererType = {
    5: 'FORWARD_PLUS' | 'MOBILE' | 'COMPATIBLE';
};

type UnsubscribeFunction = () => void;

type SetAutoStartResult = {
    success: boolean;
    error?: string;
};

type AppUpdateMessage = {
    type: 'ready' | 'none' | 'error' | 'checking' | 'available' | 'downloading';
    available: boolean;
    downloaded: boolean;
    version?: string;
    message?: string;
};

type EventChannelMapping = {

    // ##### user-preferences #####
    'get-user-preferences': Promise<UserPreferences>;
    'set-user-preferences': Promise<UserPreferences>;
    'set-auto-start': Promise<SetAutoStartResult>;
    'set-auto-check-updates': Promise<bool>;

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

    'projects-updated': ProjectDetails[];
    'releases-updated': InstalledRelease[];

    'get-platform': Promise<string>;
    'get-app-version': Promise<string>;

    // ##### i18n #####
    'i18n:get-current-language': Promise<string>;
    'i18n:get-available-languages': Promise<string[]>;
    'i18n:get-all-translations': Promise<Record<string, Record<string, unknown>>>;
    'i18n:change-language': Promise<Record<string, Record<string, unknown>>>;
};

interface Window {
    electron: {

        // ##### user-preferences #####

        getUserPreferences: () => Promise<UserPreferences>;
        setUserPreferences: (prefs: UserPreferences) => Promise<UserPreferences>;
        setAutoStart: (
            autoStart: boolean,
            hidden: boolean
        ) => Promise<SetAutoStartResult>;
        setAutoCheckUpdates: (enabled: boolean) => Promise<boolean>;

        openFileDialog: (
            defaultPath: string,
            title: string,
            filters?: Electron.FileFilter[]
        ) => Promise<Electron.OpenDialogReturnValue>;
        openDirectoryDialog: (
            defaultPath: string,
            title: string,
            filters?: Electron.FileFilter[]
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
            mono: boolean
        ) => Promise<InstallReleaseResult>;
        removeRelease: (release: InstalledRelease) => Promise<RemovedReleaseResult>;

        openEditorProjectManager: (release: InstalledRelease) => Promise<void>;
        checkAllReleasesValid: () => Promise<InstalledRelease[]>;

        // ##### projects #####

        getProjectsDetails: () => Promise<ProjectDetails[]>;
        createProject: (
            name: string,
            release: InstalledRelease,
            renderer: RendererType[4 | 5],
            withVSCode: boolean,
            withGit: boolean
        ) => Promise<CreateProjectResult>;
        removeProject: (project: ProjectDetails) => Promise<ProjectDetails[]>;
        addProject: (path: string) => Promise<AddProjectToListResult>;
        setProjectEditor: (
            project: ProjectDetails,
            release: InstalledRelease
        ) => Promise<ChangeProjectEditorResult>;
        launchProject: (project: ProjectDetails) => Promise<void>;
        checkProjectValid: (project: ProjectDetails) => Promise<ProjectDetails>;
        checkAllProjectsValid: () => Promise<ProjectDetails[]>;

        // ##### tools #####
        getInstalledTools: () => Promise<InstalledTool[]>;

        getPlatform: () => Promise<string>;
        getAppVersion: () => Promise<string>;

        // ##### OTHER #####
        subscribeProjects: (
            callback: (projects: ProjectDetails[]) => void
        ) => UnsubscribeFunction;
        subscribeReleases: (
            callback: (releases: InstallRelease[]) => void
        ) => UnsubscribeFunction;

        subscribeAppUpdates: (
            callback: (message: AppUpdateMessage) => void
        ) => UnsubscribeFunction;

        openExternal: (url: string) => Promise<void>;

        relaunchApp: () => Promise<void>;
        installUpdateAndRestart: () => Promise<void>;
        checkForUpdates: () => Promise<void>;

        // ##### i18n #####
        i18n: {
            getCurrentLanguage: () => Promise<string>;
            getAvailableLanguages: () => Promise<string[]>;
            getAllTranslations: (language?: string) => Promise<Record<string, Record<string, unknown>>>;
            changeLanguage: (lang: string) => Promise<Record<string, Record<string, unknown>>>;
        };
    };
}
