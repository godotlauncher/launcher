import type { ElectronApplication } from '@playwright/test';
import type {
    AppUpdateMessage,
    CodeEditorIntegrationSettings,
    InstalledRelease,
    LaunchProjectResult,
    ProjectDetails,
    ReleaseSummary,
    UserPreferences,
} from '@shared/contracts';

export type ElectronPage = Awaited<
    ReturnType<ElectronApplication['firstWindow']>
>;

export type CachedTool = {
    name: string;
    path: string;
    version?: string;
    verified: boolean;
};

export type ThemeConfig = {
    name: 'dark' | 'light';
    description: string;
    toggleTestId: 'themeDark' | 'themeLight' | 'themeAuto';
    colorScheme: 'dark' | 'light';
};

export type OnboardingScreenshotPlatform = 'win32' | 'darwin' | 'linux';

export type OnboardingScreenshotStep =
    | 'welcome'
    | 'appearance'
    | 'setup'
    | 'preferences';

export type ScreenshotConfig = {
    fileBase: string;
    description: string;
    viewportHeight?: number;
    navigate: (
        page: ElectronPage,
        electronApp: ElectronApplication,
        theme: ThemeConfig,
    ) => Promise<void>;
    cleanup?: (
        page: ElectronPage,
        electronApp: ElectronApplication,
        theme: ThemeConfig,
    ) => Promise<void>;
};

export type UpdateScreenshotState = {
    preferences?: Partial<UserPreferences>;
    updateMessage?: AppUpdateMessage;
};

export type StubbedAppDataOptions = {
    preferences?: UserPreferences;
    projects?: ProjectDetails[];
    installedReleases?: InstalledRelease[];
    availableReleases?: ReleaseSummary[];
    availablePrereleases?: ReleaseSummary[];
    tools?: CachedTool[];
    codeEditorSettings?: CodeEditorIntegrationSettings[];
    projectLaunchResult?: LaunchProjectResult;
};
