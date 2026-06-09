import {
    expect,
    test,
    _electron,
    type ElectronApplication,
} from '@playwright/test';
import type {
    AppUpdateMessage,
    InstalledRelease,
    ProjectDetails,
    ReleaseSummary,
    UserPreferences,
} from '@shared';
import releasesCache from './fixtures/releases.json' with { type: 'json' };
import prereleasesCache from './fixtures/prereleases.json' with { type: 'json' };
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

process.env.GODOT_LAUNCHER_DOCS_SCREENSHOTS = '1';

type ElectronPage = Awaited<ReturnType<ElectronApplication['firstWindow']>>;

type CachedTool = {
    name: string;
    path: string;
    version?: string;
    verified: boolean;
};

type ThemeConfig = {
    name: 'dark' | 'light';
    description: string;
    toggleTestId: 'themeDark' | 'themeLight' | 'themeAuto';
    colorScheme: 'dark' | 'light';
};

const THEMES: ThemeConfig[] = [
    {
        name: 'dark',
        description: 'dark mode',
        toggleTestId: 'themeDark',
        colorScheme: 'dark',
    },
    {
        name: 'light',
        description: 'light mode',
        toggleTestId: 'themeLight',
        colorScheme: 'light',
    },
];

type ScreenshotConfig = {
    fileBase: string;
    description: string;
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

type UpdateScreenshotState = {
    preferences?: Partial<UserPreferences>;
    updateMessage?: AppUpdateMessage;
};

type StubbedAppDataOptions = {
    preferences?: UserPreferences;
    projects?: ProjectDetails[];
    installedReleases?: InstalledRelease[];
    availableReleases?: ReleaseSummary[];
    availablePrereleases?: ReleaseSummary[];
    tools?: CachedTool[];
};

const SCREENSHOTS: ScreenshotConfig[] = [
    // Projects
    {
        fileBase: 'screen_projects_view',
        description: 'Projects view',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnProjects').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_projects_missing_editor',
        description: 'Projects view with unavailable editor',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp, {
                projects: SAMPLE_PROJECTS_WITH_MISSING_EDITOR,
                installedReleases:
                    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM_AND_UNAVAILABLE,
            });
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            await expect(
                page.getByRole('button', {
                    name: 'Archive-Prototype',
                    exact: true,
                }),
            ).toBeVisible({ timeout: 10000 });
            await page.waitForTimeout(600);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
        },
    },
    {
        fileBase: 'screen_projects_editor_resolution',
        description: 'Add Project editor resolution dialog',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp, {
                availableReleases:
                    SAMPLE_AVAILABLE_RELEASES_WITH_EDITOR_RESOLUTION,
            });
            await stubAddProjectEditorResolution(electronApp);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectAdd').click();
            await expect(
                page.getByRole('dialog', {
                    name: 'Editor version required',
                }),
            ).toBeVisible({ timeout: 10000 });
            await page.waitForTimeout(400);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            const cancelButton = page.getByTestId('btnAlert2');
            if (await cancelButton.isVisible().catch(() => false)) {
                await cancelButton.click();
            }
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
        },
    },
    {
        fileBase: 'screen_projects_editor_resolution_options',
        description: 'Add Project editor resolution dialog options',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp, {
                availableReleases:
                    SAMPLE_AVAILABLE_RELEASES_WITH_EDITOR_RESOLUTION,
            });
            await stubAddProjectEditorResolution(electronApp);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectAdd').click();
            await expect(
                page.getByRole('dialog', {
                    name: 'Editor version required',
                }),
            ).toBeVisible({ timeout: 10000 });
            await page.getByRole('button', { name: 'Options' }).click();
            await page.waitForTimeout(400);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            const cancelButton = page.getByTestId('btnAlert2');
            if (await cancelButton.isVisible().catch(() => false)) {
                await cancelButton.click();
            }
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
        },
    },
    {
        fileBase: 'screen_projects_vscode_config_recovered',
        description: 'Add Project recovered VS Code config warning',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            await stubAddProjectRecoveredVSCodeConfig(electronApp);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectAdd').click();
            await expect(
                page.getByRole('dialog', {
                    name: 'Warning',
                }),
            ).toBeVisible({ timeout: 10000 });
            await expect(
                page.getByText('.vscode/extensions.json'),
            ).toBeVisible();
            await page.waitForTimeout(400);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            const okButton = page.getByTestId('btnAlertOk');
            if (await okButton.isVisible().catch(() => false)) {
                await okButton.click();
            }
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
        },
    },
    {
        fileBase: 'screen_projects_new_project',
        description: 'New Project view',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubInstalledTools(electronApp, DEFAULT_TOOLS);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('My-Next-Awesome-Game');
            await page.waitForTimeout(600);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubInstalledTools(electronApp, DEFAULT_TOOLS);
            await page.getByTestId('btnCloseCreateProject').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_projects_new_project_custom_editor',
        description: 'New Project view with a custom editor selected',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp, {
                installedReleases: SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
            });
            await stubInstalledTools(electronApp, DEFAULT_TOOLS);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('Custom-Editor-Game');
            const selectedCustomRelease = await page
                .locator('select')
                .first()
                .evaluate((select) => {
                    const releaseSelect = select as HTMLSelectElement;
                    const customOption = Array.from(releaseSelect.options).find(
                        (option) =>
                            option.textContent?.includes('Studio Custom 4.7'),
                    );

                    if (!customOption) {
                        return false;
                    }

                    releaseSelect.value = customOption.value;
                    releaseSelect.dispatchEvent(
                        new Event('change', { bubbles: true }),
                    );
                    return true;
                });
            expect(selectedCustomRelease).toBe(true);
            await page.waitForTimeout(600);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await page.getByTestId('btnCloseCreateProject').click();
            await page.waitForTimeout(600);
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
        },
    },
    {
        fileBase: 'screen_projects_new_project_no_git',
        description: 'New Project view when Git is not installed',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubInstalledTools(electronApp, TOOLS_NO_GIT);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('My-Next-Awesome-Game');
            await page.waitForTimeout(600);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await page.getByTestId('btnCloseCreateProject').click();
            await page.waitForTimeout(600);
            await stubInstalledTools(electronApp, DEFAULT_TOOLS);
        },
    },
    {
        fileBase: 'screen_projects_new_project_no_vscode',
        description: 'New Project view when VS Code is not installed',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubInstalledTools(electronApp, TOOLS_NO_VSCODE);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('My-Next-Awesome-Game');
            await page.waitForTimeout(600);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await page.getByTestId('btnCloseCreateProject').click();
            await page.waitForTimeout(600);
            await stubInstalledTools(electronApp, DEFAULT_TOOLS);
        },
    },
    {
        fileBase: 'screen_projects_new_project_no_tools',
        description: 'New Project view when Git and VS Code are not installed',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubInstalledTools(electronApp, TOOLS_NONE);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('My-Next-Awesome-Game');
            await page.waitForTimeout(600);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await page.getByTestId('btnCloseCreateProject').click();
            await page.waitForTimeout(600);
            await stubInstalledTools(electronApp, DEFAULT_TOOLS);
        },
    },
    {
        fileBase: 'screen_projects_new_project_overwrite_path',
        description: 'New Project view with overwrite path enabled',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubInstalledTools(electronApp, DEFAULT_TOOLS);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('My-Next-Awesome-Game');
            await page.getByTestId('checkboxOverwriteProjectPath').check();
            await page.waitForTimeout(600);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await page.getByTestId('btnCloseCreateProject').click();
            await page.waitForTimeout(600);
            await stubInstalledTools(electronApp, DEFAULT_TOOLS);
        },
    },
    {
        fileBase: 'screen_projects_drop_overlay',
        description: 'Projects view drag-and-drop prompt',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnProjects').click();
            await page.waitForTimeout(600);
            await showProjectsDropOverlay(page);
            await page.waitForTimeout(400);
        },
        cleanup: async (page: ElectronPage) => {
            await hideProjectsDropOverlay(page);
            await page.waitForTimeout(200);
        },
    },
    {
        fileBase: 'screen_projects_update_available',
        description: 'Projects view with update banner (available)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppUpdateBannerScreenshot(page, electronApp, theme, {
                available: true,
                downloaded: false,
                type: 'available',
                version: '1.9.1',
                message: 'New version available: 1.9.1',
            });
        },
    },
    {
        fileBase: 'screen_projects_update_downloading',
        description: 'Projects view with update banner (downloading)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppUpdateBannerScreenshot(page, electronApp, theme, {
                available: true,
                downloaded: false,
                type: 'downloading',
                version: '1.9.1',
                message: 'Downloading update: 55%',
            });
        },
    },
    {
        fileBase: 'screen_projects_update_ready',
        description: 'Projects view with update banner (ready)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppUpdateBannerScreenshot(page, electronApp, theme, {
                available: true,
                downloaded: true,
                type: 'ready',
                version: '1.9.1',
                message: 'Update downloaded, restart to install.',
            });
        },
    },
    {
        fileBase: 'screen_projects_update_error',
        description: 'Projects view with update banner (error)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppUpdateBannerScreenshot(page, electronApp, theme, {
                available: true,
                downloaded: false,
                type: 'error',
                version: '1.9.1',
                message: 'Failed to download update',
            });
        },
    },

    // Installs
    {
        fileBase: 'screen_installs_view',
        description: 'Installs view',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_installs_custom_editors',
        description: 'Installs view with custom and unavailable editors',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp, {
                installedReleases:
                    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM_AND_UNAVAILABLE,
            });
            await applyTheme(page, theme);
            await page.getByTestId('btnInstalls').click();
            await expect(page.getByText('Studio Custom 4.7')).toBeVisible({
                timeout: 10000,
            });
            await page.waitForTimeout(600);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
        },
    },
    {
        fileBase: 'screen_installs_custom_manifest_drop',
        description: 'Installs view custom editor manifest drop prompt',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            await page.waitForTimeout(600);
            await showInstallsManifestDropOverlay(page, true);
            await page.waitForTimeout(400);
        },
        cleanup: async (page: ElectronPage) => {
            await hideInstallsManifestDropOverlay(page, true);
            await page.waitForTimeout(200);
        },
    },
    {
        fileBase: 'screen_installs_custom_manifest_drop_unsupported',
        description: 'Installs view unsupported custom editor manifest prompt',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            await page.waitForTimeout(600);
            await showInstallsManifestDropOverlay(page, false);
            await page.waitForTimeout(400);
        },
        cleanup: async (page: ElectronPage) => {
            await hideInstallsManifestDropOverlay(page, false);
            await page.waitForTimeout(200);
        },
    },
    {
        fileBase: 'screen_installs_custom_editor_replace',
        description: 'Replace custom editor confirmation dialog',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp, {
                installedReleases: SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
            });
            await stubCustomEditorDuplicateRegistration(electronApp);
            await applyTheme(page, theme);
            await page.getByTestId('btnInstalls').click();
            await page.getByTestId('btnAddCustomEngine').click();
            await expect(
                page.getByRole('dialog', {
                    name: 'Replace custom editor?',
                }),
            ).toBeVisible({ timeout: 10000 });
            await page.waitForTimeout(400);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            const cancelButton = page.getByTestId('btnAlert1');
            if (await cancelButton.isVisible().catch(() => false)) {
                await cancelButton.click();
            }
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
        },
    },
    {
        fileBase: 'screen_installs_new_version',
        description: 'Install New Version view',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            const installButton = page.getByTestId('btnInstallEditor');
            const closeButton = page.getByTestId('btnCloseInstallEditor');

            for (let attempt = 0; attempt < 3; attempt++) {
                await expect(installButton).toBeVisible({ timeout: 10000 });
                await installButton.click({ force: true });
                if (await closeButton.isVisible().catch(() => false)) {
                    break;
                }
                await page.waitForTimeout(250);
            }

            await expect(closeButton).toBeVisible({ timeout: 10000 });
            await page.waitForTimeout(400);
        },
        cleanup: async (page: ElectronPage) => {
            const closeButton = page.getByTestId('btnCloseInstallEditor');
            if (await closeButton.isVisible().catch(() => false)) {
                await closeButton.click();
            } else {
                await page.keyboard.press('Escape');
            }
            await page.waitForTimeout(600);
        },
    },

    // Settings
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
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabBehavior').click();
            await page.setViewportSize({ width: 1024, height: 800 });
            await page.waitForTimeout(600);
        },
        cleanup: async (page: ElectronPage) => {
            await page.setViewportSize({ width: 1024, height: 600 });
        },
    },
    {
        fileBase: 'screen_settings_tools',
        description: 'Settings (Tools tab)',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabTools').click();
            await page.setViewportSize({ width: 1024, height: 800 });
            await page.waitForTimeout(600);
        },
        cleanup: async (page: ElectronPage) => {
            await page.setViewportSize({ width: 1024, height: 600 });
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
                    version: '1.9.1',
                    message: 'New version available: 1.9.1',
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
                    version: '1.9.1',
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
                    version: '1.9.1',
                    message: 'Update downloaded, restart to install.',
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
                    skipped_app_update_version: '1.9.1',
                },
                updateMessage: {
                    available: false,
                    downloaded: false,
                    type: 'none',
                    version: '1.9.1',
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
                    skipped_app_update_version: '1.9.1',
                },
                updateMessage: {
                    available: true,
                    downloaded: false,
                    type: 'available',
                    version: '1.9.1',
                    message: 'New version available: 1.9.1',
                },
            });
        },
    },

    // Help
    {
        fileBase: 'screen_help_view',
        description: 'Help view',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnHelp').click();
            await page.waitForTimeout(600);
        },
    },
];

