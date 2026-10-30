export type View =
    | 'projects'
    | 'exportTemplates'
    | 'installs'
    | 'settings'
    | 'help'
    | 'extensions';

export const settingsTabs = [
    'projects',
    'installs',
    'commandLine',
    'exportTemplates',
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
    exportTemplates: '/export-templates',
    installEditor: '/installs/install',
    settings: '/settings',
    settingsTab: (tab: SettingsTab) => `/settings/${tab}`,
    help: '/help',
    extensions: '/extensions',
    welcome: '/welcome',
} as const;

export const appViewRoutes: Record<View, string> = {
    projects: appRoutePaths.projects,
    installs: appRoutePaths.installs,
    exportTemplates: appRoutePaths.exportTemplates,
    settings: appRoutePaths.settingsTab(defaultSettingsTab),
    help: appRoutePaths.help,
    extensions: appRoutePaths.extensions,
};

/**
 * Resolves the active navigation view from the application pathname.
 * @param pathname - Current application pathname.
 */
export function getViewFromPathname(pathname: string): View {
    if (pathname === appRoutePaths.extensions) {
        return 'extensions';
    }

    if (pathname.startsWith(appRoutePaths.exportTemplates))
        return 'exportTemplates';
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
