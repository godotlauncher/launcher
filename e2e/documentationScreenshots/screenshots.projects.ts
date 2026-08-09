import { type ElectronApplication, expect } from '@playwright/test';
import {
    applyTheme,
    closeActionMenu,
    hideProjectsDropOverlay,
    openProjectActionsMenu,
    prepareAppUpdateBannerScreenshot,
    prepareAppWithStubbedData,
    setScreenshotViewport,
    showProjectsDropOverlay,
    stubAddProjectEditorResolution,
    stubAddProjectRecoveredCodeEditorConfig,
    stubCodeEditorIntegrationSettings,
    stubInstalledTools,
    stubProjectGitInitializationFailure,
} from './runtime';
import {
    DEFAULT_TOOLS,
    SAMPLE_VSCODE_SETTINGS_AVAILABLE,
    SAMPLE_VSCODE_SETTINGS_NOT_FOUND,
    SAMPLE_VSCODIUM_SETTINGS_AVAILABLE,
    SAMPLE_AVAILABLE_RELEASES_WITH_EDITOR_RESOLUTION,
    SAMPLE_CUSTOM_RELEASE,
    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM_AND_UNAVAILABLE,
    SAMPLE_PROJECT_PROTOTYPE,
    SAMPLE_PROJECTS,
    SAMPLE_PROJECTS_WITH_MISSING_EDITOR,
    SAMPLE_PROJECT_WITH_WRAPPED_BADGES,
    SAMPLE_WRAPPED_BADGES_RELEASE,
    TOOLS_NO_GIT,
    TOOLS_NO_VSCODE,
    TOOLS_NONE,
} from './sampleData';
import type { ElectronPage, ScreenshotConfig, ThemeConfig } from './types';
import {
    APP_UPDATE_MESSAGE,
    APP_UPDATE_RELEASE_URL,
    APP_UPDATE_VERSION,
} from './versions';

