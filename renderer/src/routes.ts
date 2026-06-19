export type View = 'projects' | 'installs' | 'settings' | 'help';

export const settingsTabs = [
    'projects',
    'installs',
    'appearance',
    'behavior',
    'tools',
    'updates',
] as const;

export type SettingsTab = (typeof settingsTabs)[number];

export const defaultSettingsTab: SettingsTab = 'projects';

export const appRoutePaths = {
    root: '/',
    projects: '/projects',
    projectNew: '/projects/new',
    installs: '/installs',
    installEditor: '/installs/install',
    settings: '/settings',
    settingsTab: (tab: SettingsTab) => `/settings/${tab}`,
    help: '/help',
    welcome: '/welcome',
    windowsSymlinkNotice: '/windows-symlink-notice',
} as const;

export const appViewRoutes: Record<View, string> = {
    projects: appRoutePaths.projects,
    installs: appRoutePaths.installs,
    settings: appRoutePaths.settingsTab(defaultSettingsTab),
    help: appRoutePaths.help,
};

export function getViewFromPathname(pathname: string): View {
    if (pathname.startsWith(appRoutePaths.installs)) {
        return 'installs';
    }

    if (pathname.startsWith(appRoutePaths.settings)) {
        return 'settings';
    }

    if (pathname.startsWith(appRoutePaths.help)) {
        return 'help';
    }

    return 'projects';
}

export function isSettingsTab(value: string | undefined): value is SettingsTab {
    return settingsTabs.some((tab) => tab === value);
}