const SAMPLE_INSTALLED_RELEASES: InstalledRelease[] = [
    {
        version: '4.4.1-stable',
        version_number: 4.4,
        install_path: '/Applications/Godot_4.4.1',
        editor_path: '/Applications/Godot_4.4.1/Godot.app/Contents/MacOS/Godot',
        platform: 'darwin',
        arch: 'universal',
        mono: false,
        prerelease: false,
        config_version: 5,
        published_at: '2025-03-26T09:19:36Z',
        valid: true,
    },
    {
        version: '4.6.1-stable',
        version_number: 4.6,
        install_path: '/Applications/Godot_4.6.1_mono',
        editor_path:
            '/Applications/Godot_4.6.1_mono/Godot_mono.app/Contents/MacOS/Godot',
        platform: 'darwin',
        arch: 'universal',
        mono: true,
        prerelease: false,
        config_version: 5,
        published_at: '2026-02-16T20:26:38Z',
        valid: true,
    },
];

const SAMPLE_CUSTOM_RELEASE: InstalledRelease = {
    version: '4.7.0-custom.1',
    name: 'Studio Custom 4.7',
    base_version: '4.7',
    flavor: 'gdscript',
    version_number: 4.7,
    install_path: '/Users/docs/Godot/Editors/StudioCustom47',
    editor_path:
        '/Users/docs/Godot/Editors/StudioCustom47/Godot.app/Contents/MacOS/Godot',
    platform: 'darwin',
    arch: 'universal',
    mono: false,
    prerelease: false,
    config_version: 5,
    published_at: null,
    valid: true,
    source: 'custom',
    manifest_path:
        '/Users/docs/Godot/Editors/StudioCustom47/godotlauncher-editor-manifest.json',
    managed_by_launcher: false,
};

