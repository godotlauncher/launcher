import type { ElectronApplication } from '@playwright/test';
import { prepareUpdatesScreenshot } from './runtime';
import type { ElectronPage, ScreenshotConfig, ThemeConfig } from './types';
import {
    APP_UPDATE_MESSAGE,
    APP_UPDATE_RELEASE_URL,
    APP_UPDATE_VERSION,
} from './versions';

export const SETTINGS_SCREENSHOTS: ScreenshotConfig[] = [
    {
        fileBase: 'screen_settings_projects',
        description: 'Settings (Projects tab)',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabProjects').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_settings_installs',
        description: 'Settings (Installs tab)',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabInstalls').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_settings_appearance',
        description: 'Settings (Appearance tab)',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabAppearance').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_settings_behavior',
        description: 'Settings (Behavior tab)',
        viewportHeight: 800,
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabBehavior').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_settings_tools',
        description: 'Settings (Tools tab)',
        viewportHeight: 800,
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabTools').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_settings_updates',
        description: 'Settings (Updates tab)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareUpdatesScreenshot(page, electronApp, theme, {
                updateMessage: {
                    available: false,
                    downloaded: false,
                    type: 'none',
                    message: 'No updates available',
                },
            });
        },
    },
    {
        fileBase: 'screen_settings_updates_checking',
        description: 'Settings (Updates tab, checking)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareUpdatesScreenshot(page, electronApp, theme, {
                updateMessage: {
                    available: false,
                    downloaded: false,
                    type: 'checking',
                    message: 'Checking for updates...',
                },
            });
        },
    },
    {
        fileBase: 'screen_settings_updates_available',
        description: 'Settings (Updates tab, update available)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareUpdatesScreenshot(page, electronApp, theme, {
                updateMessage: {
                    available: true,
                    downloaded: false,
                    type: 'available',
                    version: APP_UPDATE_VERSION,
                    message: APP_UPDATE_MESSAGE,
                },
            });
        },
    },
    {
        fileBase: 'screen_settings_updates_downloading',
        description: 'Settings (Updates tab, downloading)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareUpdatesScreenshot(page, electronApp, theme, {
                updateMessage: {
                    available: true,
                    downloaded: false,
                    type: 'downloading',
                    version: APP_UPDATE_VERSION,
                    message: 'Downloading update: 55%',
                },
            });
        },
    },
    {
        fileBase: 'screen_settings_updates_ready',
        description: 'Settings (Updates tab, ready to install)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareUpdatesScreenshot(page, electronApp, theme, {
                updateMessage: {
                    available: true,
                    downloaded: true,
                    type: 'ready',
                    version: APP_UPDATE_VERSION,
                    message: 'Update downloaded, restart to install.',
                },
            });
        },
    },
    {
        fileBase: 'screen_settings_updates_manual',
        description: 'Settings (Updates tab, manual install)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareUpdatesScreenshot(page, electronApp, theme, {
                updateMessage: {
                    available: true,
                    downloaded: false,
                    type: 'manual',
                    version: APP_UPDATE_VERSION,
                    message: APP_UPDATE_MESSAGE,
                    url: APP_UPDATE_RELEASE_URL,
                },
            });
        },
    },
    {
        fileBase: 'screen_settings_updates_error',
        description: 'Settings (Updates tab, error)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareUpdatesScreenshot(page, electronApp, theme, {
                updateMessage: {
                    available: false,
                    downloaded: false,
                    type: 'error',
                    message: 'Failed to download update',
                },
            });
        },
    },
    {
        fileBase: 'screen_settings_updates_skipped',
        description: 'Settings (Updates tab, skipped version)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareUpdatesScreenshot(page, electronApp, theme, {
                preferences: {
                    skipped_app_update_version: APP_UPDATE_VERSION,
                },
                updateMessage: {
                    available: false,
                    downloaded: false,
                    type: 'none',
                    version: APP_UPDATE_VERSION,
                    message: 'No updates available',
                },
            });
        },
    },
    {
        fileBase: 'screen_settings_updates_manual_override',
        description:
            'Settings (Updates tab, skipped version manually overridden)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareUpdatesScreenshot(page, electronApp, theme, {
                preferences: {
                    skipped_app_update_version: APP_UPDATE_VERSION,
                },
                updateMessage: {
                    available: true,
                    downloaded: false,
                    type: 'available',
                    version: APP_UPDATE_VERSION,
                    message: APP_UPDATE_MESSAGE,
                },
            });
        },
    },
];
