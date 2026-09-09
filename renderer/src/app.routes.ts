export type View = 'projects' | 'installs' | 'settings' | 'help';

export const settingsTabs = [
    'projects',
    'installs',
    'appearance',
    'behavior',
    'codeEditors',
    'tools',
    'connections',
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

/**
 * Checks whether a pathname targets the Connections settings panel.
 *
 * @param pathname - Current application pathname.
 * @returns Whether the Connections promotional shortcut should be active.
 */
export function isConnectionsPathname(pathname: string): boolean {
    return pathname === appRoutePaths.settingsTab('connections');
}