const SAMPLE_UNAVAILABLE_RELEASE: InstalledRelease = {
    version: '4.5.1-stable',
    version_number: 4.5,
    install_path: '/Volumes/Archive/Godot_4.5.1',
    editor_path: '/Volumes/Archive/Godot_4.5.1/Godot.app/Contents/MacOS/Godot',
    platform: 'darwin',
    arch: 'universal',
    mono: false,
    prerelease: false,
    config_version: 5,
    published_at: '2025-08-18T17:04:20Z',
    valid: false,
};

const SAMPLE_UNAVAILABLE_CUSTOM_RELEASE: InstalledRelease = {
    version: '4.3.0-stable',
    name: 'Experimental Fork',
    base_version: '4.3',
    flavor: 'gdscript',
    version_number: 4.3,
    install_path: '/Volumes/Archive/Godot/ExperimentalFork',
    editor_path:
        '/Volumes/Archive/Godot/ExperimentalFork/Godot.app/Contents/MacOS/Godot',
    platform: 'darwin',
    arch: 'universal',
    mono: false,
    prerelease: false,
    config_version: 5,
    published_at: null,
    valid: false,
    source: 'custom',
    manifest_path:
        '/Volumes/Archive/Godot/ExperimentalFork/godotlauncher-editor-manifest.json',
    managed_by_launcher: false,
};

const SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM: InstalledRelease[] = [
    ...SAMPLE_INSTALLED_RELEASES,
    SAMPLE_CUSTOM_RELEASE,
];

const SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM_AND_UNAVAILABLE: InstalledRelease[] =
    [
        ...SAMPLE_INSTALLED_RELEASES,
        SAMPLE_CUSTOM_RELEASE,
        SAMPLE_UNAVAILABLE_RELEASE,
        SAMPLE_UNAVAILABLE_CUSTOM_RELEASE,
    ];

const SAMPLE_EDITOR_RESOLUTION_FALLBACK_RELEASE: InstalledRelease = {
    version: '4.6.2-stable',
    version_number: 4.6,
    install_path: '/Applications/Godot_4.6.2',
    editor_path: '/Applications/Godot_4.6.2/Godot.app/Contents/MacOS/Godot',
    platform: 'darwin',
    arch: 'universal',
    mono: false,
    prerelease: false,
    config_version: 5,
    published_at: '2026-03-18T12:00:00Z',
    valid: true,
};

const SAMPLE_PROJECTS: ProjectDetails[] = [
    {
        name: 'My-Awesome-Game',
        path: '/Users/docs/Godot/Projects/my-awesome-game',
        version: '4.4.1-stable',
        version_number: 4.4,
        renderer: 'FORWARD_PLUS',
        editor_settings_path:
            '/Users/docs/Godot/Projects/my-awesome-game/.godot',
        editor_settings_file:
            '/Users/docs/Godot/Projects/my-awesome-game/.godot/editor_settings-4.4.tres',
        last_opened: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        open_windowed: false,
        release: SAMPLE_INSTALLED_RELEASES[0],
        launch_path: '/Applications/Godot_4.4.1/Godot.app/Contents/MacOS/Godot',
        config_version: 5,
        withVSCode: true,
        withGit: true,
        valid: true,
    },
    {
        name: 'My-Other-Game',
        path: '/Users/docs/Godot/Projects/my-other-game',
        version: '4.6.1-stable',
        version_number: 4.6,
        renderer: 'FORWARD_PLUS',
        editor_settings_path: '/Users/docs/Godot/Projects/my-other-game/.godot',
        editor_settings_file:
            '/Users/docs/Godot/Projects/my-other-game/.godot/editor_settings-4.6.tres',
        last_opened: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        open_windowed: false,
        release: SAMPLE_INSTALLED_RELEASES[1],
        launch_path:
            '/Applications/Godot_4.6.1_mono/Godot_mono.app/Contents/MacOS/Godot',
        config_version: 5,
        withVSCode: true,
        withGit: true,
        valid: true,
    },
];

const SAMPLE_PROJECT_WITH_MISSING_EDITOR: ProjectDetails = {
    name: 'Archive-Prototype',
    path: '/Volumes/Archive/Godot/Projects/archive-prototype',
    version: SAMPLE_UNAVAILABLE_RELEASE.version,
    version_number: SAMPLE_UNAVAILABLE_RELEASE.version_number,
    renderer: 'FORWARD_PLUS',
    editor_settings_path:
        '/Volumes/Archive/Godot/Projects/archive-prototype/.godot',
    editor_settings_file:
        '/Volumes/Archive/Godot/Projects/archive-prototype/.godot/editor_settings-4.5.tres',
    last_opened: new Date(Date.now() - 12 * 60 * 60 * 1000),
    open_windowed: false,
    release: SAMPLE_UNAVAILABLE_RELEASE,
    launch_path: SAMPLE_UNAVAILABLE_RELEASE.editor_path,
    config_version: 5,
    withVSCode: false,
    withGit: true,
    valid: false,
    invalid_reason: 'missing_editor',
};

const SAMPLE_PROJECTS_WITH_MISSING_EDITOR: ProjectDetails[] = [
    SAMPLE_PROJECT_WITH_MISSING_EDITOR,
    ...SAMPLE_PROJECTS,
];

const SAMPLE_RELEASES_CACHE_FILE = releasesCache;

const SAMPLE_PRERELEASE_CACHE_FILE = prereleasesCache;

const SAMPLE_AVAILABLE_RELEASES: ReleaseSummary[] =
    SAMPLE_RELEASES_CACHE_FILE.releases;

const SAMPLE_AVAILABLE_PRERELEASES: ReleaseSummary[] =
    SAMPLE_PRERELEASE_CACHE_FILE.releases;

const SAMPLE_EDITOR_RESOLUTION_AVAILABLE_RELEASE: ReleaseSummary = {
    version: '4.6.3-stable',
    version_number: 4.6,
    name: '4.6.3-stable',
    published_at: '2026-05-12T12:00:00Z',
    draft: false,
    prerelease: false,
    assets: [],
};

const SAMPLE_AVAILABLE_RELEASES_WITH_EDITOR_RESOLUTION: ReleaseSummary[] = [
    SAMPLE_EDITOR_RESOLUTION_AVAILABLE_RELEASE,
    ...SAMPLE_AVAILABLE_RELEASES,
];

const SAMPLE_PREFS: UserPreferences = {
    prefs_version: 3,
    install_location: '/Users/docs/Godot/Editors',
    config_location: '/Users/docs/.gd-launcher',
    projects_location: '/Users/docs/Godot/Projects',
    post_launch_action: 'close_to_tray',
    auto_check_updates: true,
    receive_beta_updates: false,
    auto_start: true,
    start_in_tray: true,
    confirm_project_remove: true,
    first_run: false,
    windows_enable_symlinks: true,
    windows_symlink_win_notify: true,
    vs_code_path: '/Applications/Visual Studio Code.app',
    language: 'system',
};

function createPreferences(
    overrides: Partial<UserPreferences> = {},
): UserPreferences {
    return {
        ...SAMPLE_PREFS,
        ...overrides,
    };
}

const DEFAULT_TOOLS: CachedTool[] = [
    { name: 'Git', path: '/usr/bin/git', version: '2.45.0', verified: true },
    {
        name: 'VSCode',
        path: '/Applications/Visual Studio Code.app',
        version: '1.95.0',
        verified: true,
    },
];

