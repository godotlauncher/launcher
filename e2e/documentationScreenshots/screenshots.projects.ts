import { expect, type ElectronApplication } from '@playwright/test';
import type { ElectronPage, ScreenshotConfig, ThemeConfig } from './types';
import {
    DEFAULT_TOOLS,
    SAMPLE_AVAILABLE_RELEASES_WITH_EDITOR_RESOLUTION,
    SAMPLE_CUSTOM_RELEASE,
    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM_AND_UNAVAILABLE,
    SAMPLE_PROJECT_PROTOTYPE,
    SAMPLE_PROJECTS_WITH_MISSING_EDITOR,
    TOOLS_NONE,
    TOOLS_NO_GIT,
    TOOLS_NO_VSCODE,
} from './sampleData';
import {
    applyTheme,
    closeActionMenu,
    hideProjectsDropOverlay,
    openProjectActionsMenu,
    prepareAppUpdateBannerScreenshot,
    prepareAppWithStubbedData,
    showProjectsDropOverlay,
    stubAddProjectEditorResolution,
    stubAddProjectRecoveredVSCodeConfig,
    stubInstalledTools,
} from './runtime';

export const PROJECT_SCREENSHOTS: ScreenshotConfig[] = [
{
        fileBase: 'screen_projects_view',
        description: 'Projects view',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnProjects').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_projects_menu',
        description: 'Projects view action menu',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            await expect(
                page.getByRole('button', {
                    name: SAMPLE_PROJECT_PROTOTYPE.name,
                    exact: true,
                }),
            ).toBeVisible({ timeout: 10000 });
            await openProjectActionsMenu(page, SAMPLE_PROJECT_PROTOTYPE.name);
            await expect(
                page.getByRole('button', {
                    name: 'Initialize Git Repository',
                }),
            ).toBeVisible({ timeout: 10000 });
            await page.waitForTimeout(600);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await closeActionMenu(page);
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
        },
    },
    {
        fileBase: 'screen_projects_rename_drawer',
        description: 'Project rename drawer',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            await expect(
                page.getByRole('button', {
                    name: SAMPLE_PROJECT_PROTOTYPE.name,
                    exact: true,
                }),
            ).toBeVisible({ timeout: 10000 });
            await openProjectActionsMenu(page, SAMPLE_PROJECT_PROTOTYPE.name);
            await page
                .getByRole('button', { name: 'Project Settings' })
                .click();
            await expect(
                page.getByRole('dialog', {
                    name: `${SAMPLE_PROJECT_PROTOTYPE.name} Settings`,
                }),
            ).toBeVisible({ timeout: 10000 });
            const nameField = page.locator('#projectEditName');
            await nameField.fill('My-Renamed-Prototype');
            await expect(
                page.getByRole('checkbox', {
                    name: /Also rename Godot project/,
                }),
            ).toBeEnabled({ timeout: 10000 });
            await page.waitForTimeout(400);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
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
            const closeButton = page.getByTestId('btnCloseCreateProject');
            if (await closeButton.isVisible().catch(() => false)) {
                await closeButton.click();
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
                .evaluate((select, customReleaseName) => {
                    const releaseSelect = select as HTMLSelectElement;
                    const customOption = Array.from(releaseSelect.options).find(
                        (option) =>
                            option.textContent?.includes(customReleaseName),
                    );

                    if (!customOption) {
                        return false;
                    }

                    releaseSelect.value = customOption.value;
                    releaseSelect.dispatchEvent(
                        new Event('change', { bubbles: true }),
                    );
                    return true;
                }, SAMPLE_CUSTOM_RELEASE.name!);
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
        fileBase: 'screen_projects_update_manual',
        description: 'Projects view with update banner (manual install)',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppUpdateBannerScreenshot(page, electronApp, theme, {
                available: true,
                downloaded: false,
                type: 'manual',
                version: '1.9.1',
                message: 'New version available: 1.9.1',
                url: 'https://github.com/godotlauncher/launcher/releases/tag/v1.9.1',
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
    }
];
