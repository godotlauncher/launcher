import type { ElectronApplication } from '@playwright/test';
import type {
    CodeEditorIntegrationSettings,
    GitLfsTrackingPolicyDescriptor,
    InstalledRelease,
    LaunchProjectResult,
    ProjectDetails,
    ReleaseSummary,
    ToolIntegrationSummary,
    UserPreferences,
} from '@shared/contracts';

export type ElectronPage = Awaited<
    ReturnType<ElectronApplication['firstWindow']>
>;

export type ThemeConfig = {
    name: 'dark' | 'light';
    description: string;
    toggleTestId: 'themeDark' | 'themeLight' | 'themeAuto';
    colorScheme: 'dark' | 'light';
};

export type OnboardingFixturePlatform = 'win32' | 'darwin' | 'linux';

export type OnboardingFixtureStep =
    | 'welcome'
    | 'appearance'
    | 'setup'
    | 'preferences';

export type StubbedAppDataOptions = {
    preferences?: UserPreferences;
    projects?: ProjectDetails[];
    installedReleases?: InstalledRelease[];
    availableReleases?: ReleaseSummary[];
    availablePrereleases?: ReleaseSummary[];
    catalogRefreshError?: string;
    toolIntegrations?: ToolIntegrationSummary[];
    codeEditorSettings?: CodeEditorIntegrationSettings[];
    projectLaunchResult?: LaunchProjectResult;
    gitLfsTrackingPolicy?: GitLfsTrackingPolicyDescriptor;
};