const TOOLS_NO_GIT: CachedTool[] = DEFAULT_TOOLS.filter(
    (tool) => tool.name !== 'Git',
);

const TOOLS_NO_VSCODE: CachedTool[] = DEFAULT_TOOLS.filter(
    (tool) => tool.name !== 'VSCode',
);

const TOOLS_NONE: CachedTool[] = [];

async function writeJson(file: string, data: unknown) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

async function seedLauncherData(homeDir: string) {
    const configDir = path.join(homeDir, '.gd-launcher');
    await fs.mkdir(configDir, { recursive: true });
    await writeJson(path.join(configDir, 'projects.json'), SAMPLE_PROJECTS);
    await writeJson(
        path.join(configDir, 'installed-releases.json'),
        SAMPLE_INSTALLED_RELEASES,
    );
    await writeJson(
        path.join(configDir, 'releases.json'),
        SAMPLE_RELEASES_CACHE_FILE,
    );
    await writeJson(
        path.join(configDir, 'prereleases.json'),
        SAMPLE_PRERELEASE_CACHE_FILE,
    );
    await writeJson(path.join(configDir, 'prefs.json'), SAMPLE_PREFS);
}

async function createFixtureHome() {
    const tempHome = await fs.mkdtemp(
        path.join(os.tmpdir(), 'gd-launcher-docs-'),
    );
    await seedLauncherData(tempHome);
    return tempHome;
}

async function waitForPreloadScript(appWindow: ElectronPage) {
    await appWindow.waitForFunction(
        () => Boolean((window as Window & { electron?: unknown }).electron),
        null,
        { timeout: 10000 },
    );
}

async function showProjectsDropOverlay(page: ElectronPage) {
    await page.evaluate(() => {
        const title = document.querySelector('[data-testid="projectsTitle"]');
        const container =
            title?.closest(
                'div.flex.flex-col.h-full.w-full.overflow-auto.p-1',
            ) ??
            document.querySelector(
                'div.flex.flex-col.h-full.w-full.overflow-auto.p-1',
            );
        if (!container) return;

        const dataTransfer = new DataTransfer();
        const dragEnter = new DragEvent('dragenter', {
            dataTransfer,
            bubbles: true,
            cancelable: true,
        });
        container.dispatchEvent(dragEnter);
    });
}

async function hideProjectsDropOverlay(page: ElectronPage) {
    await page.evaluate(() => {
        const title = document.querySelector('[data-testid="projectsTitle"]');
        const container =
            title?.closest(
                'div.flex.flex-col.h-full.w-full.overflow-auto.p-1',
            ) ??
            document.querySelector(
                'div.flex.flex-col.h-full.w-full.overflow-auto.p-1',
            );
        if (!container) return;

        const dataTransfer = new DataTransfer();
        const dragLeave = new DragEvent('dragleave', {
            dataTransfer,
            bubbles: true,
            cancelable: true,
        });
        container.dispatchEvent(dragLeave);
    });
}

function getManifestFileName(supported: boolean) {
    return supported
        ? 'godotlauncher-editor-manifest.json'
        : 'godot-editor-manifest.json';
}

async function showInstallsManifestDropOverlay(
    page: ElectronPage,
    supported: boolean,
) {
    await page.evaluate((fileName) => {
        const title = document.querySelector('[data-testid="installsTitle"]');
        const container =
            title?.closest('section') ??
            document.querySelector('section[aria-label]');
        if (!container) return;

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(
            new File(['{}'], fileName, { type: 'application/json' }),
        );
        const dragEnter = new DragEvent('dragenter', {
            dataTransfer,
            bubbles: true,
            cancelable: true,
        });
        container.dispatchEvent(dragEnter);
    }, getManifestFileName(supported));
}

async function hideInstallsManifestDropOverlay(
    page: ElectronPage,
    supported: boolean,
) {
    await page.evaluate((fileName) => {
        const title = document.querySelector('[data-testid="installsTitle"]');
        const container =
            title?.closest('section') ??
            document.querySelector('section[aria-label]');
        if (!container) return;

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(
            new File(['{}'], fileName, { type: 'application/json' }),
        );
        const dragLeave = new DragEvent('dragleave', {
            dataTransfer,
            bubbles: true,
            cancelable: true,
        });
        container.dispatchEvent(dragLeave);
    }, getManifestFileName(supported));
}

async function applyTheme(page: ElectronPage, theme: ThemeConfig) {
    await page.emulateMedia({ colorScheme: theme.colorScheme });
    await expect(page.getByTestId('btnSettings')).toBeVisible({
        timeout: 15000,
    });
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabAppearance').click();
    await page.getByTestId(theme.toggleTestId).check();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('btnProjects')).toBeVisible({
        timeout: 15000,
    });
    await page.getByTestId('btnProjects').click();
}

