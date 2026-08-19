import type { UserPreferences } from '../preferences/index.js';
import type {
    AvailableReleasesResult,
    CreateCustomEngineManifestResult,
    CustomEngineManifest,
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
    createCustomEngineManifest(
        outputDirectory: string,
        manifest: CustomEngineManifest,
    ): Promise<CreateCustomEngineManifestResult>;
    clearReleaseCache(): Promise<void>;
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
