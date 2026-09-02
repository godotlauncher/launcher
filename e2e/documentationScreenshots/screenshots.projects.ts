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
    stubCreateProjectPublicationTargets,
    stubCreateProjectRepositoryInspection,
    stubCreateProjectRepositoryNameAvailability,
    stubCreateProjectResult,
    stubDiscardCreateProjectPublication,
    stubGlobalGitIdentity,
    stubProjectGitIdentity,
    stubProjectGitInitializationFailure,
    stubProjectGitInitializationResult,
    stubToolIntegrations,
} from './runtime';
import {
    DEFAULT_TOOL_INTEGRATIONS,
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
    TOOL_INTEGRATIONS_NO_GIT,
    TOOL_INTEGRATIONS_NO_GIT_LFS,
    TOOL_INTEGRATIONS_MISSING,
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
        viewportHeight: 600,
        fullPage: false,
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
            ).toBeAttached({ timeout: 10000 });
            await page.waitForTimeout(600);
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
            await stubProjectGitIdentity(electronApp, {
                status: 'available',
                repository: {
                    root: SAMPLE_PROJECTS[0].path,
                    isProjectRoot: true,
                    kind: 'standard',
                },
                name: {
                    value: 'Project Contributor',
                    source: 'repository',
                },
                email: {
                    value: 'contributor@example.invalid',
                    source: 'repository',
                },
                canUpdate: true,
            });
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
            await expect(
                page.getByText('Project Contributor', { exact: true }),
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
        fileBase:
            'screen_projects_settings_source_control_identity_unavailable',
        description:
            'Project settings Git identity while Git is unavailable',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp, {
                toolIntegrations: TOOL_INTEGRATIONS_NO_GIT,
            });
            await stubProjectGitIdentity(electronApp, {
                status: 'git-unavailable',
            });
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
                page.getByText(
                    'Install Git or rescan it in Settings > Tools > Git to view and update this identity.',
                    { exact: true },
                ),
            ).toBeVisible({ timeout: 10000 });
            await expect(
                page
                    .getByRole('button', { name: 'Update', exact: true })
                    .first(),
            ).toBeDisabled();
            await expect(
                page.getByTestId('projectGitUnavailable'),
            ).toHaveText('Unavailable');
            await expect(
                page.getByText('Unavailable', { exact: true }),
            ).toHaveCount(3);
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
                toolIntegrations: TOOL_INTEGRATIONS_NO_GIT,
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
        fileBase:
            'screen_projects_settings_source_control_existing_repository',
        description: 'Project settings existing Git repository notice',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            await stubProjectGitInitializationResult(electronApp, {
                project: {
                    ...SAMPLE_PROJECT_PROTOTYPE,
                    withGit: true,
                },
                gitSetup: {
                    status: 'existing-repository',
                    root: '/Users/docs/Godot/Projects',
                    isProjectRoot: false,
                    kind: 'standard',
                },
            });
            await stubProjectGitIdentity(electronApp, {
                status: 'available',
                repository: {
                    root: '/Users/docs/Godot/Projects',
                    isProjectRoot: false,
                    kind: 'standard',
                },
                name: {
                    value: 'Docs Contributor',
                    source: 'global',
                },
                email: {
                    value: 'docs@example.invalid',
                    source: 'global',
                },
                canUpdate: false,
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
            await page
                .getByRole('button', {
                    name: 'Initialize Git',
                    exact: true,
                })
                .click();
            const notice = page.getByRole('dialog', {
                name: 'Existing Git repository detected',
            });
            await expect(notice).toBeVisible({ timeout: 10000 });
            await expect(notice).toContainText(
                'This project is already covered by the Git repository at /Users/docs/Godot/Projects. No Git setup changes were made.',
            );
            await expect(
                page.getByTestId('tabProjectSettings_sourceControl'),
            ).toHaveAttribute('aria-selected', 'true');
            await expect(page.getByTestId('projectGitActive')).toBeVisible();
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
            const missingEditorProject = page
                .locator('[data-project-path]')
                .filter({
                    has: page.getByText('Archive Prototype', { exact: true }),
                })
                .first();
            await expect(missingEditorProject).toBeVisible({ timeout: 10000 });
            await missingEditorProject.evaluate((element) =>
                element.scrollIntoView({ block: 'center', inline: 'nearest' }),
            );
            await expect(missingEditorProject).toBeInViewport({ ratio: 1 });
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
            await page.getByTestId('btnAddProjectFromComputer').click();
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
            await page.getByTestId('btnAddProjectFromComputer').click();
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
            await page.getByTestId('btnAddProjectFromComputer').click();
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
            await stubToolIntegrations(electronApp, DEFAULT_TOOL_INTEGRATIONS);
            await stubCreateProjectPublicationTargets(electronApp, {
                success: true,
                targets: [
                    {
                        providerId: 'github',
                        connectionId:
                            '4d542f86-89c7-4a7c-89cf-835ce17022af',
                        accessTargetId:
                            'de178a20-320a-471f-8c8c-94061ac13de1',
                        ownerLogin: 'mariodebono',
                        ownerType: 'user',
                        accountLogin: 'mariodebono',
                    },
                ],
            });
            await stubCreateProjectRepositoryNameAvailability(electronApp, {
                status: 'available',
            });
            await page.getByTestId('btnProjects').click();
            await stubCodeEditorIntegrationSettings(electronApp, [
                SAMPLE_VSCODE_SETTINGS_AVAILABLE,
            ]);
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('My Next Awesome Game');
            await page
                .getByRole('checkbox', { name: 'Publish to GitHub' })
                .check();
            await expect(
                page.getByTestId('selectCreateProjectGitHubOwner'),
            ).toBeVisible();
            await expect(
                page.getByText('Name looks available', { exact: true }),
            ).toBeVisible();
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubToolIntegrations(electronApp, DEFAULT_TOOL_INTEGRATIONS);
            await page.getByTestId('btnCloseCreateProject').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_projects_new_project_github',
        description: 'New Project with private GitHub publishing enabled',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await openNewProjectGitHubPublishing(page, electronApp);
        },
        cleanup: closeNewProjectScreenshot,
    },
    {
        fileBase: 'screen_projects_new_project_github_available',
        description: 'New Project with an available GitHub repository name',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await openNewProjectGitHubPublishing(page, electronApp, {
                projectName: 'Skyline Sprinter',
                availability: 'available',
            });
        },
        cleanup: closeNewProjectScreenshot,
    },
    {
        fileBase: 'screen_projects_new_project_github_unavailable',
        description:
            'New Project with an unavailable GitHub repository name',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await openNewProjectGitHubPublishing(page, electronApp, {
                projectName: 'Existing Skyline Game',
                availability: 'unavailable',
            });
        },
        cleanup: closeNewProjectScreenshot,
    },
    {
        fileBase: 'screen_projects_new_project_github_recovery',
        description: 'New Project GitHub publishing recovery modal',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubGlobalGitIdentity(electronApp, {
                name: 'Launcher Docs',
                email: 'launcher-docs@example.invalid',
            });
            await stubCreateProjectResult(electronApp, {
                success: false,
                error: 'The project was created locally.',
                projectDetails: {
                    ...SAMPLE_PROJECTS[0],
                    name: 'Skyline Recovery',
                    path: '/Users/docs/Godot/Projects/skyline-recovery',
                },
                publication: {
                    status: 'failed',
                    attemptId: 'docs-github-recovery',
                    stage: 'remote-create',
                    reason: 'repository-name-unavailable-or-policy-rejected',
                    intendedRepository: {
                        owner: 'pixel-forge',
                        name: 'Skyline-Recovery',
                        webUrl:
                            'https://github.com/pixel-forge/Skyline-Recovery',
                    },
                    canRetry: true,
                    canEdit: true,
                },
            });
            await openNewProjectGitHubPublishing(page, electronApp, {
                projectName: 'Skyline Recovery',
                availability: 'available',
            });
            await stubCreateProjectRepositoryNameAvailability(electronApp, {
                status: 'unavailable',
            });
            await page.getByTestId('btnCreateProject').click();
            const recoveryDialog = page.getByRole('dialog', {
                name: 'Could not publish to GitHub',
            });
            await expect(recoveryDialog).toBeVisible({ timeout: 10000 });
            await expect(
                recoveryDialog.getByText('Name already in use', {
                    exact: true,
                }),
            ).toBeVisible({ timeout: 10000 });
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubDiscardCreateProjectPublication(electronApp);
            await page
                .getByRole('button', { name: 'Continue locally' })
                .click();
            await expect(
                page.getByRole('dialog', {
                    name: 'Could not publish to GitHub',
                }),
            ).toBeHidden();
            const alertOk = page.getByTestId('btnAlertOk');
            if (await alertOk.isVisible().catch(() => false)) {
                await alertOk.click();
            }
            await expect(page.getByTestId('drawerBackdrop')).toBeHidden();
            await expect(page).toHaveURL(/#\/projects$/u);
            await page.waitForTimeout(300);
        },
    },
    {
        fileBase: 'screen_projects_new_project_existing_repository_warning',
        description: 'New Project existing parent repository warning',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await openNewProjectExistingRepository(
                page,
                electronApp,
                false,
            );
        },
        cleanup: async (page: ElectronPage) => {
            await page
                .getByRole('dialog', {
                    name: 'This project will be inside another Git repository',
                })
                .getByRole('button', { name: 'Cancel' })
                .click();
            await closeNewProjectScreenshot(page);
        },
    },
    {
        fileBase:
            'screen_projects_new_project_existing_repository_completion',
        description: 'New Project existing parent repository completion',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await openNewProjectExistingRepository(page, electronApp, true);
        },
        cleanup: async (page: ElectronPage) => {
            await page.getByRole('button', { name: 'Done' }).click();
            await expect(page.getByTestId('drawerBackdrop')).toBeHidden();
            await page.waitForTimeout(300);
        },
    },
    {
        fileBase: 'screen_projects_new_project_git_identity_warning',
        description: 'New Project missing Git identity warning',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await openNewProjectGitIdentityWarning(page, electronApp);
            await page.waitForTimeout(400);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            const createDrawer = page.getByRole('dialog', {
                name: 'New Project',
            });
            await createDrawer.getByTestId('btnCloseCreateProject').click();
            await expect(createDrawer).toBeHidden();
            await applyTheme(page, theme);
        },
    },
    {
        fileBase: 'screen_projects_new_project_git_lfs',
        description: 'New Project Git LFS tracking policy help',
        preservePointer: true,
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubToolIntegrations(electronApp, DEFAULT_TOOL_INTEGRATIONS);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('My Next Awesome Game');
            await page.getByRole('checkbox', { name: 'Use Git LFS' }).check();
            await page
                .getByRole('button', { name: 'Tracked file types' })
                .hover();
            const tooltip = page.getByRole('tooltip');
            await expect(tooltip).toBeVisible({ timeout: 10000 });
            await expect(tooltip).toContainText('3D models');
            await expect(tooltip).toContainText('*.fbx *.gltf *.glb');
            await page.waitForTimeout(400);
        },
        cleanup: async (page: ElectronPage) => {
            await page.mouse.move(0, 0);
            await page.getByTestId('btnCloseCreateProject').click();
            await page.waitForTimeout(400);
        },
    },
    {
        fileBase: 'screen_projects_new_project_no_git_lfs',
        description: 'New Project view when Git LFS is not installed',
        preservePointer: true,
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubToolIntegrations(
                electronApp,
                TOOL_INTEGRATIONS_NO_GIT_LFS,
            );
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('My Next Awesome Game');
            await expect(
                page.getByRole('checkbox', { name: 'Use Git LFS' }),
            ).toBeDisabled();
            await expect(
                page.getByText('Unavailable', { exact: true }),
            ).toBeVisible();
            const unavailableHelp = page.getByRole('button', {
                name: 'Git LFS is not installed on this computer',
            });
            await unavailableHelp.hover();
            await expect(page.getByRole('tooltip')).toHaveText(
                'Git LFS is not installed on this computer',
            );
            await page.waitForTimeout(400);
        },
        cleanup: async (page: ElectronPage) => {
            await page.getByTestId('btnCloseCreateProject').click();
            await page.waitForTimeout(400);
        },
    },
    {
        fileBase: 'screen_projects_new_project_git_identity_form',
        description: 'New Project Git identity form',
        viewportHeight: 720,
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await openNewProjectGitIdentityWarning(page, electronApp);
            await page
                .getByRole('button', { name: 'Add Git identity' })
                .click();
            const dialog = page.getByRole('dialog', {
                name: 'Add Git identity',
            });
            await expect(dialog).toBeVisible({ timeout: 10000 });
            await expect(
                dialog.locator('#createProjectGitName'),
            ).toHaveValue('');
            await expect(
                dialog.locator('#createProjectGitEmail'),
            ).toHaveValue('');
            await page.waitForTimeout(400);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            const createDrawer = page.getByRole('dialog', {
                name: 'New Project',
            });
            await createDrawer.getByTestId('btnCloseCreateProject').click();
            await expect(createDrawer).toBeHidden();
            await applyTheme(page, theme);
        },
    },
    {
        fileBase: 'screen_projects_new_project_code_editor_options',
        description: 'New Project view with code editor options',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubToolIntegrations(electronApp, DEFAULT_TOOL_INTEGRATIONS);
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
            await stubToolIntegrations(electronApp, DEFAULT_TOOL_INTEGRATIONS);
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
            await stubToolIntegrations(electronApp, DEFAULT_TOOL_INTEGRATIONS);
            await applyTheme(page, theme);
            await stubCodeEditorIntegrationSettings(electronApp, [
                SAMPLE_VSCODE_SETTINGS_AVAILABLE,
            ]);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('Custom Editor Game');
            const editorSelect = page.getByTestId(
                'selectCreateProjectGodotEditor',
            );
            await editorSelect.click();
            await page
                .getByRole('option', {
                    name: new RegExp(SAMPLE_CUSTOM_RELEASE.name!),
                })
                .click();
            await expect(editorSelect).toContainText(
                SAMPLE_CUSTOM_RELEASE.name!,
            );
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
        preservePointer: true,
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubToolIntegrations(
                electronApp,
                TOOL_INTEGRATIONS_NO_GIT,
            );
            await page.getByTestId('btnProjects').click();
            await stubCodeEditorIntegrationSettings(electronApp, [
                SAMPLE_VSCODE_SETTINGS_AVAILABLE,
            ]);
            await page.getByTestId('btnProjectCreate').click();
            await page
                .getByTestId('inputProjectName')
                .fill('My Next Awesome Game');
            const unavailableHelp = page.getByRole('button', {
                name: 'Git is not installed on this computer',
            });
            await unavailableHelp.hover();
            await expect(page.getByRole('tooltip')).toHaveText(
                'Git is not installed on this computer',
            );
            await page.waitForTimeout(600);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await page.getByTestId('btnCloseCreateProject').click();
            await page.waitForTimeout(600);
            await stubToolIntegrations(electronApp, DEFAULT_TOOL_INTEGRATIONS);
        },
    },
    {
        fileBase: 'screen_projects_new_project_no_vscode',
        description: 'New Project view when VS Code is not installed',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubToolIntegrations(electronApp, DEFAULT_TOOL_INTEGRATIONS);
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
            await stubToolIntegrations(electronApp, DEFAULT_TOOL_INTEGRATIONS);
        },
    },
    {
        fileBase: 'screen_projects_new_project_no_tools',
        description: 'New Project view when Git and VS Code are not installed',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubToolIntegrations(
                electronApp,
                TOOL_INTEGRATIONS_MISSING,
            );
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
            await stubToolIntegrations(electronApp, DEFAULT_TOOL_INTEGRATIONS);
        },
    },
    {
        fileBase: 'screen_projects_new_project_overwrite_path',
        description: 'New Project view with overwrite path enabled',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
        ) => {
            await stubToolIntegrations(electronApp, DEFAULT_TOOL_INTEGRATIONS);
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
            await stubToolIntegrations(electronApp, DEFAULT_TOOL_INTEGRATIONS);
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

type GitHubPublishingScreenshotOptions = {
    projectName?: string;
    availability?: 'available' | 'unavailable';
};

/**
 * Opens the Create Project drawer with deterministic private GitHub publishing.
 *
 * @param page - Electron renderer page to drive.
 * @param electronApp - Electron app whose bridge handlers should be stubbed.
 * @param options - Optional project name and confirmed availability state.
 * @returns A promise that ends when the requested publishing state is visible.
 */
async function openNewProjectGitHubPublishing(
    page: ElectronPage,
    electronApp: ElectronApplication,
    options: GitHubPublishingScreenshotOptions = {},
): Promise<void> {
    await stubToolIntegrations(electronApp, DEFAULT_TOOL_INTEGRATIONS);
    await stubCodeEditorIntegrationSettings(electronApp, [
        SAMPLE_VSCODE_SETTINGS_AVAILABLE,
    ]);
    await stubCreateProjectPublicationTargets(electronApp, {
        success: true,
        targets: [
            {
                providerId: 'github',
                connectionId: 'docs-github-connection',
                accessTargetId: 'docs-pixel-forge-target',
                ownerLogin: 'pixel-forge',
                ownerType: 'organization',
                accountLogin: 'launcher-docs',
            },
        ],
    });
    await stubCreateProjectRepositoryNameAvailability(electronApp, {
        status: options.availability ?? 'available',
    });
    await stubCreateProjectRepositoryInspection(electronApp, {
        status: 'not-a-repository',
    });
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectCreate').click();
    if (options.projectName) {
        await page
            .getByTestId('inputProjectName')
            .fill(options.projectName);
    }
    const publishToGitHub = page.getByRole('checkbox', {
        name: 'Publish to GitHub',
    });
    await publishToGitHub.check();
    await expect(publishToGitHub).toBeChecked();
    await expect(
        page.getByTestId('selectCreateProjectGitHubOwner'),
    ).toContainText('pixel-forge');

    if (options.availability === 'available') {
        await expect(
            page.getByText('Name looks available', { exact: true }),
        ).toBeVisible({ timeout: 10000 });
    } else if (options.availability === 'unavailable') {
        await expect(
            page.getByText('Name already in use', { exact: true }),
        ).toBeVisible({ timeout: 10000 });
    } else {
        await expect(
            page.getByText('Private GitHub repository', { exact: true }),
        ).toBeVisible();
    }
    await page.waitForTimeout(200);
}

/**
 * Closes the Create Project drawer after a canonical screenshot.
 *
 * @param page - Electron renderer page to drive.
 * @returns A promise that ends when the drawer has closed.
 */
async function closeNewProjectScreenshot(page: ElectronPage): Promise<void> {
    await page.getByTestId('btnCloseCreateProject').click();
    await page.waitForTimeout(600);
}

/**
 * Opens Create Project and submits it with a missing global Git identity.
 *
 * @param page - Electron renderer page to drive.
 * @param electronApp - Electron app whose bridge handlers should be stubbed.
 * @returns A promise that ends when the warning dialog is visible.
 */
async function openNewProjectGitIdentityWarning(
    page: ElectronPage,
    electronApp: ElectronApplication,
): Promise<void> {
    await stubToolIntegrations(electronApp, DEFAULT_TOOL_INTEGRATIONS);
    await stubGlobalGitIdentity(electronApp, { name: '', email: '' });
    await stubCreateProjectRepositoryInspection(electronApp, {
        status: 'not-a-repository',
    });
    await stubCodeEditorIntegrationSettings(electronApp, [
        SAMPLE_VSCODE_SETTINGS_AVAILABLE,
    ]);
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectCreate').click();
    await page.getByTestId('inputProjectName').fill('My Next Awesome Game');
    const createButton = page.getByTestId('btnCreateProject');
    await expect(createButton).toBeEnabled({ timeout: 10000 });
    await createButton.click();
    await expect(
        page.getByRole('dialog', { name: 'Git identity required' }),
    ).toBeVisible({ timeout: 10000 });
}

/**
 * Opens the deterministic parent-repository warning or completion state.
 *
 * @param page - Electron renderer page to drive.
 * @param electronApp - Electron app whose bridge handlers should be stubbed.
 * @param completion - Whether to continue through to the completion state.
 * @returns A promise that ends when the requested dialog is visible.
 */
async function openNewProjectExistingRepository(
    page: ElectronPage,
    electronApp: ElectronApplication,
    completion: boolean,
): Promise<void> {
    const repositoryRoot = '/Users/docs/Godot/Workspace';
    await openNewProjectGitHubPublishing(page, electronApp, {
        projectName: 'Skyline Workshop',
        availability: 'available',
    });
    await page.getByRole('checkbox', { name: 'Use Git LFS' }).check();
    await page.getByRole('checkbox', { name: 'Edit now' }).uncheck();
    await stubCreateProjectRepositoryInspection(electronApp, {
        status: 'inside-work-tree',
        root: repositoryRoot,
        isProjectRoot: false,
        kind: 'standard',
    });
    await stubCreateProjectResult(electronApp, {
        success: true,
        projectDetails: {
            ...SAMPLE_PROJECTS[0],
            name: 'Skyline Workshop',
            path: `${repositoryRoot}/Skyline-Workshop`,
        },
        gitSetup: {
            status: 'existing-repository',
            root: repositoryRoot,
            isProjectRoot: false,
            kind: 'standard',
        },
        publication: { status: 'not-requested' },
    });

    await page.getByTestId('btnCreateProject').click();
    const warning = page.getByRole('dialog', {
        name: 'This project will be inside another Git repository',
    });
    await expect(warning).toBeVisible({ timeout: 10000 });
    if (!completion) {
        return;
    }

    await warning.getByRole('button', { name: 'Continue' }).click();
    await expect(
        page.getByRole('dialog', { name: 'Project created' }),
    ).toBeVisible({ timeout: 10000 });
}