async function stubAppData(
    electronApp: ElectronApplication,
    preferences: UserPreferences,
    projects: ProjectDetails[],
    installedReleases: InstalledRelease[],
    availableReleases: ReleaseSummary[],
    availablePrereleases: ReleaseSummary[],
) {
    await electronApp.evaluate(
        (
            { ipcMain, BrowserWindow },
            {
                injectedPreferences,
                injectedProjects,
                injectedInstalledReleases,
                injectedAvailableReleases,
                injectedAvailablePrereleases,
            }: {
                injectedPreferences: UserPreferences;
                injectedProjects: ProjectDetails[];
                injectedInstalledReleases: InstalledRelease[];
                injectedAvailableReleases: ReleaseSummary[];
                injectedAvailablePrereleases: ReleaseSummary[];
            },
        ) => {
            const normalizedInstalledReleases = injectedInstalledReleases.map(
                (release) => ({
                    ...release,
                    valid: release.valid ?? true,
                }),
            );
            const normalizedProjects = injectedProjects.map((project) => ({
                ...project,
                last_opened: project.last_opened
                    ? new Date(project.last_opened as unknown as string)
                    : null,
                release: {
                    ...project.release,
                    valid: project.release.valid ?? true,
                },
                valid: project.valid ?? true,
            }));

            ipcMain.removeHandler('get-user-preferences');
            ipcMain.handle(
                'get-user-preferences',
                async () => injectedPreferences,
            );

            ipcMain.removeHandler('set-user-preferences');
            ipcMain.handle(
                'set-user-preferences',
                async (_, nextPrefs: UserPreferences) => nextPrefs,
            );

            ipcMain.removeHandler('get-projects-details');
            ipcMain.handle(
                'get-projects-details',
                async () => normalizedProjects,
            );

            ipcMain.removeHandler('check-all-projects-valid');
            ipcMain.handle(
                'check-all-projects-valid',
                async () => normalizedProjects,
            );

            ipcMain.removeHandler('check-project-valid');
            ipcMain.handle('check-project-valid', async (_, project) => ({
                ...project,
                release: {
                    ...project.release,
                    valid: project.release.valid ?? true,
                },
                valid: project.valid ?? true,
            }));

            ipcMain.removeHandler('get-installed-releases');
            ipcMain.handle(
                'get-installed-releases',
                async () => normalizedInstalledReleases,
            );

            ipcMain.removeHandler('check-all-releases-valid');
            ipcMain.handle(
                'check-all-releases-valid',
                async () => normalizedInstalledReleases,
            );

            ipcMain.removeHandler('get-available-releases');
            ipcMain.handle(
                'get-available-releases',
                async () => ({ releases: injectedAvailableReleases }),
            );

            ipcMain.removeHandler('get-available-prereleases');
            ipcMain.handle(
                'get-available-prereleases',
                async () => ({ releases: injectedAvailablePrereleases }),
            );

            for (const win of BrowserWindow.getAllWindows()) {
                const webContents = win.webContents as any;
                webContents.__docsProjects = normalizedProjects;
                webContents.__docsInstalledReleases =
                    normalizedInstalledReleases;

                if (webContents.__docsPatchedSend) {
                    continue;
                }

                const originalSend = webContents.send.bind(webContents);
                webContents.__docsPatchedSend = true;
                webContents.send = (
                    channel: string,
                    payload: unknown,
                    ...args: unknown[]
                ) => {
                    if (channel === 'projects-updated') {
                        return originalSend(
                            channel,
                            webContents.__docsProjects ?? payload,
                            ...args,
                        );
                    }
                    if (channel === 'releases-updated') {
                        return originalSend(
                            channel,
                            webContents.__docsInstalledReleases ?? payload,
                            ...args,
                        );
                    }
                    return originalSend(channel, payload, ...args);
                };
            }
        },
        {
            injectedPreferences: preferences,
            injectedProjects: projects,
            injectedInstalledReleases: installedReleases,
            injectedAvailableReleases: availableReleases,
            injectedAvailablePrereleases: availablePrereleases,
        },
    );
}

async function prepareAppWithStubbedData(
    page: ElectronPage,
    electronApp: ElectronApplication,
    options: StubbedAppDataOptions = {},
) {
    await stubAppData(
        electronApp,
        options.preferences ?? SAMPLE_PREFS,
        options.projects ?? SAMPLE_PROJECTS,
        options.installedReleases ?? SAMPLE_INSTALLED_RELEASES,
        options.availableReleases ?? SAMPLE_AVAILABLE_RELEASES,
        options.availablePrereleases ?? SAMPLE_AVAILABLE_PRERELEASES,
    );
    await stubInstalledTools(electronApp, options.tools ?? DEFAULT_TOOLS);
    await page.reload();
    await waitForPreloadScript(page);
    await page.setViewportSize({ width: 1024, height: 600 });
}

async function navigateToUpdatesTab(page: ElectronPage) {
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabUpdates').click();
    await page.waitForTimeout(600);
}

async function emitAppUpdate(
    electronApp: ElectronApplication,
    updateMessage: AppUpdateMessage,
) {
    await electronApp.evaluate(
        ({ BrowserWindow }, message: AppUpdateMessage) => {
            for (const win of BrowserWindow.getAllWindows()) {
                win.webContents.send('app-updates', message);
            }
        },
        updateMessage,
    );
}

async function prepareUpdatesScreenshot(
    page: ElectronPage,
    electronApp: ElectronApplication,
    theme: ThemeConfig,
    state: UpdateScreenshotState = {},
) {
    await prepareAppWithStubbedData(page, electronApp, {
        preferences: createPreferences(state.preferences),
    });
    await applyTheme(page, theme);
    await navigateToUpdatesTab(page);

    if (state.updateMessage) {
        await emitAppUpdate(electronApp, state.updateMessage);
        await page.waitForTimeout(300);
    }
}

async function prepareAppUpdateBannerScreenshot(
    page: ElectronPage,
    electronApp: ElectronApplication,
    theme: ThemeConfig,
    updateMessage: AppUpdateMessage,
) {
    await prepareAppWithStubbedData(page, electronApp);
    await applyTheme(page, theme);
    await page.getByTestId('btnProjects').click();
    await page.waitForTimeout(600);
    await emitAppUpdate(electronApp, updateMessage);
    await page.waitForTimeout(300);
}

