import { type ElectronApplication, expect } from '@playwright/test';
import type { CodeEditorIntegrationSettings } from '@shared/contracts';
import {
    prepareUpdatesScreenshot,
    releasePendingCodeEditorIntegrationRescan,
    stubCodeEditorIntegrationRescan,
    stubCodeEditorIntegrationSettings,
} from './runtime';
import {
    SAMPLE_VSCODE_SETTINGS_AVAILABLE,
    SAMPLE_VSCODE_SETTINGS_DISABLED,
    SAMPLE_VSCODE_SETTINGS_NOT_FOUND,
    SAMPLE_VSCODE_SETTINGS_OVERRIDDEN,
} from './sampleData';
import type { ElectronPage, ScreenshotConfig, ThemeConfig } from './types';
import {
    APP_UPDATE_MESSAGE,
    APP_UPDATE_RELEASE_URL,
    APP_UPDATE_VERSION,
} from './versions';

async function navigateToCodeEditorSettings(
    page: ElectronPage,
    electronApp: ElectronApplication,
    settings: CodeEditorIntegrationSettings,
    openDrawer = false,
) {
    await page.getByTestId('btnProjects').click();
    await stubCodeEditorIntegrationSettings(electronApp, [settings]);
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabCodeEditors').click();

    const integration = page.getByTestId('code-editor-integration-vscode');
    await expect(integration).toBeVisible({ timeout: 10000 });
    await expect(
        integration.getByText(
            settings.installation ? 'Available' : 'Not found',
            { exact: true },
        ),
    ).toBeVisible();

    const enabledSwitch = integration.getByRole('checkbox');
    if (settings.enabled) {
        await expect(enabledSwitch).toBeChecked();
    } else {
        await expect(enabledSwitch).not.toBeChecked();
    }

    if (openDrawer) {
        await integration.getByRole('button', { name: 'Edit' }).click();
        await expect(
            page.getByRole('dialog', {
                name: 'Visual Studio Code settings',
            }),
        ).toBeVisible({ timeout: 10000 });
    }

    await page.waitForTimeout(400);
}

async function closeCodeEditorSettingsDrawer(page: ElectronPage) {
    await page.keyboard.press('Escape');
    await expect(
        page.getByRole('dialog', {
            name: 'Visual Studio Code settings',
        }),
    ).not.toBeVisible();
    await page.waitForTimeout(200);
}

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
        fileBase: 'screen_settings_code_editors_available',
        description: 'Settings (Code Editors tab, VS Code available)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await navigateToCodeEditorSettings(
                page,
                electronApp,
                SAMPLE_VSCODE_SETTINGS_AVAILABLE,
            );
        },
    },
    {
        fileBase: 'screen_settings_code_editors_disabled',
        description: 'Settings (Code Editors tab, VS Code disabled)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await navigateToCodeEditorSettings(
                page,
                electronApp,
                SAMPLE_VSCODE_SETTINGS_DISABLED,
            );
        },
    },
    {
        fileBase: 'screen_settings_code_editors_not_found',
        description: 'Settings (Code Editors tab, VS Code not found)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await navigateToCodeEditorSettings(
                page,
                electronApp,
                SAMPLE_VSCODE_SETTINGS_NOT_FOUND,
            );
        },
    },
    {
        fileBase: 'screen_settings_code_editor_disable_in_use',
        description: 'Disable code editor used by projects confirmation',
        viewportHeight: 800,
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await navigateToCodeEditorSettings(
                page,
                electronApp,
                SAMPLE_VSCODE_SETTINGS_AVAILABLE,
            );

            const integration = page.getByTestId(
                'code-editor-integration-vscode',
            );
            await integration
                .getByRole('checkbox', {
                    name: 'Enabled: Visual Studio Code',
                })
                .click();

            const disableDialog = page.getByRole('dialog', {
                name: 'Disable Visual Studio Code?',
            });
            await expect(disableDialog).toBeVisible({ timeout: 10000 });
            await expect(disableDialog).toContainText(
                'Configured projects: 3. .NET projects: 1.',
            );
            await expect(disableDialog).toContainText(
                'Existing projects will keep this editor selection',
            );
            await page.waitForTimeout(400);
        },
        cleanup: async (page: ElectronPage) => {
            const cancelButton = page.getByRole('button', {
                name: 'Cancel',
                exact: true,
            });
            if (await cancelButton.isVisible().catch(() => false)) {
                await cancelButton.click();
            }
            await page.waitForTimeout(200);
        },
    },
    {
        fileBase: 'screen_settings_code_editor_rescanning',
        description: 'Code editor rescan in progress',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubCodeEditorIntegrationRescan(
                electronApp,
                SAMPLE_VSCODE_SETTINGS_NOT_FOUND,
                true,
            );
            await navigateToCodeEditorSettings(
                page,
                electronApp,
                SAMPLE_VSCODE_SETTINGS_NOT_FOUND,
            );

            const integration = page.getByTestId(
                'code-editor-integration-vscode',
            );
            await integration
                .getByTestId('btn-rescan-code-editor-vscode')
                .click();
            await expect(integration.getByRole('status')).toBeHidden();
            await expect(integration.getByRole('status')).toBeVisible({
                timeout: 10000,
            });
            await page.waitForTimeout(400);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            const integration = page.getByTestId(
                'code-editor-integration-vscode',
            );
            await releasePendingCodeEditorIntegrationRescan(electronApp);
            await expect(integration.getByRole('status')).not.toBeVisible({
                timeout: 10000,
            });
            await stubCodeEditorIntegrationRescan(
                electronApp,
                SAMPLE_VSCODE_SETTINGS_AVAILABLE,
            );
            await page.waitForTimeout(200);
        },
    },
    {
        fileBase: 'screen_settings_code_editors_drawer_defaults',
        description:
            'Settings (Code Editors tab, VS Code default settings drawer)',
        viewportHeight: 800,
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await navigateToCodeEditorSettings(
                page,
                electronApp,
                SAMPLE_VSCODE_SETTINGS_AVAILABLE,
                true,
            );
        },
        cleanup: closeCodeEditorSettingsDrawer,
    },
    {
        fileBase: 'screen_settings_code_editors_drawer_overrides',
        description:
            'Settings (Code Editors tab, VS Code overridden settings drawer)',
        viewportHeight: 800,
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await navigateToCodeEditorSettings(
                page,
                electronApp,
                SAMPLE_VSCODE_SETTINGS_OVERRIDDEN,
                true,
            );
        },
        cleanup: closeCodeEditorSettingsDrawer,
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