export const PROJECT_SCREENSHOTS: ScreenshotConfig[] = [
    {
        fileBase: 'screen_projects_view',
        description: 'Projects view',
        viewportHeight: 960,
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            await page.getByTestId('btnProjects').click();
            await expect(page.getByTestId('inputProjectSearch')).toBeFocused();
            const newSection = page.locator(
                'section[aria-labelledby="new-projects-heading"]',
            );
            const pinnedSection = page.locator(
                'section[aria-labelledby="pinned-projects-heading"]',
            );
            const recentsSection = page.locator(
                'section[aria-labelledby="recents-projects-heading"]',
            );
            await expect(
                newSection.getByText('My Prototype', { exact: true }),
            ).toBeVisible({ timeout: 10000 });
            await expect(
                pinnedSection.getByText('My Awesome Game', { exact: true }),
            ).toBeVisible({ timeout: 10000 });
            await expect(
                recentsSection.getByText('My Other Game', { exact: true }),
            ).toBeInViewport({ timeout: 10000 });
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_projects_badges_wrapped',
        description: 'Project badges wrapping before launch actions',
        viewportHeight: 800,
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            const longCodeEditorSettings = {
                ...SAMPLE_VSCODE_SETTINGS_AVAILABLE,
                integration: {
                    ...SAMPLE_VSCODE_SETTINGS_AVAILABLE.integration,
                    displayName: 'Visual Studio Code Team Workspace',
                },
            };
            await prepareAppWithStubbedData(page, electronApp, {
                projects: [SAMPLE_PROJECT_WITH_WRAPPED_BADGES],
                installedReleases: [SAMPLE_WRAPPED_BADGES_RELEASE],
                codeEditorSettings: [longCodeEditorSettings],
            });
            await setScreenshotViewport(page, 800);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();

            const projectCard = page
                .locator('[data-project-path]')
                .filter({
                    has: page.getByText(
                        SAMPLE_PROJECT_WITH_WRAPPED_BADGES.name,
                        { exact: true },
                    ),
                })
                .first();
            const badges = projectCard.getByTestId('projectBadges');
            await expect(badges.locator(':scope > *')).toHaveCount(4);
            const badgeRows = await badges.evaluate((element) => {
                const rowTops = Array.from(element.children).map((child) =>
                    Math.round(child.getBoundingClientRect().top),
                );
                return new Set(rowTops).size;
            });
            expect(badgeRows).toBeGreaterThan(1);
            await page.waitForTimeout(400);
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
        fileBase: 'screen_projects_code_editor_unavailable',
        description: 'Projects view with unavailable code editor',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp, {
                codeEditorSettings: [SAMPLE_VSCODE_SETTINGS_NOT_FOUND],
            });
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();

            const warningMarkers = page.locator(
                '[data-project-path] .lucide-triangle-alert.stroke-warning',
            );
            await expect(warningMarkers).toHaveCount(3);
            await expect(page.locator('.alert-warning')).toHaveCount(0);
            await page.waitForTimeout(400);
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
        fileBase: 'screen_projects_code_editor_launch_warning',
        description: 'Project launch warning for unavailable code editor',
        viewportHeight: 800,
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp, {
                codeEditorSettings: [SAMPLE_VSCODE_SETTINGS_NOT_FOUND],
                projectLaunchResult: {
                    launched: false,
                    reason: 'code_editor_unavailable',
                    integration: {
                        id: 'vscode',
                        displayName: 'Visual Studio Code',
                        capabilities: { dotnet: true },
                    },
                },
            });
            await setScreenshotViewport(page, 800);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            const projectCard = page
                .locator('[data-project-path]')
                .filter({
                    has: page.getByText('My Other Game', { exact: true }),
                })
                .first();
            await projectCard.getByTestId('btnEditProjectInGodot').click();

            const warningDialog = page.getByRole('dialog', {
                name: 'Visual Studio Code was not found',
            });
            await expect(warningDialog).toBeVisible({ timeout: 10000 });
            await expect(warningDialog).toContainText(
                'C# editor integration may also be unavailable for this .NET project.',
            );
            await expect(warningDialog.getByRole('button')).toHaveText([
                'Launch anyway',
                'Disable & Launch',
                'Open settings',
                'Cancel',
            ]);
            await page.waitForTimeout(400);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            const cancelButton = page.getByRole('button', {
                name: 'Cancel',
                exact: true,
            });
            if (await cancelButton.isVisible().catch(() => false)) {
                await cancelButton.click();
            }
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
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
                page.getByText(SAMPLE_PROJECT_PROTOTYPE.name, { exact: true }),
            ).toBeVisible({ timeout: 10000 });
            await openProjectActionsMenu(page, SAMPLE_PROJECT_PROTOTYPE.name);
            await expect(
                page.getByRole('button', {
                    name: 'Export Editor Settings to File',
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
        fileBase: 'screen_projects_folders_menu',
        description: 'Project folder quick actions',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            const projectCard = page
                .locator('[data-project-path]')
                .filter({
                    has: page.getByText(SAMPLE_PROJECT_PROTOTYPE.name, {
                        exact: true,
                    }),
                })
                .first();
            await projectCard.getByTestId('btnProjectFolders').click();
            await expect(
                page.getByRole('button', {
                    name: 'Open Project Folder',
                    exact: true,
                }),
            ).toBeVisible({ timeout: 10000 });
            await expect(
                page.getByRole('button', {
                    name: 'Open Editor Settings Folder',
                    exact: true,
                }),
            ).toBeVisible({ timeout: 10000 });
            await page.waitForTimeout(400);
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
        fileBase: 'screen_projects_change_editor_version_current',
        description: 'Projects view with current editor version selected',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            const project = SAMPLE_PROJECTS[0];

            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            const projectRow = page
                .locator('[data-project-path]')
                .filter({
                    has: page.getByText(project.name, { exact: true }),
                })
                .first();
            await expect(projectRow).toBeVisible({ timeout: 10000 });
            await projectRow.getByTestId('btnProjectSettings').click();
            await page.getByTestId('selectProjectGodotEditor').click();
            await expect(page.getByRole('listbox')).toBeVisible({
                timeout: 10000,
            });
            await expect(
                page.getByRole('option', { name: project.version }),
            ).toHaveAttribute('aria-selected', 'true');
            await page.waitForTimeout(400);
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
        fileBase: 'screen_projects_change_editor_version_custom',
        description: 'Projects view with custom editor version selected',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            const project = SAMPLE_PROJECT_PROTOTYPE;

            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            const projectRow = page
                .locator('[data-project-path]')
                .filter({
                    has: page.getByText(project.name, { exact: true }),
                })
                .first();
            await expect(projectRow).toBeVisible({ timeout: 10000 });
            await projectRow.getByTestId('btnProjectSettings').click();
            await page.getByTestId('selectProjectGodotEditor').click();
            await expect(page.getByRole('listbox')).toBeVisible({
                timeout: 10000,
            });
            await expect(
                page.getByRole('option', {
                    name: 'Acme 4.7 Custom Editor (Custom)',
                }),
            ).toHaveAttribute('aria-selected', 'true');
            await page.waitForTimeout(400);
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
        fileBase: 'screen_projects_rename_drawer',
        description: 'Project settings drawer',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            await stubCodeEditorIntegrationSettings(electronApp, [
                SAMPLE_VSCODE_SETTINGS_AVAILABLE,
            ]);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            await expect(
                page.getByText(SAMPLE_PROJECT_PROTOTYPE.name, { exact: true }),
            ).toBeVisible({ timeout: 10000 });
            const projectCard = page
                .locator('[data-project-path]')
                .filter({
                    has: page.getByText(SAMPLE_PROJECT_PROTOTYPE.name, {
                        exact: true,
                    }),
                })
                .first();
            await projectCard.getByTestId('btnProjectSettings').click();
            await expect(
                page.getByRole('dialog', {
                    name: `${SAMPLE_PROJECT_PROTOTYPE.name} Settings`,
                }),
            ).toBeVisible({ timeout: 10000 });
            await expect(page.getByTestId('selectProjectGodotEditor')).toHaveText(
                'Acme 4.7 Custom Editor (Custom)',
            );
            const nameField = page.locator('#projectEditName');
            await nameField.fill('My Renamed Prototype');
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
        fileBase: 'screen_projects_settings_source_control',
        description: 'Project settings source control tab',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            const projectCard = page
                .locator('[data-project-path]')
                .filter({
                    has: page.getByText(SAMPLE_PROJECT_PROTOTYPE.name, {
                        exact: true,
                    }),
                })
                .first();
            await projectCard.getByTestId('btnProjectSettings').click();
            await page
                .getByTestId('tabProjectSettings_sourceControl')
                .click();
            await expect(
                page.getByRole('button', {
                    name: 'Initialize Git',
                    exact: true,
                }),
            ).toBeVisible({ timeout: 10000 });
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
        fileBase: 'screen_projects_settings_source_control_active',
        description: 'Project settings with active source control',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            const projectCard = page
                .locator('[data-project-path]')
                .filter({
                    has: page.getByText('My Awesome Game', { exact: true }),
                })
                .first();
            await projectCard.getByTestId('btnProjectSettings').click();
            await page
                .getByTestId('tabProjectSettings_sourceControl')
                .click();
            await expect(
                page.getByText('Git is initialized for this project.', {
                    exact: true,
                }),
            ).toBeVisible({ timeout: 10000 });
            await expect(
                page.getByText('Active', { exact: true }),
            ).toBeVisible();
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
        fileBase: 'screen_projects_settings_source_control_no_git',
        description: 'Project settings source control without Git installed',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp, {
                tools: TOOLS_NO_GIT,
            });
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            const projectCard = page
                .locator('[data-project-path]')
                .filter({
                    has: page.getByText(SAMPLE_PROJECT_PROTOTYPE.name, {
                        exact: true,
                    }),
                })
                .first();
            await projectCard.getByTestId('btnProjectSettings').click();
            await page
                .getByTestId('tabProjectSettings_sourceControl')
                .click();
            await expect(
                page.getByText('Git is not installed on this computer', {
                    exact: true,
                }),
            ).toBeVisible({ timeout: 10000 });
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
        fileBase: 'screen_projects_settings_source_control_init_failure',
        description: 'Project settings source control initialization failure',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            await stubProjectGitInitializationFailure(
                electronApp,
                'Failed to initialize Git repository.',
            );
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            const projectCard = page
                .locator('[data-project-path]')
                .filter({
                    has: page.getByText(SAMPLE_PROJECT_PROTOTYPE.name, {
                        exact: true,
                    }),
                })
                .first();
            await projectCard.getByTestId('btnProjectSettings').click();
            await page
                .getByTestId('tabProjectSettings_sourceControl')
                .click();
            await page
                .getByRole('button', {
                    name: 'Initialize Git',
                    exact: true,
                })
                .click();
            await expect(
                page.getByText('Failed to initialize Git repository.', {
                    exact: true,
                }),
            ).toBeVisible({ timeout: 10000 });
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
        fileBase: 'screen_projects_settings_code_editor',
        description: 'Project settings code editor tab',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            await stubCodeEditorIntegrationSettings(electronApp, [
                SAMPLE_VSCODE_SETTINGS_AVAILABLE,
            ]);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            const projectCard = page
                .locator('[data-project-path]')
                .filter({
                    has: page.getByText(SAMPLE_PROJECT_PROTOTYPE.name, {
                        exact: true,
                    }),
                })
                .first();
            await projectCard.getByTestId('btnProjectSettings').click();
            await page.getByTestId('tabProjectSettings_codeEditor').click();
            await expect(
                page.getByTestId('selectProjectCodeEditor'),
            ).toHaveText('Visual Studio Code');
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
        fileBase: 'screen_projects_settings_launch',
        description: 'Project settings launch tab',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            const projectCard = page
                .locator('[data-project-path]')
                .filter({
                    has: page.getByText(SAMPLE_PROJECT_PROTOTYPE.name, {
                        exact: true,
                    }),
                })
                .first();
            await projectCard.getByTestId('btnProjectSettings').click();
            await page.getByTestId('tabProjectSettings_launch').click();
            await expect(
                page.getByRole('checkbox', {
                    name: 'Use windowed mode',
                }),
            ).toBeVisible({ timeout: 10000 });
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
                page.getByText('Archive Prototype', { exact: true }),
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
            await page
                .getByRole('button', { name: 'Options', exact: true })
                .click();
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
        fileBase: 'screen_projects_code_editor_config_recovered',
        description: 'Add Project recovered code editor config warning',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            await stubAddProjectRecoveredCodeEditorConfig(electronApp);
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
            await stubCodeEditorIntegrationSettings(electronApp, [
                SAMPLE_VSCODE_SETTINGS_AVAILABLE,
            ]);
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('My Next Awesome Game');
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
        fileBase: 'screen_projects_new_project_code_editor_options',
        description: 'New Project view with code editor options',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubInstalledTools(electronApp, DEFAULT_TOOLS);
            await page.getByTestId('btnProjects').click();
            await stubCodeEditorIntegrationSettings(electronApp, [
                {
                    ...SAMPLE_VSCODE_SETTINGS_AVAILABLE,
                    isDefault: true,
                },
                SAMPLE_VSCODIUM_SETTINGS_AVAILABLE,
            ]);
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('My Next Awesome Game');

            const codeEditorSelect = page.getByTestId(
                'selectCreateProjectCodeEditor',
            );
            await expect(codeEditorSelect).toHaveText('Visual Studio Code');
            await codeEditorSelect.click();
            await expect(page.getByRole('listbox')).toBeVisible({
                timeout: 10000,
            });
            const vscodeOption = page.getByRole('option', {
                name: 'Visual Studio Code',
                exact: true,
            });
            await expect(vscodeOption).toBeVisible();
            await expect(vscodeOption).toHaveAttribute(
                'aria-selected',
                'true',
            );
            await expect(
                page.getByRole('option', {
                    name: 'VSCodium',
                    exact: true,
                }),
            ).toBeVisible();
            await page.waitForTimeout(600);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await page.keyboard.press('Escape');
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
            await stubCodeEditorIntegrationSettings(electronApp, [
                SAMPLE_VSCODE_SETTINGS_AVAILABLE,
            ]);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('Custom Editor Game');
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
            await stubCodeEditorIntegrationSettings(electronApp, [
                SAMPLE_VSCODE_SETTINGS_AVAILABLE,
            ]);
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('My Next Awesome Game');
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
            await stubCodeEditorIntegrationSettings(electronApp, [
                SAMPLE_VSCODE_SETTINGS_NOT_FOUND,
            ]);
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('My Next Awesome Game');
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
            await stubCodeEditorIntegrationSettings(electronApp, [
                SAMPLE_VSCODE_SETTINGS_NOT_FOUND,
            ]);
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('My Next Awesome Game');
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
            await stubCodeEditorIntegrationSettings(electronApp, [
                SAMPLE_VSCODE_SETTINGS_AVAILABLE,
            ]);
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('My Next Awesome Game');
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
                version: APP_UPDATE_VERSION,
                message: APP_UPDATE_MESSAGE,
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
                version: APP_UPDATE_VERSION,
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
                version: APP_UPDATE_VERSION,
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
                version: APP_UPDATE_VERSION,
                message: APP_UPDATE_MESSAGE,
                url: APP_UPDATE_RELEASE_URL,
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
                version: APP_UPDATE_VERSION,
                message: 'Failed to download update',
            });
        },
    },
];