async function ensureMainNavigationReady(
    page: ElectronPage,
    electronApp: ElectronApplication,
) {
    const btnProjects = page.getByTestId('btnProjects');
    const btnInstalls = page.getByTestId('btnInstalls');
    const btnSettings = page.getByTestId('btnSettings');

    for (let attempt = 1; attempt <= 3; attempt++) {
        await prepareAppWithStubbedData(page, electronApp);
        try {
            await expect(btnProjects).toBeVisible({ timeout: 15000 });
            await expect(btnInstalls).toBeVisible({ timeout: 15000 });
            await expect(btnSettings).toBeVisible({ timeout: 15000 });
            return;
        } catch {
            if (attempt === 3) {
                const diagnostics = await page.evaluate(() => {
                    const testIds = Array.from(
                        document.querySelectorAll('[data-testid]'),
                    )
                        .map((el) => el.getAttribute('data-testid'))
                        .filter((value): value is string => Boolean(value));

                    return {
                        title: document.title,
                        testIds: testIds.slice(0, 25),
                        bodyText: document.body?.innerText
                            ?.replace(/\s+/g, ' ')
                            .trim()
                            .slice(0, 250),
                    };
                });

                throw new Error(
                    `Main navigation did not render after retrying app bootstrap. Diagnostics: ${JSON.stringify(
                        diagnostics,
                    )}`,
                );
            }
        }
    }
}

test('captures documentation screenshots for each main view', async ({}, testInfo) => {
    testInfo.setTimeout(240000);
    const fixtureHome = await createFixtureHome();
    const overrideHomeScript = path.resolve(
        process.cwd(),
        'e2e',
        'support',
        'overrideHome.cjs',
    );
    const existingNodeOptions = process.env.NODE_OPTIONS?.trim();
    const requireOverrideOption = `--require "${overrideHomeScript}"`;
    const baseEnv = Object.fromEntries(
        Object.entries(process.env).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
    );
    const launchEnv: Record<string, string> = {
        ...baseEnv,
        NODE_ENV: 'development',
        APPDATA: path.join(fixtureHome, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(fixtureHome, 'AppData', 'Local'),
        GODOT_LAUNCHER_DOCS_SCREENSHOTS: '1',
        GODOT_LAUNCHER_DOCS_HOME_DIR: fixtureHome,
        NODE_OPTIONS: existingNodeOptions
            ? `${existingNodeOptions} ${requireOverrideOption}`
            : requireOverrideOption,
    };
    // This env var makes Electron behave like plain Node and breaks Playwright's Electron launch.
    delete launchEnv.ELECTRON_RUN_AS_NODE;
    const electronApp = await _electron.launch({
        args: ['.'],
        env: launchEnv,
    });

    try {
        const mainPage = await electronApp.firstWindow();
        await waitForPreloadScript(mainPage);
        await ensureMainNavigationReady(mainPage, electronApp);
        await mainPage.getByTestId('btnProjects').click();
        await expect(
            mainPage.getByRole('button', {
                name: 'My-Awesome-Game',
                exact: true,
            }),
        ).toBeVisible({
            timeout: 10000,
        });
        await expect(
            mainPage.getByRole('button', {
                name: 'My-Other-Game',
                exact: true,
            }),
        ).toBeVisible({
            timeout: 10000,
        });
        await mainPage.getByTestId('btnInstalls').click();
        await expect(
            mainPage.getByText('4.4.1-stable', { exact: true }),
        ).toBeVisible({
            timeout: 10000,
        });
        await expect(mainPage.getByText('4.6.1-stable')).toBeVisible({
            timeout: 10000,
        });
        await expect(
            mainPage.getByText('/Applications/Godot_4.6.1_mono', {
                exact: true,
            }),
        ).toBeVisible({
            timeout: 10000,
        });
        await mainPage.getByTestId('btnProjects').click();

        for (const theme of THEMES) {
            await applyTheme(mainPage, theme);

            for (const shot of SCREENSHOTS) {
                await shot.navigate(mainPage, electronApp, theme);
                const themedFileName = `${shot.fileBase}_${theme.name}`;
                const themedDescription = `${shot.description} in ${theme.description}`;
                await captureScreenshot(
                    mainPage,
                    testInfo,
                    themedFileName,
                    themedDescription,
                );
                if (shot.cleanup) {
                    await shot.cleanup(mainPage, electronApp, theme);
                }
            }
        }
    } finally {
        await electronApp.close();
        await fs.rm(fixtureHome, { recursive: true, force: true });
    }
});

async function captureScreenshot(
    page: ElectronPage,
    testInfo: any,
    baseName: string,
    description: string,
) {
    const outputDir = path.resolve('docs/screenshots');
    const pngPath = path.join(outputDir, `${baseName}.png`);
    const webpPath = path.join(outputDir, `${baseName}.webp`);
    await fs.mkdir(outputDir, { recursive: true });

    await page.screenshot({
        path: pngPath,
        fullPage: true,
    });

    await sharp(pngPath).webp({ lossless: true }).toFile(webpPath);
    await fs.rm(pngPath, { force: true });

    await testInfo.attach(description, {
        path: webpPath,
        contentType: 'image/webp',
    });
}

async function stubAddProjectEditorResolution(
    electronApp: ElectronApplication,
) {
    await electronApp.evaluate(
        (
            { ipcMain },
            {
                fallbackRelease,
                projectPath,
            }: {
                fallbackRelease: InstalledRelease;
                projectPath: string;
            },
        ) => {
            ipcMain.removeHandler('open-file-dialog');
            ipcMain.handle('open-file-dialog', async () => ({
                canceled: false,
                filePaths: [projectPath],
                bookmarks: [],
            }));

            ipcMain.removeHandler('add-project');
            ipcMain.handle('add-project', async (_, path: string, options) => {
                if (options?.resolution === 'add_missing') {
                    const projectDirectory = path.replace(
                        /\/project\.godot$/i,
                        '',
                    );
                    const newProject: ProjectDetails = {
                        name: 'Imported-Missing-Editor-Game',
                        path: projectDirectory,
                        version: '4.6.3-stable',
                        version_number: 4.6,
                        renderer: 'FORWARD_PLUS',
                        editor_settings_path: `${projectDirectory}/.godot`,
                        editor_settings_file: `${projectDirectory}/.godot/editor_settings-4.6.tres`,
                        last_opened: null,
                        open_windowed: false,
                        release: {
                            ...fallbackRelease,
                            version: '4.6.3-stable',
                            version_number: 4.6,
                            valid: false,
                        },
                        launch_path:
                            '/Users/docs/Godot/Editors/Godot_4.6.3/Godot.app/Contents/MacOS/Godot',
                        config_version: 5,
                        withVSCode: false,
                        withGit: true,
                        valid: false,
                        invalid_reason: 'missing_editor',
                    };

                    return {
                        success: true,
                        projects: [newProject],
                        newProject,
                    };
                }

                return {
                    success: false,
                    editorResolution: {
                        requested: {
                            channel: 'official',
                            flavor: 'gdscript',
                            base_version: '4.6',
                            version: '4.6.3-stable',
                        },
                        fallback: fallbackRelease,
                        downloadable: {
                            version: '4.6.3-stable',
                            flavor: 'gdscript',
                            prerelease: false,
                        },
                    },
                };
            });
        },
        {
            fallbackRelease: SAMPLE_EDITOR_RESOLUTION_FALLBACK_RELEASE,
            projectPath:
                '/Users/docs/Godot/Projects/imported-missing-editor/project.godot',
        },
    );
}

async function stubAddProjectRecoveredVSCodeConfig(
    electronApp: ElectronApplication,
) {
    await electronApp.evaluate(
        ({ ipcMain, BrowserWindow }, projectPath: string) => {
            ipcMain.removeHandler('open-file-dialog');
            ipcMain.handle('open-file-dialog', async () => ({
                canceled: false,
                filePaths: [projectPath],
                bookmarks: [],
            }));

            ipcMain.removeHandler('add-project');
            ipcMain.handle('add-project', async () => {
                const projectDirectory = projectPath.replace(
                    /\/project\.godot$/i,
                    '',
                );
                const newProject: ProjectDetails = {
                    name: 'Recovered-VSCode-Config',
                    path: projectDirectory,
                    version: '4.4.1-stable',
                    version_number: 4.4,
                    renderer: 'FORWARD_PLUS',
                    editor_settings_path: `${projectDirectory}/.godot`,
                    editor_settings_file: `${projectDirectory}/.godot/editor_settings-4.4.tres`,
                    last_opened: null,
                    open_windowed: false,
                    release: {
                        version: '4.4.1-stable',
                        version_number: 4.4,
                        install_path: '/Applications/Godot_4.4.1',
                        editor_path:
                            '/Applications/Godot_4.4.1/Godot.app/Contents/MacOS/Godot',
                        platform: 'darwin',
                        arch: 'universal',
                        mono: false,
                        prerelease: false,
                        config_version: 5,
                        published_at: '2025-03-26T09:19:36Z',
                        valid: true,
                    },
                    launch_path:
                        '/Applications/Godot_4.4.1/Godot.app/Contents/MacOS/Godot',
                    config_version: 5,
                    withVSCode: true,
                    withGit: true,
                    valid: true,
                };
                const projects = [newProject];

                for (const win of BrowserWindow.getAllWindows()) {
                    const webContents = win.webContents as any;
                    webContents.__docsProjects = projects;
                    win.webContents.send('projects-updated', projects);
                }

                return {
                    success: true,
                    projects,
                    newProject,
                    recoveredVSCodeConfigFiles: [
                        '.vscode/settings.json.1712345678901.bad',
                        '.vscode/extensions.json.1712345678902.bad',
                    ],
                };
            });
        },
        '/Users/docs/Godot/Projects/recovered-vscode-config/project.godot',
    );
}

async function stubCustomEditorDuplicateRegistration(
    electronApp: ElectronApplication,
) {
    await electronApp.evaluate(
        ({ ipcMain }, duplicateRelease: InstalledRelease) => {
            ipcMain.removeHandler('open-file-dialog');
            ipcMain.handle('open-file-dialog', async () => ({
                canceled: false,
                filePaths: [
                    '/Users/docs/Godot/Editors/StudioCustom47/godotlauncher-editor-manifest.json',
                ],
                bookmarks: [],
            }));

            ipcMain.removeHandler('register-custom-engine');
            ipcMain.handle(
                'register-custom-engine',
                async (
                    _,
                    _manifestPath: string,
                    options?: { replaceExisting?: boolean },
                ) => {
                    if (options?.replaceExisting) {
                        return {
                            success: true,
                            release: duplicateRelease,
                            releases: [duplicateRelease],
                        };
                    }

                    return {
                        success: false,
                        duplicate: duplicateRelease,
                    };
                },
            );
        },
        SAMPLE_CUSTOM_RELEASE,
    );
}

async function stubInstalledTools(
    electronApp: ElectronApplication,
    tools: CachedTool[],
) {
    await electronApp.evaluate(({ ipcMain }, injectedTools: CachedTool[]) => {
        ipcMain.removeHandler('get-installed-tools');
        ipcMain.handle('get-installed-tools', async () =>
            injectedTools.map((tool) => ({
                name: tool.name,
                path: tool.path,
                version: tool.version ?? null,
            })),
        );

        ipcMain.removeHandler('get-cached-tools');
        ipcMain.handle('get-cached-tools', async () =>
            injectedTools.map((tool) => ({
                ...tool,
                version: tool.version ?? null,
                verified: true,
            })),
        );
    }, tools);
}
