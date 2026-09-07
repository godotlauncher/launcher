import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Page,
    test,
} from '@playwright/test';
import type {
    AddProjectOptions,
    InstalledRelease,
    ReleaseInstallProgress,
    ReleaseSummary,
} from '@shared/contracts';
import {
    createFixtureHome,
    prepareAppWithStubbedData,
    prepareOnboardingFixture,
    reloadE2eFixturePage,
    setAppLanguage,
    stubAppData,
} from './support/e2e-fixture-runtime.ts';
import {
    createPreferences,
    SAMPLE_AVAILABLE_PRERELEASES,
    SAMPLE_AVAILABLE_RELEASES,
    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
    SAMPLE_VSCODE_SETTINGS_AVAILABLE,
    SAMPLE_VSCODIUM_SETTINGS_AVAILABLE,
    TOOL_INTEGRATIONS_NO_GIT,
} from './support/e2e-fixture-data.ts';
import { getMainWindow } from './splashscreen/getMainWindow.ts';

let electronApp: ElectronApplication;
let mainPage: Page;
let fixtureHome: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    electronApp = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`],
        env: createIsolatedLaunchEnvironment(fixtureHome),
    });
    mainPage = await getMainWindow(electronApp);
    await setAppLanguage(mainPage, 'English');
});

test.afterAll(async () => {
    await electronApp.close();
    await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('Installs empty primary action opens and closes the editor drawer', async () => {
    await prepareEmptyApp([]);
    await mainPage.getByTestId('btnInstalls').click();

    const primaryAction = mainPage.getByTestId('btnEmptyStatePrimary');
    await primaryAction.focus();
    await primaryAction.click();

    const installDrawer = mainPage.getByTestId('installEditorDrawer');
    await expect(mainPage).toHaveURL(/#\/installs\/install$/);
    await expect(installDrawer).toBeVisible();
    await expect(installDrawer.locator(':focus')).toHaveCount(1);

    await mainPage.keyboard.press('Escape');
    await expect(installDrawer).not.toBeVisible();
    await expect(mainPage).toHaveURL(/#\/installs$/);
    await expect(primaryAction).toBeFocused();

    await mainPage.evaluate(() => {
        window.location.hash = '#/installs/install';
    });
    await expect(installDrawer).toBeVisible();
    await installDrawer.getByTestId('btnCloseInstallEditor').click();
    await expect(mainPage).toHaveURL(/#\/installs$/);
    await expect(installDrawer).not.toBeVisible();
});

test('Installs custom editor actions share the accessible action menu contract', async () => {
    for (const scenario of [
        {
            name: 'the populated state at the standard desktop size',
            installedReleases: SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
            triggerTestId: 'btnAddCustomEngineMenu',
            selectManifestTestId: 'btnAddCustomEngine',
            createManifestTestId: 'btnCreateCustomEditorManifest',
            exposesExpandedState: true,
            viewport: { width: 1440, height: 900 },
        },
        {
            name: 'the populated state at the narrow desktop size',
            installedReleases: SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
            triggerTestId: 'btnAddCustomEngineMenu',
            selectManifestTestId: 'btnAddCustomEngine',
            createManifestTestId: 'btnCreateCustomEditorManifest',
            exposesExpandedState: true,
            viewport: { width: 1024, height: 600 },
        },
        {
            name: 'the empty state at the standard desktop size',
            installedReleases: [],
            triggerTestId: 'btnEmptyStateSecondary',
            selectManifestTestId: 'btnEmptyStateSelectCustomEditorManifest',
            createManifestTestId: 'btnEmptyStateCreateCustomEditorManifest',
            exposesExpandedState: false,
            viewport: { width: 1440, height: 900 },
        },
        {
            name: 'the empty state at the narrow desktop size',
            installedReleases: [],
            triggerTestId: 'btnEmptyStateSecondary',
            selectManifestTestId: 'btnEmptyStateSelectCustomEditorManifest',
            createManifestTestId: 'btnEmptyStateCreateCustomEditorManifest',
            exposesExpandedState: false,
            viewport: { width: 1024, height: 600 },
        },
    ]) {
        await test.step(scenario.name, async () => {
            await prepareEmptyApp(scenario.installedReleases);
            await mainPage.getByTestId('btnInstalls').click();
            await mainPage.setViewportSize(scenario.viewport);

            const trigger = mainPage.getByTestId(scenario.triggerTestId);
            const customEditorMenu = mainPage.getByRole('dialog', {
                name: 'Custom Editor',
                exact: true,
            });
            const selectManifest = customEditorMenu.getByTestId(
                scenario.selectManifestTestId,
            );
            const createManifest = customEditorMenu.getByTestId(
                scenario.createManifestTestId,
            );

            await trigger.focus();
            if (scenario.exposesExpandedState) {
                await expect(trigger).toHaveAttribute('aria-expanded', 'false');
            }
            await trigger.press('Enter');
            await expect(customEditorMenu).toBeVisible();
            if (scenario.exposesExpandedState) {
                await expect(trigger).toHaveAttribute('aria-expanded', 'true');
            }
            await expect(selectManifest).toHaveAccessibleName(
                'Select manifest file',
            );
            await expect(createManifest).toHaveAccessibleName(
                'Create custom editor manifest',
            );
            await expect(selectManifest).toBeFocused();

            await mainPage.keyboard.press('Tab');
            await expect(createManifest).toBeFocused();
            await mainPage.keyboard.press('Tab');
            await expect(selectManifest).toBeFocused();
            await mainPage.keyboard.press('Shift+Tab');
            await expect(createManifest).toBeFocused();

            const menuBounds = await customEditorMenu.boundingBox();
            expect(menuBounds).not.toBeNull();
            expect(menuBounds!.x).toBeGreaterThanOrEqual(8);
            expect(menuBounds!.y).toBeGreaterThanOrEqual(8);
            expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(
                scenario.viewport.width - 8,
            );
            expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(
                scenario.viewport.height - 8,
            );

            await mainPage.keyboard.press('Escape');
            await expect(customEditorMenu).not.toBeVisible();
            await expect(trigger).toBeFocused();
            if (scenario.exposesExpandedState) {
                await expect(trigger).toHaveAttribute('aria-expanded', 'false');
            }

            await trigger.press('Enter');
            await expect(customEditorMenu).toBeVisible();
            await mainPage.getByRole('button', { name: 'Close menu' }).click();
            await expect(customEditorMenu).not.toBeVisible();
            await expect(trigger).toBeFocused();

            await trigger.press('Enter');
            await expect(customEditorMenu).toBeVisible();
            await createManifest.click();
            await expect(customEditorMenu).not.toBeVisible();

            const customEditorDrawer = mainPage.getByRole('dialog', {
                name: 'Create Custom Editor Manifest',
                exact: true,
            });
            await expect(customEditorDrawer).toBeVisible();
            await expect(customEditorDrawer.locator(':focus')).toHaveCount(1);
            await customEditorDrawer
                .getByRole('button', { name: 'Close drawer' })
                .click();
            await expect(customEditorDrawer).not.toBeVisible();
            await expect(trigger).toBeFocused();

            await stubOpenFileDialog();
            await trigger.press('Enter');
            await expect(customEditorMenu).toBeVisible();
            await selectManifest.click();
            await expect(customEditorMenu).not.toBeVisible();
            await expect.poll(readOpenFileDialogCallCount).toBe(1);
            await expect(trigger).toBeFocused();

            await trigger.press('Enter');
            await expect(customEditorMenu).toBeVisible();
            await mainPage.keyboard.press('Escape');
            await expect(customEditorMenu).not.toBeVisible();
        });
    }
});

test('Custom editor manifest controls remain usable at supported desktop sizes', async () => {
    for (const viewport of [
        { width: 1440, height: 900 },
        { width: 1024, height: 600 },
    ]) {
        await prepareEmptyApp([]);
        await electronApp.evaluate(({ BrowserWindow }, size) => {
            const window = BrowserWindow.getAllWindows().find(
                (candidate) => !candidate.isDestroyed(),
            );
            window?.setSize(size.width, size.height);
        }, viewport);
        await mainPage.setViewportSize(viewport);
        await mainPage.getByTestId('btnInstalls').click();
        await mainPage.getByTestId('btnEmptyStateSecondary').click();
        await mainPage
            .getByTestId('btnEmptyStateCreateCustomEditorManifest')
            .click();

        const drawer = mainPage.getByRole('dialog', {
            name: 'Create Custom Editor Manifest',
            exact: true,
        });
        const outputDirectory = drawer.locator(
            '#customEditorOutputDirectory',
        );
        const browseButton = drawer.getByRole('button', {
            name: 'Select output folder',
        });
        await expect(outputDirectory).toBeVisible();
        await expect(browseButton).toBeEnabled();
        expect(
            (await browseButton.boundingBox())?.height ?? 0,
        ).toBeGreaterThanOrEqual(24);

        await outputDirectory.focus();
        await drawer.locator('#customEditorName').focus();
        await expect(
            drawer.getByRole('img', {
                name: 'Output folder is required.',
            }),
        ).toBeVisible();

        const architecture = drawer.locator('#customEditorwindowsArch');
        await architecture.focus();
        await architecture.press('Space');
        await expect(architecture).toHaveAttribute('aria-expanded', 'true');
        await expect(
            drawer.getByRole('option', { name: 'x64', exact: true }),
        ).toBeFocused();
        await mainPage.keyboard.press('Escape');
        await expect(architecture).toHaveAttribute('aria-expanded', 'false');
        await expect(architecture).toBeFocused();

        await expect
            .poll(async () => {
                const drawerBounds = await drawer.boundingBox();
                const viewportWidth = await mainPage.evaluate(
                    () => window.innerWidth,
                );
                return Boolean(
                    drawerBounds &&
                        drawerBounds.x >= 0 &&
                        drawerBounds.x + drawerBounds.width <= viewportWidth,
                );
            })
            .toBe(true);
        await expect
            .poll(() =>
                drawer.evaluate(
                    (element) => element.scrollWidth <= element.clientWidth,
                ),
            )
            .toBe(true);

        await drawer.getByRole('button', { name: 'Close drawer' }).click();
        await expect(drawer).not.toBeVisible();
    }
});

test('Projects welcome supports creation and local import without an installed editor', async () => {
    await prepareEmptyApp([]);
    await stubOpenFileDialog();
    await mainPage.getByTestId('btnProjects').click();

    const welcome = mainPage.getByTestId('projectsWelcome');
    await expect(welcome).toBeVisible();
    await expect(
        welcome.getByRole('heading', { name: 'Add or create a project' }),
    ).toBeVisible();
    await expect(mainPage.getByTestId('projectsTitle')).toHaveCount(0);
    await expect(mainPage.getByTestId('btnCopyProjectsLocation')).toHaveCount(
        0,
    );
    await expect(mainPage.getByTestId('inputProjectSearch')).toHaveCount(0);
    await expect(mainPage.getByTestId('btnWelcomeAddFromGitHub')).toBeVisible();

    await mainPage.getByTestId('btnWelcomeAddFromComputer').click();
    await expect.poll(readOpenFileDialogCallCount).toBe(1);

    const newProjectAction = mainPage.getByTestId('btnWelcomeCreateProject');
    await newProjectAction.focus();
    await newProjectAction.click();
    const createDrawer = mainPage.getByRole('dialog', {
        name: 'New Project',
    });
    await expect(mainPage).toHaveURL(/#\/projects\/new$/);
    await expect(createDrawer).toBeVisible();
    await expect(createDrawer.locator(':focus')).toHaveCount(1);
    await expect(
        createDrawer.getByTestId('selectCreateProjectRenderer'),
    ).toBeVisible();
    await createDrawer
        .getByTestId('selectCreateProjectGodotEditor')
        .click();
    const editorPopover = createDrawer.getByTestId(
        'createProjectEditorPickerPopover',
    );
    await expect(editorPopover).toBeVisible();
    await expect(
        editorPopover.getByTestId('tabCreateProjectBrowseEditors'),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(
        editorPopover.getByTestId('inputCreateProjectEditorSearch'),
    ).toBeFocused();
    expect(
        await editorPopover
            .locator('[data-testid^="createProjectCatalogueEditor_"]')
            .count(),
    ).toBeGreaterThan(10);

    await mainPage.keyboard.press('Escape');
    await expect(editorPopover).not.toBeVisible();
    await expect(createDrawer).toBeVisible();
    await expect(
        createDrawer.getByTestId('selectCreateProjectGodotEditor'),
    ).toBeFocused();
    await createDrawer
        .getByTestId('selectCreateProjectGodotEditor')
        .click();
    await editorPopover
        .locator('[data-testid^="createProjectCatalogueEditor_"]')
        .first()
        .click();
    await expect(editorPopover).not.toBeVisible();
    await expect(
        createDrawer.getByTestId('createProjectEditorSelection'),
    ).not.toHaveText('Choose an editor');
    await mainPage.keyboard.press('Escape');
    await expect(createDrawer).not.toBeVisible();
    await expect(mainPage).toHaveURL(/#\/projects$/);
    await expect(newProjectAction).toBeFocused();

    await mainPage.evaluate(() => {
        window.location.hash = '#/projects/new';
    });
    await expect(createDrawer).toBeVisible();
    await createDrawer.getByTestId('btnCloseCreateProject').click();
    await expect(mainPage).toHaveURL(/#\/projects$/);
    await expect(createDrawer).not.toBeVisible();

    await prepareEmptyApp(SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM);
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnWelcomeCreateProject').click();
    await expect(
        createDrawer.getByTestId('selectCreateProjectRenderer'),
    ).toBeVisible();
    await createDrawer
        .getByTestId('selectCreateProjectGodotEditor')
        .click();
    await expect(
        createDrawer.getByTestId('tabCreateProjectInstalledEditors'),
    ).toHaveAttribute('aria-selected', 'true');
    await createDrawer.getByTestId('btnCloseCreateProject').click();
});

test('Projects welcome keeps local import available when Git is unavailable', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp, {
        projects: [],
        installedReleases: [],
        toolIntegrations: TOOL_INTEGRATIONS_NO_GIT,
    });
    await mainPage.getByTestId('btnProjects').click();

    await expect(mainPage.getByTestId('btnWelcomeAddFromComputer')).toBeVisible();
    await expect(mainPage.getByTestId('btnWelcomeAddFromGitHub')).toBeDisabled();
    await expect(mainPage.getByText('Git is required to import from GitHub', { exact: true })).toBeVisible();
    const reviewDirectory = path.resolve('.internal-docs/shared-github-connection');
    await fs.mkdir(reviewDirectory, { recursive: true });
    await mainPage.screenshot({ path: path.join(reviewDirectory, 'welcome-git-unavailable.png') });
});

test('Native import offers the newest stable patch for an inferred Godot branch', async () => {
    const availableReleases = [
        createAvailableRelease('4.5-stable'),
        createAvailableRelease('4.4.1-stable'),
        createAvailableRelease('4.4.3-stable'),
    ];
    await prepareAppWithStubbedData(mainPage, electronApp, {
        availableReleases,
    });
    await stubInferredEditorResolution();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectFromComputer').click();

    const dialog = mainPage.getByRole('dialog', {
        name: 'Editor version required',
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('4.4', { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Options' }).click();
    await expect(
        dialog.getByRole('button', { name: 'Download 4.4.3-stable' }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('Remote repository discovery lets users exclude projects before adding', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectPublicGit').click();

    const modal = mainPage.getByRole('dialog', {
        name: 'Clone public Git repository',
    });
    const repositoryUrlInput = modal.getByTestId(
        'inputPublicGitRepositoryUrl',
    );
    await expect(repositoryUrlInput).toBeFocused();
    await repositoryUrlInput.fill('https://example.com/team/games.git');
    await repositoryUrlInput.press('Enter');
    await expect(modal.getByText('Clone to')).toBeVisible();
    await modal.getByRole('button', { name: 'Clone repository' }).click();

    await expect(modal.getByText('Choose projects to add')).toBeVisible();
    const checkboxes = modal.getByRole('checkbox');
    await expect(checkboxes).toHaveCount(3);
    await expect(checkboxes.nth(0)).toBeChecked();
    await expect(checkboxes.nth(1)).toBeChecked();
    await expect(checkboxes.nth(2)).toBeChecked();

    await checkboxes.nth(0).click();
    await expect(modal.getByTestId('btnAddDiscoveredProjects')).toBeDisabled();
    await checkboxes.nth(0).click();
    await modal.getByText('Example Fixture').locator('..').click();
    await expect(checkboxes.nth(0)).not.toBeChecked();
    await expect(checkboxes.nth(1)).toBeChecked();
    await expect(checkboxes.nth(2)).not.toBeChecked();
    await modal.getByTestId('btnAddDiscoveredProjects').click();

    await expect(modal.getByText('Project import complete')).toBeVisible();
    await expect.poll(readRemoteAddedProjectPaths).toEqual([
        '/home/docs/Godot/Projects/games/project.godot',
    ]);
});

test('Remote clone can set repository Git identity before project review', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await stubMissingRemoteGitIdentity();

    const modal = await clonePublicRepositoryForReview();
    await expect(modal.getByText('Set Git identity')).toBeVisible();
    const addIdentityButton = modal.getByRole('button', {
        name: 'Add Git identity',
    });
    await expect(addIdentityButton).toBeFocused();
    await addIdentityButton.click();

    await modal.locator('#remoteProjectGitName').fill('  Example Developer  ');
    await modal.locator('#remoteProjectGitEmail').fill('  developer@example.com  ');
    await modal
        .getByRole('button', { name: 'Save and continue' })
        .click();

    await expect(modal.getByText('Choose projects to add')).toBeVisible();
    await expect.poll(readRemoteGitIdentityWrites).toEqual([
        {
            jobId: 'remote-discovery-job',
            identity: {
                name: 'Example Developer',
                email: 'developer@example.com',
            },
        },
    ]);
});

test('Remote clone applies an automatic project identity preset locally', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await stubAutomaticRemoteGitIdentityPreset();

    const modal = await clonePublicRepositoryForReview();

    await expect(modal.getByText('Choose projects to add')).toBeVisible();
    await expect.poll(readRemoteGitIdentityWrites).toEqual([
        {
            jobId: 'remote-discovery-job',
            identity: {
                name: 'Preset Developer',
                email: 'preset@example.com',
            },
        },
    ]);
});

test('Remote clone continues when a global Git identity write fails', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await stubMissingRemoteGitIdentity();
    await stubRemoteGitIdentitySettingsWriteFailures({ global: true });

    const modal = await clonePublicRepositoryForReview();
    await modal.getByRole('button', { name: 'Add Git identity' }).click();
    await modal.locator('#remoteProjectGitName').fill('Example Developer');
    await modal.locator('#remoteProjectGitEmail').fill('developer@example.com');
    await modal
        .getByRole('radio', { name: 'Save as default global identity' })
        .check();
    await modal.getByRole('button', { name: 'Save and continue' }).click();

    await expect(modal.getByText('Choose projects to add')).toBeVisible();
    await expect(
        modal.getByText(
            'The Git identity could not be saved. The cloned repository was kept and import can continue.',
        ),
    ).toBeVisible();
});

test('Remote clone warns when its future local identity preset cannot be saved', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await stubMissingRemoteGitIdentity();
    await stubRemoteGitIdentitySettingsWriteFailures({ preset: true });

    const modal = await clonePublicRepositoryForReview();
    await modal.getByRole('button', { name: 'Add Git identity' }).click();
    await modal.locator('#remoteProjectGitName').fill('Example Developer');
    await modal.locator('#remoteProjectGitEmail').fill('developer@example.com');
    await modal
        .getByRole('radio', { name: 'Save as default local identity' })
        .check();
    await modal.getByRole('button', { name: 'Save and continue' }).click();

    await expect(modal.getByText('Choose projects to add')).toBeVisible();
    await expect(
        modal.getByText(
            'The identity was applied, but the default local identity could not be saved for future repositories.',
        ),
    ).toBeVisible();
});

test('Remote clone can continue without configuring Git identity', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await stubMissingRemoteGitIdentity();

    const modal = await clonePublicRepositoryForReview();
    await modal
        .getByRole('button', { name: 'Continue without identity' })
        .click();

    await expect(modal.getByText('Choose projects to add')).toBeVisible();
    await expect.poll(readRemoteGitIdentityWrites).toEqual([]);
});

test('Remote clone keeps import available when Git identity cannot be saved', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await stubMissingRemoteGitIdentity();
    await stubRemoteGitIdentityWriteFailure();

    const modal = await clonePublicRepositoryForReview();
    await modal.getByRole('button', { name: 'Add Git identity' }).click();
    await modal.locator('#remoteProjectGitName').fill('Example Developer');
    await modal.locator('#remoteProjectGitEmail').fill('developer@example.com');
    await modal.getByRole('button', { name: 'Save and continue' }).click();

    await expect(modal.getByText('Choose projects to add')).toBeVisible();
    await expect(
        modal.getByText(
            'The Git identity could not be saved. The cloned repository was kept and import can continue.',
        ),
    ).toBeVisible();
});

test('Public repository destination focuses the path and Enter starts import', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectPublicGit').click();

    const modal = mainPage.getByRole('dialog', {
        name: 'Clone public Git repository',
    });
    const repositoryUrlInput = modal.getByTestId(
        'inputPublicGitRepositoryUrl',
    );
    await repositoryUrlInput.fill('https://example.com/team/games.git');
    await repositoryUrlInput.press('Enter');

    const destinationInput = modal.getByTestId('inputRemoteProjectPath');
    await expect(destinationInput).toBeFocused();
    await destinationInput.press('Enter');

    await expect(modal.getByText('Choose projects to add')).toBeVisible();
    const addProjectsButton = modal.getByTestId('btnAddDiscoveredProjects');
    await expect(addProjectsButton).toBeFocused();
    await addProjectsButton.press('Enter');
    await expect(
        modal.getByText('Choose projects to add'),
    ).not.toBeVisible();
});

test('Retryable remote import failure focuses review and retry', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRetryableRemoteImportFailure();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectPublicGit').click();

    const modal = mainPage.getByRole('dialog', {
        name: 'Clone public Git repository',
    });
    const repositoryUrlInput = modal.getByTestId(
        'inputPublicGitRepositoryUrl',
    );
    await repositoryUrlInput.fill('https://example.com/team/games.git');
    await repositoryUrlInput.press('Enter');

    const destinationInput = modal.getByTestId('inputRemoteProjectPath');
    await expect(destinationInput).toBeFocused();
    await destinationInput.press('Enter');

    await expect(modal.getByText('Git could not clone the repository.')).toBeVisible();
    const retryButton = modal.getByTestId('btnReviewAndRetryRemoteImport');
    await expect(retryButton).toBeFocused();
    await retryButton.press('Enter');

    await expect(modal.getByText('Clone to')).toBeVisible();
    await expect(modal.getByTestId('inputRemoteProjectPath')).toBeFocused();
});

test('Remote repositories can initialise public submodules before review', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await stubRemoteProjectSubmodules();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectPublicGit').click();

    const modal = mainPage.getByRole('dialog', {
        name: 'Clone public Git repository',
    });
    const repositoryUrlInput = modal.getByTestId(
        'inputPublicGitRepositoryUrl',
    );
    await repositoryUrlInput.fill('https://example.com/team/games.git');
    await repositoryUrlInput.press('Enter');

    const destinationInput = modal.getByTestId('inputRemoteProjectPath');
    await expect(destinationInput).toBeFocused();
    await destinationInput.press('Enter');

    await expect(
        modal.getByText('This repository uses Git submodules'),
    ).toBeVisible();
    const initialiseButton = modal.getByTestId('btnInitialiseSubmodules');
    await expect(initialiseButton).toBeFocused();
    await initialiseButton.press('Enter');
    await expect(
        modal.getByText('Initialising addons/gdextension'),
    ).toBeVisible();
    await expect(modal.getByText('Choose projects to add')).toBeVisible();
    const addProjectsButton = modal.getByTestId('btnAddDiscoveredProjects');
    await expect(addProjectsButton).toBeFocused();
    await addProjectsButton.press('Enter');
    await expect(modal.getByText('Project import complete')).toBeVisible();
    await expect(modal.getByText('GDExtension Demo')).toBeVisible();
    const doneButton = modal.getByTestId('btnCompleteRemoteProjectImport');
    await expect(doneButton).toBeFocused();
    await doneButton.press('Enter');
    await expect(modal).not.toBeVisible();
});

test('Repeated remote imports log each submodule activity once', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await stubRemoteProjectSubmodules();
    await mainPage.getByTestId('btnProjects').click();

    for (let attempt = 0; attempt < 3; attempt += 1) {
        await mainPage.getByTestId('btnProjectAdd').click();
        await mainPage.getByTestId('btnAddProjectPublicGit').click();

        const modal = mainPage.getByRole('dialog', {
            name: 'Clone public Git repository',
        });
        await modal
            .getByTestId('inputPublicGitRepositoryUrl')
            .fill('https://example.com/team/games.git');
        await modal.getByRole('button', { name: 'Continue' }).click();
        await modal.getByRole('button', { name: 'Clone repository' }).click();
        await modal.getByTestId('btnInitialiseSubmodules').click();

        await expect(
            modal.getByText('Initialising addons/gdextension', { exact: true }),
        ).toHaveCount(1);
        await expect(modal.getByText('Choose projects to add')).toBeVisible();
        await modal.getByRole('button', { name: 'Cancel import' }).click();
        await modal.getByTestId('btnKeepPreservedClone').click();
        await expect(modal).not.toBeVisible();
    }
});

test('Cancelling submodule initialisation exposes clone recovery', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await stubRemoteProjectSubmodules(true);
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectPublicGit').click();

    const modal = mainPage.getByRole('dialog', {
        name: 'Clone public Git repository',
    });
    await modal
        .getByTestId('inputPublicGitRepositoryUrl')
        .fill('https://example.com/team/games.git');
    await modal.getByRole('button', { name: 'Continue' }).click();
    await modal.getByRole('button', { name: 'Clone repository' }).click();
    await modal.getByTestId('btnInitialiseSubmodules').click();
    await expect(
        modal.getByText('Initialising addons/gdextension'),
    ).toBeVisible();
    await modal.getByRole('button', { name: 'Cancel import' }).click();

    await expect(modal.getByText('The import was cancelled.')).toBeVisible();
    await expect(
        modal.getByTestId('btnOpenPreservedCloneFolder'),
    ).toBeVisible();
    await expect(modal.getByTestId('btnDeletePreservedClone')).toBeVisible();
    await modal.getByTestId('btnDeletePreservedClone').click();
    await expect(modal).not.toBeVisible();
    await expect.poll(readRemoteCloneResolutions).toEqual([
        { jobId: 'remote-discovery-job', action: 'delete' },
    ]);
});

test('Cancelling review after submodules offers guarded clone deletion', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await stubRemoteProjectSubmodules();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectPublicGit').click();

    const modal = mainPage.getByRole('dialog', {
        name: 'Clone public Git repository',
    });
    await modal
        .getByTestId('inputPublicGitRepositoryUrl')
        .fill('https://example.com/team/games.git');
    await modal.getByRole('button', { name: 'Continue' }).click();
    await modal.getByRole('button', { name: 'Clone repository' }).click();
    await modal.getByTestId('btnInitialiseSubmodules').click();
    await expect(modal.getByText('Choose projects to add')).toBeVisible();

    await modal.getByRole('button', { name: 'Cancel import' }).click();
    await expect(
        modal.getByText('Cancel repository import?'),
    ).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Back' })).toBeFocused();
    await expect.poll(readRemoteCloneResolutions).toEqual([]);

    await modal.getByRole('button', { name: 'Back' }).click();
    await expect(modal.getByText('Choose projects to add')).toBeVisible();
    await modal.getByRole('button', { name: 'Cancel import' }).click();
    await modal.getByTestId('btnDeletePreservedClone').click();

    await expect(modal).not.toBeVisible();
    await expect.poll(readRemoteCloneResolutions).toEqual([
        { jobId: 'remote-discovery-job', action: 'delete' },
    ]);
});

test('GitHub review can explicitly keep the completed clone', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectGitHub').click();

    const modal = mainPage.getByRole('dialog', { name: 'Import from GitHub' });
    await modal.getByRole('button', { name: 'team/games' }).click();
    await modal.getByRole('button', { name: 'Continue' }).click();
    await modal.getByRole('button', { name: 'Clone repository' }).click();
    await expect(modal.getByText('Choose projects to add')).toBeVisible();

    await modal.getByRole('button', { name: 'Cancel import' }).click();
    await modal.getByTestId('btnKeepPreservedClone').click();

    await expect(modal).not.toBeVisible();
    await expect.poll(readRemoteCloneResolutions).toEqual([
        { jobId: 'remote-discovery-job', action: 'keep' },
    ]);
});

test('Remote project sources stay unavailable when Git is unavailable', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp, {
        toolIntegrations: TOOL_INTEGRATIONS_NO_GIT,
    });
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();

    await expect(mainPage.getByTestId('btnAddProjectFromComputer')).toBeEnabled();
    await expect(mainPage.getByTestId('btnAddProjectPublicGit')).toBeDisabled();
    await expect(mainPage.getByTestId('btnAddProjectGitHub')).toBeDisabled();
});

test('Remote clone progress can be cancelled without preserving a final clone', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await stubPendingRemoteProjectImport();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectPublicGit').click();

    const modal = mainPage.getByRole('dialog', {
        name: 'Clone public Git repository',
    });
    await modal
        .getByTestId('inputPublicGitRepositoryUrl')
        .fill('https://example.com/team/games.git');
    await modal.getByRole('button', { name: 'Continue' }).click();
    await modal.getByRole('button', { name: 'Clone repository' }).click();

    await expect(modal.getByText('Cloning the repository...')).toBeVisible();
    await modal.getByRole('button', { name: 'Cancel import' }).click();
    await expect(modal.getByText('The import was cancelled.')).toBeVisible();
    await expect(modal.getByTestId('btnOpenPreservedCloneFolder')).toHaveCount(
        0,
    );
    await expect(modal.getByTestId('btnDeletePreservedClone')).toHaveCount(0);
});

test('GitHub repository keyboard selection keeps Search inert and Space selection-only', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectGitHub').click();

    const modal = mainPage.getByRole('dialog', { name: 'Import from GitHub' });
    const search = modal.getByTestId('inputGitHubRepositorySearch');
    const repository = modal.getByRole('button', { name: 'team/games' });
    const continueButton = modal.getByRole('button', { name: 'Continue' });

    await expect(search).toBeFocused();
    await search.press('Enter');
    await expect(continueButton).toBeDisabled();

    await mainPage.keyboard.press('Tab');
    await expect(repository).toBeFocused();
    await repository.press('Space');
    await expect(repository).toHaveAttribute('aria-pressed', 'true');
    await expect(continueButton).toBeEnabled();
    await expect(modal.getByText('Clone to')).toHaveCount(0);

    await repository.press('Enter');
    await expect(modal.getByText('Clone to')).toBeVisible();
    await expect(modal.getByText('team/games', { exact: true })).toBeVisible();

    const destinationInput = modal.getByTestId('inputRemoteProjectPath');
    await expect(destinationInput).toBeFocused();
    await destinationInput.press('Enter');
    await expect(modal.getByText('Choose projects to add')).toBeVisible();
});

test('GitHub import connects in the existing modal and refreshes repositories', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await stubGitHubImportConnection();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectGitHub').click();

    const modal = mainPage.getByTestId('remoteProjectImportDialog');
    await expect(modal).toHaveAccessibleName('Connect GitHub');
    await expect(
        modal.getByText(
            'Connect GitHub to browse and import your repositories.',
        ),
    ).toBeVisible();
    await modal.getByRole('button', { name: 'Cancel' }).click();
    await expect(modal).not.toBeVisible();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectGitHub').click();
    await expect(modal).toHaveAccessibleName('Connect GitHub');
    await mainPage.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectGitHub').click();
    await modal.locator('footer').getByRole('button', { name: 'Continue in browser' }).click();
    const list = modal.getByTestId('github-connection-options');
    await expect(list).toBeVisible();
    const footer = modal.locator('footer');
    const toolbar = modal.getByRole('button', {
        name: 'Add account or organisation',
    });
    const footerBefore = await footer.boundingBox();
    const toolbarBefore = await toolbar.boundingBox();
    await list.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await footer.boundingBox()).toEqual(footerBefore);
    expect(await toolbar.boundingBox()).toEqual(toolbarBefore);
    await modal.getByRole('checkbox', { name: 'Select all', exact: true }).check();
    await footer.getByRole('button', { name: /Connect selected/ }).click();
    await expect(modal).toHaveAccessibleName('Import from GitHub');
    await expect(
        modal.getByRole('button', { name: 'team/games' }),
    ).toBeVisible();
    const search = modal.getByTestId('inputGitHubRepositorySearch');
    await search.fill('games');
    await modal.getByRole('button', { name: 'team/games' }).click();
    await expect(modal.getByText("Don't see your repository?", { exact: true })).toBeVisible();
    await modal.getByRole('button', { name: 'Manage accounts and access' }).click();
    await expect(modal.getByRole('button', { name: 'Manage repository access', exact: true })).toBeVisible();
    await expect(modal).toHaveAccessibleName('GitHub connections');
    await expect(modal.getByRole('button', { name: 'Refresh repositories' })).toBeEnabled();
    const reviewDirectory = path.resolve('.internal-docs/shared-github-connection');
    await fs.mkdir(reviewDirectory, { recursive: true });
    await mainPage.screenshot({ path: path.join(reviewDirectory, 'repository-access-light.png') });
    await modal.getByRole('button', { name: 'Manage repository access', exact: true }).click();
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(search).toHaveValue('games');
    await expect(modal.getByRole('button', { name: 'team/games' })).toHaveAttribute('aria-pressed', 'true');
    await modal.getByRole('button', { name: 'Manage accounts and access' }).click();
    await modal.getByRole('button', { name: 'Refresh repositories' }).click();
    await expect(search).toHaveValue('games');
    await expect(modal.getByRole('button', { name: 'team/games' })).toHaveAttribute('aria-pressed', 'true');
    await search.fill('not-present');
    await expect(modal.getByText('No matching repositories are loaded.')).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Manage accounts and access' })).toBeEnabled();

});

test('Enter selects an unselected GitHub repository choice and continues', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectGitHub').click();

    const modal = mainPage.getByRole('dialog', { name: 'Import from GitHub' });
    const search = modal.getByTestId('inputGitHubRepositorySearch');
    const repository = modal.getByRole('button', { name: 'team/games' });

    await expect(search).toBeFocused();
    await mainPage.keyboard.press('Tab');
    await expect(repository).toBeFocused();
    await expect(repository).toHaveAttribute('aria-pressed', 'false');

    await repository.press('Enter');
    await expect(modal.getByText('Clone to')).toBeVisible();
    await expect(modal.getByText('team/games', { exact: true })).toBeVisible();
});

test('GitHub repositories use the same multi-project review', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp, {
        codeEditorSettings: [
            SAMPLE_VSCODE_SETTINGS_AVAILABLE,
            SAMPLE_VSCODIUM_SETTINGS_AVAILABLE,
        ],
    });
    await stubRemoteProjectDiscovery();
    await failRootRemoteProjectRegistration();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectGitHub').click();

    const modal = mainPage.getByRole('dialog', { name: 'Import from GitHub' });
    await modal.getByRole('button', { name: 'team/games' }).click();
    await modal.getByRole('button', { name: 'Continue' }).click();
    await modal.getByRole('button', { name: 'Clone repository' }).click();

    await expect(modal.getByText('Choose projects to add')).toBeVisible();
    await expect(modal.getByText('Root Game')).toBeVisible();
    await expect(modal.getByText('Example Fixture')).toBeVisible();
    await expect(modal.getByText('4.4 stable')).toBeVisible();
    await expect(modal.getByText('4.3.2-stable (.NET)')).toBeVisible();
    await expect(modal.getByRole('checkbox')).toHaveCount(3);
    await expect(
        modal.getByTestId('selectRemoteProjectCodeEditor-0'),
    ).toContainText('Automatic detection');
    await modal.getByTestId('selectRemoteProjectCodeEditor-1').click();
    await modal.getByRole('option', { name: 'VSCodium' }).click();
    await modal.getByTestId('btnAddDiscoveredProjects').click();
    await expect(modal.getByText('Project import complete')).toBeVisible();
    await expect(modal.getByText(/Failed: Duplicate root project/)).toBeVisible();
    await expect.poll(readRemoteAddedProjectPaths).toEqual([
        '/home/docs/Godot/Projects/games/examples/fixture/project.godot',
    ]);
    await expect.poll(readRemoteAddProjectOptions).toEqual([
        {},
        { codeEditorId: 'vscodium' },
    ]);
    await expect(
        modal.getByTestId('btnOpenPreservedCloneFolder'),
    ).toBeVisible();
    await expect(modal.getByTestId('btnDeletePreservedClone')).toHaveCount(0);
    await expect.poll(readRemoteCloneResolutions).toEqual([
        { jobId: 'remote-discovery-job', action: 'keep' },
    ]);
});

test('Preserved clone recovery opens the folder and keeps failed deletion actionable', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await stubPreservedRemoteImportFailure();
    await setRemoteCloneResolutionStatus('delete-failed');
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectPublicGit').click();

    const modal = mainPage.getByRole('dialog', {
        name: 'Clone public Git repository',
    });
    await modal
        .getByTestId('inputPublicGitRepositoryUrl')
        .fill('https://example.com/team/games.git');
    await modal.getByRole('button', { name: 'Continue' }).click();
    await modal.getByRole('button', { name: 'Clone repository' }).click();

    await expect(
        modal.getByText(
            'The repository was cloned, but its Godot projects could not be discovered.',
        ),
    ).toBeVisible();
    await modal.getByTestId('btnOpenPreservedCloneFolder').click();
    await expect.poll(readOpenedRemoteClonePaths).toEqual([
        '/home/docs/Godot/Projects/games',
    ]);
    await modal.getByTestId('btnDeletePreservedClone').click();
    await expect(
        modal.getByText('The clone could not be deleted. It has been kept.'),
    ).toBeVisible();
    await expect(modal.getByTestId('btnOpenPreservedCloneFolder')).toBeVisible();
    await expect(modal.getByTestId('btnDeletePreservedClone')).toBeEnabled();

    await setRemoteCloneResolutionStatus('deleted');
    await modal.getByTestId('btnDeletePreservedClone').click();
    await expect(modal).not.toBeVisible();
    await expect.poll(readRemoteCloneResolutions).toEqual([
        { jobId: 'remote-discovery-job', action: 'delete' },
        { jobId: 'remote-discovery-job', action: 'delete' },
    ]);
});

test('All failed registrations can delete the preserved clone', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await failAllRemoteProjectRegistrations();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectPublicGit').click();

    const modal = mainPage.getByRole('dialog', {
        name: 'Clone public Git repository',
    });
    await modal
        .getByTestId('inputPublicGitRepositoryUrl')
        .fill('https://example.com/team/games.git');
    await modal.getByRole('button', { name: 'Continue' }).click();
    await modal.getByRole('button', { name: 'Clone repository' }).click();
    await modal.getByTestId('btnAddDiscoveredProjects').click();

    await expect(modal.getByText('Project import complete')).toBeVisible();
    await expect(modal.getByTestId('btnOpenPreservedCloneFolder')).toBeVisible();
    await expect(modal.getByTestId('btnDeletePreservedClone')).toBeVisible();
});

test('Preserved clone recovery remains contained with a long locale', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await stubPreservedRemoteImportFailure();
    await setRemoteCloneResolutionStatus('delete-failed');
    await mainPage.getByTestId('btnSettings').click();
    await mainPage.getByTestId('tabAppearance').click();
    const languageSelector = mainPage.getByTestId('selectLanguage');
    const modal = mainPage.getByTestId('remoteProjectImportDialog');

    try {
        await languageSelector.click();
        await mainPage.getByRole('option', { name: 'Deutsch' }).click();
        await expect(languageSelector).toContainText('Deutsch');
        await mainPage.getByTestId('btnProjects').click();
        await mainPage.getByTestId('btnProjectAdd').click();
        await mainPage.getByTestId('btnAddProjectPublicGit').click();
        await modal
            .getByTestId('inputPublicGitRepositoryUrl')
            .fill('https://example.com/team/games.git');
        await modal.getByTestId('btnContinueRemoteProjectImport').click();
        await modal.getByTestId('btnCloneRemoteProjectRepository').click();
        await modal.getByTestId('btnDeletePreservedClone').click();

        await expect(
            modal.getByText(
                'Der Klon konnte nicht gelöscht werden. Er wurde beibehalten.',
            ),
        ).toBeVisible();
        const modalBox = await modal.boundingBox();
        const deleteBox = await modal
            .getByTestId('btnDeletePreservedClone')
            .boundingBox();
        const openBox = await modal
            .getByTestId('btnOpenPreservedCloneFolder')
            .boundingBox();
        expect(modalBox).not.toBeNull();
        expect(deleteBox).not.toBeNull();
        expect(openBox).not.toBeNull();
        if (!modalBox || !deleteBox || !openBox) return;
        expect(deleteBox.x).toBeGreaterThanOrEqual(modalBox.x);
        expect(deleteBox.x + deleteBox.width).toBeLessThanOrEqual(
            modalBox.x + modalBox.width,
        );
        expect(openBox.x).toBeGreaterThanOrEqual(modalBox.x);
        expect(openBox.x + openBox.width).toBeLessThanOrEqual(
            modalBox.x + modalBox.width,
        );
    } finally {
        if (await modal.isVisible()) {
            const closeModalButton = modal
                .getByTestId('btnCloseRemoteProjectImport')
                .or(modal.getByTestId('btnCancelRemoteProjectImport'))
                .or(modal.getByTestId('btnCompleteRemoteProjectImport'));
            if (await closeModalButton.isVisible()) {
                await closeModalButton.click();
                await expect(modal).not.toBeVisible();
            }
        }
        await mainPage.getByTestId('btnSettings').click();
        await mainPage.getByTestId('tabAppearance').click();
        await languageSelector.click();
        await mainPage.getByRole('option', { name: 'English' }).click();
        await expect(languageSelector).toContainText('English');
    }
});

test('Remote registration collects editor resolution inside the import modal', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await requireNestedRemoteEditorResolution();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectPublicGit').click();

    const importModal = mainPage.getByRole('dialog', {
        name: 'Clone public Git repository',
    });
    await importModal
        .getByTestId('inputPublicGitRepositoryUrl')
        .fill('https://example.com/team/games.git');
    await importModal.getByRole('button', { name: 'Continue' }).click();
    await importModal
        .getByRole('button', { name: 'Clone repository' })
        .click();
    await expect(importModal.getByText('Choose projects to add')).toBeVisible();
    await importModal.getByRole('checkbox').first().click();
    await importModal.getByText('Example Fixture').locator('..').click();
    await importModal.getByTestId('btnAddDiscoveredProjects').click();

    await expect(importModal.getByText('Editors required')).toBeVisible();
    await expect(
        importModal.getByTestId('remoteProjectEditorPlan'),
    ).toContainText('Example Fixture');
    await importModal
        .getByRole('button', { name: 'Finish without remaining projects' })
        .click();
    await expect(importModal.getByText('Project import complete')).toBeVisible();
    await expect(
        importModal.getByText(/Skipped: The project was not added\./),
    ).toBeVisible();
});

test('Remote registration preserves the code editor through editor resolution retries', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp, {
        codeEditorSettings: [SAMPLE_VSCODIUM_SETTINGS_AVAILABLE],
    });
    await stubRemoteProjectDiscovery();
    await requireNestedRemoteEditorResolution();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectPublicGit').click();

    const importModal = mainPage.getByRole('dialog', {
        name: 'Clone public Git repository',
    });
    await importModal
        .getByTestId('inputPublicGitRepositoryUrl')
        .fill('https://example.com/team/games.git');
    await importModal.getByRole('button', { name: 'Continue' }).click();
    await importModal
        .getByRole('button', { name: 'Clone repository' })
        .click();
    await expect(importModal.getByText('Choose projects to add')).toBeVisible();
    await importModal.getByRole('checkbox').nth(1).click();
    await importModal.getByTestId('selectRemoteProjectCodeEditor-1').click();
    await importModal.getByRole('option', { name: 'VSCodium' }).click();
    await importModal.getByTestId('btnAddDiscoveredProjects').click();

    await expect(importModal.getByText('Editors required')).toBeVisible();
    await importModal
        .getByTestId('selectRemoteProjectEditorResolution-0')
        .click();
    await importModal
        .getByRole('option', { name: 'Add With Missing Editor' })
        .click();
    await importModal
        .getByTestId('btnApplyRemoteProjectEditorPlan')
        .click();
    await expect(importModal.getByText('Project import complete')).toBeVisible();
    await expect.poll(readRemoteAddProjectOptions).toEqual([
        { codeEditorId: 'vscodium' },
        { codeEditorId: 'vscodium', resolution: 'add_missing' },
    ]);
});

test('Remote registration continues while Installs shows editor progress', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp, {
        availableReleases: [createAvailableRelease('4.4.3-stable')],
    });
    await stubRemoteProjectDiscovery();
    await requireNestedRemoteEditorResolution();
    await stubPendingRemoteEditorInstallation();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectPublicGit').click();

    const importModal = mainPage.getByRole('dialog', {
        name: 'Clone public Git repository',
    });
    await importModal
        .getByTestId('inputPublicGitRepositoryUrl')
        .fill('https://example.com/team/games.git');
    await importModal.getByRole('button', { name: 'Continue' }).click();
    await importModal
        .getByRole('button', { name: 'Clone repository' })
        .click();
    await importModal.getByRole('checkbox').nth(1).click();
    await importModal.getByTestId('btnAddDiscoveredProjects').click();

    await expect(importModal.getByText('Editors required')).toBeVisible();
    const addProjectsButton = importModal.getByTestId(
        'btnApplyRemoteProjectEditorPlan',
    );
    await expect(addProjectsButton).toBeFocused();
    await addProjectsButton.press('Enter');
    await expect(importModal.getByText('Project import complete')).toBeVisible();
    await expect(
        importModal.getByText(/Selected editor downloads were added to Installs/),
    ).toBeVisible();
    const doneButton = importModal.getByTestId(
        'btnCompleteRemoteProjectImport',
    );
    await expect(doneButton).toHaveText('Done');
    await expect(doneButton).toBeFocused();
    await doneButton.press('Enter');
    await expect(importModal).not.toBeVisible();
    await mainPage.getByTestId('btnInstalls').click();

    await publishReleaseInstallProgress({
        id: 'remote-editor-install',
        version: '4.4.3-stable',
        mono: false,
        prerelease: false,
        published_at: null,
        stage: 'downloading',
        canCancel: false,
        percent: 42,
        receivedBytes: 42 * 1024 * 1024,
        totalBytes: 100 * 1024 * 1024,
    });
    const installProgress = mainPage.getByTestId('installedReleaseList');
    await expect(installProgress).toContainText('4.4.3-stable');
    await expect(installProgress).toContainText('Downloading');
    await expect(installProgress).toContainText('42%');
    await expect(installProgress).toContainText('42 MB / 100 MB');

    await completePendingRemoteEditorInstallation();
});

test('Remote registration shows two different missing editors together', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp, {
        availableReleases: [
            createAvailableRelease('4.4.3-stable'),
            createAvailableRelease('4.3.2-stable'),
        ],
    });
    await stubRemoteProjectDiscovery();
    await requireAllRemoteEditorResolutions();
    await stubRemoteEditorInstallations();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectPublicGit').click();

    const importModal = mainPage.getByRole('dialog', {
        name: 'Clone public Git repository',
    });
    await importModal
        .getByTestId('inputPublicGitRepositoryUrl')
        .fill('https://example.com/team/games.git');
    await importModal.getByRole('button', { name: 'Continue' }).click();
    await importModal
        .getByRole('button', { name: 'Clone repository' })
        .click();
    await importModal.getByTestId('btnAddDiscoveredProjects').click();

    const editorPlan = importModal.getByTestId('remoteProjectEditorPlan');
    await expect(importModal.getByText('Editors required')).toBeVisible();
    await expect(editorPlan).toContainText('4.4.3-stable');
    await expect(editorPlan).toContainText('4.3.2-stable');
    await expect(editorPlan).toContainText('Root Game');
    await expect(editorPlan).toContainText('Example Fixture');
    await importModal
        .getByTestId('btnApplyRemoteProjectEditorPlan')
        .click();
    await expect(importModal.getByText('Project import complete')).toBeVisible();
    await expect(
        importModal.getByText(/Selected editor downloads were added to Installs/),
    ).toBeVisible();
    await expect.poll(readRemoteAddedProjectPaths).toEqual([
        '/home/docs/Godot/Projects/games/project.godot',
        '/home/docs/Godot/Projects/games/examples/fixture/project.godot',
    ]);
});

test('Remote registration continues after one editor download fails', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp, {
        availableReleases: [
            createAvailableRelease('4.4.3-stable'),
            createAvailableRelease('4.3.2-stable'),
        ],
    });
    await stubRemoteProjectDiscovery();
    await requireAllRemoteEditorResolutions();
    await stubRemoteEditorInstallations('4.4.3-stable');
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectPublicGit').click();

    const importModal = mainPage.getByRole('dialog', {
        name: 'Clone public Git repository',
    });
    await importModal
        .getByTestId('inputPublicGitRepositoryUrl')
        .fill('https://example.com/team/games.git');
    await importModal.getByRole('button', { name: 'Continue' }).click();
    await importModal
        .getByRole('button', { name: 'Clone repository' })
        .click();
    await importModal.getByTestId('btnAddDiscoveredProjects').click();
    await importModal
        .getByTestId('btnApplyRemoteProjectEditorPlan')
        .click();

    await expect(importModal.getByText('Project import complete')).toBeVisible();
    await expect(mainPage.getByText('Simulated editor failure')).toBeVisible();
    await expect.poll(readRemoteEditorInstallVersions).toEqual([
        '4.4.3-stable',
        '4.3.2-stable',
    ]);
    await expect.poll(readRemoteEditorAssignments).toEqual(['4.3.2-stable']);
});

test('Onboarding without an editor finishes on the Projects welcome', async () => {
    await prepareOnboardingFixture(
        mainPage,
        electronApp,
        'linux',
        'preferences',
    );
    await stubAppData(
        electronApp,
        createPreferences({
            first_run: true,
            projects_location: '/home/docs/Godot/Projects',
            install_location: '/home/docs/Godot/Editors',
            language: 'en',
        }),
        [],
        [],
        SAMPLE_AVAILABLE_RELEASES,
        SAMPLE_AVAILABLE_PRERELEASES,
    );
    await reloadE2eFixturePage(mainPage);

    const finishButton = mainPage.getByRole('button', {
        name: 'Finish and view projects',
    });
    await expect(finishButton).toBeVisible();
    await finishButton.click();

    await expect(mainPage).toHaveURL(/#\/projects$/);
    await expect(mainPage.getByTestId('projectsWelcome')).toBeVisible();
    await expect(mainPage.getByTestId('installEditorDrawer')).toHaveCount(0);
    await expect(
        mainPage.getByText('Add or create a project'),
    ).toBeVisible();
});

/**
 * Loads an empty project collection with the supplied installed editors.
 *
 * @param installedReleases - Editors returned to the renderer.
 * @returns A promise that ends when the empty app state is ready.
 */
async function prepareEmptyApp(
    installedReleases: typeof SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
): Promise<void> {
    await prepareAppWithStubbedData(mainPage, electronApp, {
        projects: [],
        installedReleases,
    });
}

/**
 * Replaces the native file dialog with a recorded cancelled response.
 *
 * @returns A promise that ends when the handler is installed.
 */
async function stubOpenFileDialog(): Promise<void> {
    await electronApp.evaluate(({ ipcMain }) => {
        const state = globalThis as typeof globalThis & {
            __guidedEmptyStateOpenFileDialogCalls?: number;
        };
        state.__guidedEmptyStateOpenFileDialogCalls = 0;
        ipcMain.removeHandler('app.openFileDialog');
        ipcMain.handle('app.openFileDialog', async () => {
            state.__guidedEmptyStateOpenFileDialogCalls =
                (state.__guidedEmptyStateOpenFileDialogCalls ?? 0) + 1;
            return {
                success: true,
                data: { canceled: true, filePaths: [] },
            };
        });
    });
}

/** Stubs a GitHub connection that makes one repository available on completion. */
async function stubGitHubImportConnection(): Promise<void> {
    await electronApp.evaluate(({ ipcMain }) => {
        const state = globalThis as typeof globalThis & {
            __guidedGitHubImportConnected?: boolean;
        };
        state.__guidedGitHubImportConnected = false;

        const integration = () => ({
            id: 'github',
            displayName: 'GitHub',
            state: 'connected' as const,
            connectionStage: null,
            connections: [
                {
                    id: 'connection-id',
                    accountLogin: 'docs',
                    accountDisplayName: 'Documentation User',
                    state: 'connected' as const,
                    accessTargets: [
                        {
                            id: 'target-id',
                            login: 'docs',
                            type: 'user' as const,
                            availability: 'available' as const,
                            capabilities: ['repository-browsing' as const],
                        },
                    ],
                },
            ],
            connectionOptions: [],
        });

        ipcMain.removeHandler('appIntegrations.listIntegrations');
        ipcMain.handle('appIntegrations.listIntegrations', () => ({ success: true, data: state.__guidedGitHubImportConnected ? [integration()] : [] }));
        ipcMain.removeHandler('appIntegrations.manageAccess');
        ipcMain.handle('appIntegrations.manageAccess', () => ({ success: true, data: { ok: true, integration: integration() } }));
        ipcMain.removeHandler('appIntegrations.refresh');
        ipcMain.handle('appIntegrations.refresh', () => ({ success: true, data: { ok: true, integration: integration() } }));
        ipcMain.removeHandler('projects.listConnectedRepositories');
        ipcMain.handle('projects.listConnectedRepositories', async () => ({
            success: true,
            data: state.__guidedGitHubImportConnected
                ? {
                      ok: true,
                      page: {
                          repositories: [
                              {
                                  repositoryRef: 'repository-ref',
                                  providerId: 'github',
                                  owner: 'team',
                                  name: 'games',
                                  visibility: 'private',
                                  alreadyImported: false,
                              },
                          ],
                          nextCursor: null,
                      },
                  }
                : { ok: false, reason: 'no-usable-connection' },
        }));
        ipcMain.removeHandler('appIntegrations.connect');
        ipcMain.handle('appIntegrations.connect', async () => ({
            success: true,
            data: { ok: true, integration: {
                ...integration(), state: 'selection-required', connectionStage: 'choosing',
                connections: [],
                connectionOptions: Array.from({ length: 20 }, (_, index) => ({
                    id: `account-${index}`, login: `account-${index}`, type: 'organization',
                })),
            } },
        }));
        ipcMain.removeHandler('appIntegrations.finishConnections');
        ipcMain.handle('appIntegrations.finishConnections', async () => {
            state.__guidedGitHubImportConnected = true;
            return {
                success: true,
                data: { ok: true, integration: integration() },
            };
        });
        ipcMain.removeHandler('appIntegrations.cancel');
        ipcMain.handle('appIntegrations.cancel', async () => ({
            success: true,
            data: { ok: true, integration: integration() },
        }));
    });
}

/** Installs a native Add Project result for an inferred stable branch. */
async function stubInferredEditorResolution(): Promise<void> {
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('app.openFileDialog');
        ipcMain.handle('app.openFileDialog', async () => ({
            success: true,
            data: {
                canceled: false,
                filePaths: [
                    '/home/docs/Godot/Projects/inferred/project.godot',
                ],
            },
        }));
        ipcMain.removeHandler('projects.addProject');
        ipcMain.handle('projects.addProject', async () => ({
            success: true,
            data: {
                success: false,
                editorResolution: {
                    requested: {
                        kind: 'stable-base',
                        channel: 'official',
                        flavor: 'gdscript',
                        base_version: '4.4',
                    },
                    downloadable: {
                        match: 'stable-base',
                        base_version: '4.4',
                        flavor: 'gdscript',
                    },
                },
            },
        }));
    });
}

/**
 * Creates an official release with a standard editor asset.
 *
 * @param version - Stable release version.
 * @returns A renderer catalogue fixture.
 */
function createAvailableRelease(version: string): ReleaseSummary {
    return {
        version,
        version_number: Number.parseFloat(version),
        name: version,
        published_at: null,
        draft: false,
        prerelease: false,
        assets: [
            {
                name: `${version}-linux-x64`,
                download_url: 'https://example.com/godot.zip',
                platform_tags: ['linux', 'x64'],
                mono: false,
            },
        ],
    };
}

/**
 * Reads how many times the recorded native file dialog was requested.
 *
 * @returns The current recorded call count.
 */
async function readOpenFileDialogCallCount(): Promise<number> {
    return await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedEmptyStateOpenFileDialogCalls?: number;
        };
        return state.__guidedEmptyStateOpenFileDialogCalls ?? 0;
    });
}

/**
 * Clones the deterministic public repository and returns its import dialog.
 *
 * @returns The remote import dialog after cloning reaches identity or review.
 */
async function clonePublicRepositoryForReview(): Promise<import('@playwright/test').Locator> {
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectPublicGit').click();

    const modal = mainPage.getByRole('dialog', {
        name: 'Clone public Git repository',
    });
    await modal
        .getByTestId('inputPublicGitRepositoryUrl')
        .fill('https://example.com/team/games.git');
    await modal.getByRole('button', { name: 'Continue' }).click();
    await modal.getByRole('button', { name: 'Clone repository' }).click();
    return modal;
}

/** Configures the deterministic clone fixture with no complete Git identity. */
async function stubMissingRemoteGitIdentity(): Promise<void> {
    await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedGitIdentitySettings?: {
                globalIdentity: { name: string; email: string };
                projectPreset: null;
            };
        };
        state.__guidedGitIdentitySettings = {
            globalIdentity: { name: '', email: '' },
            projectPreset: null,
        };
    });
}

/** Configures an automatic Launcher identity preset for the deterministic clone. */
async function stubAutomaticRemoteGitIdentityPreset(): Promise<void> {
    await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedGitIdentitySettings?: {
                globalIdentity: { name: string; email: string };
                projectPreset: {
                    name: string;
                    email: string;
                    useForNewRepositories: boolean;
                } | null;
            };
        };
        state.__guidedGitIdentitySettings = {
            globalIdentity: { name: '', email: '' },
            projectPreset: {
                name: 'Preset Developer',
                email: 'preset@example.com',
                useForNewRepositories: true,
            },
        };
    });
}

/**
 * Makes selected Git settings writes fail in the deterministic clone fixture.
 *
 * @param failures - Git settings boundaries that should report failure.
 */
async function stubRemoteGitIdentitySettingsWriteFailures(failures: {
    global?: boolean;
    preset?: boolean;
}): Promise<void> {
    await electronApp.evaluate((_electron, selectedFailures) => {
        const state = globalThis as typeof globalThis & {
            __guidedGlobalGitIdentityWriteStatus?: boolean;
            __guidedProjectPresetWriteStatus?: boolean;
        };
        state.__guidedGlobalGitIdentityWriteStatus = !selectedFailures.global;
        state.__guidedProjectPresetWriteStatus = !selectedFailures.preset;
    }, failures);
}

/** Makes repository-local Git identity writes fail without discarding the clone. */
async function stubRemoteGitIdentityWriteFailure(): Promise<void> {
    await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedRemoteGitIdentityStatus?: 'configured' | 'update-failed';
        };
        state.__guidedRemoteGitIdentityStatus = 'update-failed';
    });
}

/** Reads repository-local identities submitted by the remote import dialog. */
async function readRemoteGitIdentityWrites(): Promise<
    Array<{
        jobId: string;
        identity: { name: string; email: string };
    }>
> {
    return electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedRemoteGitIdentityWrites?: Array<{
                jobId: string;
                identity: { name: string; email: string };
            }>;
        };
        return state.__guidedRemoteGitIdentityWrites ?? [];
    });
}

/** Installs deterministic IPC results for the multi-project clone review. */
async function stubRemoteProjectDiscovery(): Promise<void> {
    await electronApp.evaluate(({ ipcMain }) => {
        const state = globalThis as typeof globalThis & {
            __guidedRemoteAddedProjectPaths?: string[];
            __guidedRemoteAddProjectOptions?: AddProjectOptions[];
            __guidedFailRootRemoteProject?: boolean;
            __guidedFailAllRemoteProjects?: boolean;
            __guidedRequireNestedRemoteEditor?: boolean;
            __guidedRequireAllRemoteEditors?: boolean;
            __guidedRemoteCloneResolutions?: Array<{
                jobId: string;
                action: 'keep' | 'delete';
            }>;
            __guidedRemoteCloneResolutionStatus?:
                | 'deleted'
                | 'delete-failed';
            __guidedOpenedRemoteClonePaths?: string[];
            __guidedGitIdentitySettings?: {
                globalIdentity: { name: string; email: string };
                projectPreset: {
                    name: string;
                    email: string;
                    useForNewRepositories: boolean;
                } | null;
            };
            __guidedGlobalGitIdentityWriteStatus?: boolean;
            __guidedProjectPresetWriteStatus?: boolean;
            __guidedRemoteGitIdentityWrites?: Array<{
                jobId: string;
                identity: { name: string; email: string };
            }>;
            __guidedRemoteGitIdentityStatus?: 'configured' | 'update-failed';
        };
        state.__guidedRemoteAddedProjectPaths = [];
        state.__guidedRemoteAddProjectOptions = [];
        state.__guidedFailRootRemoteProject = false;
        state.__guidedFailAllRemoteProjects = false;
        state.__guidedRequireNestedRemoteEditor = false;
        state.__guidedRequireAllRemoteEditors = false;
        state.__guidedRemoteCloneResolutions = [];
        state.__guidedRemoteCloneResolutionStatus = 'deleted';
        state.__guidedOpenedRemoteClonePaths = [];
        state.__guidedGitIdentitySettings = {
            globalIdentity: {
                name: 'Documentation User',
                email: 'docs@example.com',
            },
            projectPreset: null,
        };
        state.__guidedRemoteGitIdentityWrites = [];
        state.__guidedRemoteGitIdentityStatus = 'configured';
        state.__guidedGlobalGitIdentityWriteStatus = true;
        state.__guidedProjectPresetWriteStatus = true;

        ipcMain.removeHandler('git.getIdentitySettings');
        ipcMain.handle('git.getIdentitySettings', async () => ({
            success: true,
            data: state.__guidedGitIdentitySettings,
        }));
        ipcMain.removeHandler('git.saveGlobalIdentity');
        ipcMain.handle('git.saveGlobalIdentity', async (_event, identity) => ({
            success: true,
            data: {
                success: state.__guidedGlobalGitIdentityWriteStatus,
                identity,
            },
        }));
        ipcMain.removeHandler('git.saveProjectIdentityPreset');
        ipcMain.handle(
            'git.saveProjectIdentityPreset',
            async (_event, preset) => ({
                success: true,
                data: {
                    success: state.__guidedProjectPresetWriteStatus,
                    preset,
                },
            }),
        );
        ipcMain.removeHandler('projects.setRemoteProjectGitIdentity');
        ipcMain.handle(
            'projects.setRemoteProjectGitIdentity',
            async (
                _event,
                jobId: string,
                identity: { name: string; email: string },
            ) => {
                state.__guidedRemoteGitIdentityWrites?.push({ jobId, identity });
                return {
                    success: true,
                    data: {
                        jobId,
                        status: state.__guidedRemoteGitIdentityStatus,
                    },
                };
            },
        );

        ipcMain.removeHandler('projects.inspectPublicGitSource');
        ipcMain.handle('projects.inspectPublicGitSource', async () => ({
            success: true,
            data: {
                ok: true,
                canonicalUrl: 'https://example.com/team/games.git',
                suggestedDirectoryName: 'games',
            },
        }));
        ipcMain.removeHandler('projects.listConnectedRepositories');
        ipcMain.handle('projects.listConnectedRepositories', async () => ({
            success: true,
            data: {
                ok: true,
                page: {
                    repositories: [
                        {
                            repositoryRef: 'repository-ref',
                            providerId: 'github',
                            owner: 'team',
                            name: 'games',
                            visibility: 'private',
                            alreadyImported: false,
                        },
                    ],
                    nextCursor: null,
                },
            },
        }));
        ipcMain.removeHandler('projects.importRemoteProject');
        ipcMain.handle('projects.importRemoteProject', async () => ({
            success: true,
            data: {
                ok: true,
                jobId: 'remote-discovery-job',
                repositoryPath: '/home/docs/Godot/Projects/games',
                hasSubmodules: false,
                projects: [
                    {
                        name: 'Root Game',
                        relativePath: '.',
                        projectFilePath:
                            '/home/docs/Godot/Projects/games/project.godot',
                        detectedEditor: {
                            kind: 'stable-base',
                            channel: 'official',
                            flavor: 'gdscript',
                            baseVersion: '4.4',
                        },
                    },
                    {
                        name: 'Example Fixture',
                        relativePath: 'examples/fixture',
                        projectFilePath:
                            '/home/docs/Godot/Projects/games/examples/fixture/project.godot',
                        detectedEditor: {
                            kind: 'exact',
                            channel: 'official',
                            flavor: 'dotnet',
                            baseVersion: '4.3',
                            version: '4.3.2-stable',
                        },
                    },
                ],
            },
        }));
        ipcMain.removeHandler('projects.addProject');
        ipcMain.handle(
            'projects.addProject',
            async (
                _event,
                projectFilePath: string,
                options: AddProjectOptions = {},
            ) => {
                state.__guidedRemoteAddProjectOptions?.push(options);
                if (
                    state.__guidedFailAllRemoteProjects ||
                    (state.__guidedFailRootRemoteProject &&
                        projectFilePath ===
                            '/home/docs/Godot/Projects/games/project.godot')
                ) {
                    return {
                        success: true,
                        data: {
                            success: false,
                            error: 'Duplicate root project',
                        },
                    };
                }
                const needsEditorResolution =
                    options.resolution === undefined &&
                    (state.__guidedRequireAllRemoteEditors ||
                        (state.__guidedRequireNestedRemoteEditor &&
                            projectFilePath ===
                                '/home/docs/Godot/Projects/games/examples/fixture/project.godot'));
                if (needsEditorResolution) {
                    const requiresOlderEditor =
                        state.__guidedRequireAllRemoteEditors &&
                        projectFilePath.includes('fixture');
                    return {
                        success: true,
                        data: {
                            success: false,
                            editorResolution: {
                                requested: {
                                    kind: requiresOlderEditor
                                        ? 'exact'
                                        : 'stable-base',
                                    channel: 'official',
                                    flavor: 'gdscript',
                                    base_version: requiresOlderEditor
                                        ? '4.3'
                                        : '4.4',
                                    ...(requiresOlderEditor
                                        ? { version: '4.3.2-stable' }
                                        : {}),
                                },
                                downloadable: {
                                    match: requiresOlderEditor
                                        ? 'exact'
                                        : 'stable-base',
                                    ...(requiresOlderEditor
                                        ? { version: '4.3.2-stable' }
                                        : { base_version: '4.4' }),
                                    flavor: 'gdscript',
                                    ...(requiresOlderEditor
                                        ? { prerelease: false }
                                        : {}),
                                },
                            },
                        },
                    };
                }
                state.__guidedRemoteAddedProjectPaths?.push(projectFilePath);
                const projectDirectory = projectFilePath.replace(
                    /\/project\.godot$/i,
                    '',
                );
                const newProject = {
                    name: projectFilePath.includes('fixture')
                        ? 'Example Fixture'
                        : 'Root Game',
                    path: projectDirectory,
                    icon_path: '',
                    version: '4.4 (missing)',
                    version_number: 4.4,
                    renderer: 'FORWARD_PLUS',
                    added_at: new Date(),
                    last_opened: null,
                    launch_path: '',
                    editor_settings_path: '',
                    editor_settings_file: '',
                    config_version: 5,
                    withGit: true,
                    codeEditorId: options.codeEditorId ?? null,
                    valid: false,
                    invalid_reason: 'missing_editor',
                    release: {
                        version: '4.4 (missing)',
                        version_number: 4.4,
                        install_path: '',
                        editor_path: '',
                        platform: 'linux',
                        arch: 'x86_64',
                        mono: false,
                        prerelease: false,
                        config_version: 5,
                        published_at: null,
                        valid: false,
                    },
                };
                return {
                    success: true,
                    data: { success: true, newProject },
                };
            },
        );
        ipcMain.removeHandler('projects.resolveRemoteProjectClone');
        ipcMain.handle(
            'projects.resolveRemoteProjectClone',
            async (_event, jobId: string, action: 'keep' | 'delete') => {
                state.__guidedRemoteCloneResolutions?.push({ jobId, action });
                return {
                    success: true,
                    data: {
                        jobId,
                        status:
                            action === 'keep'
                                ? 'kept'
                                : state.__guidedRemoteCloneResolutionStatus,
                    },
                };
            },
        );
        ipcMain.removeHandler('app.openShellFolder');
        ipcMain.handle('app.openShellFolder', async (_event, folderPath) => {
            state.__guidedOpenedRemoteClonePaths?.push(folderPath);
            return { success: true, data: undefined };
        });
    });
}

/** Makes clone discovery fail after the final repository path is retained. */
async function stubPreservedRemoteImportFailure(): Promise<void> {
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('projects.importRemoteProject');
        ipcMain.handle('projects.importRemoteProject', async () => ({
            success: true,
            data: {
                ok: false,
                jobId: 'remote-discovery-job',
                reason: 'discovery-failed',
                repositoryPath: '/home/docs/Godot/Projects/games',
            },
        }));
    });
}

/** Makes clone execution fail before a final repository path is retained. */
async function stubRetryableRemoteImportFailure(): Promise<void> {
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('projects.importRemoteProject');
        ipcMain.handle('projects.importRemoteProject', async () => ({
            success: true,
            data: {
                ok: false,
                jobId: 'remote-clone-failed-job',
                reason: 'clone-failed',
            },
        }));
    });
}

/** Holds a clone open until cancellation resolves it without a final path. */
async function stubPendingRemoteProjectImport(): Promise<void> {
    await electronApp.evaluate(({ BrowserWindow, ipcMain }) => {
        const state = globalThis as typeof globalThis & {
            __guidedCancelRemoteImport?: () => void;
        };
        ipcMain.removeHandler('projects.importRemoteProject');
        ipcMain.handle(
            'projects.importRemoteProject',
            async () =>
                await new Promise((resolve) => {
                    state.__guidedCancelRemoteImport = () =>
                        resolve({
                            success: true,
                            data: {
                                ok: false,
                                jobId: 'pending-remote-job',
                                reason: 'cancelled',
                            },
                        });
                    const window = BrowserWindow.getAllWindows().find(
                        (candidate) =>
                            candidate.webContents
                                .getURL()
                                .startsWith('http://localhost:5123'),
                    );
                    setTimeout(() => {
                        window?.webContents.send(
                            'remote-project-import-progress',
                            {
                                jobId: 'pending-remote-job',
                                stage: 'cloning',
                                canCancel: true,
                                percent: 35,
                            },
                        );
                    }, 50);
                }),
        );
        ipcMain.removeHandler('projects.cancelRemoteProjectImport');
        ipcMain.handle(
            'projects.cancelRemoteProjectImport',
            async (_event, jobId: string) => {
                state.__guidedCancelRemoteImport?.();
                state.__guidedCancelRemoteImport = undefined;
                return {
                    success: true,
                    data: { jobId, status: 'cancelling' },
                };
            },
        );
    });
}

/**
 * Adds a deterministic public submodule initialisation and activity flow.
 *
 * @param cancelOnRequest - Whether cancellation should end the pending flow.
 */
async function stubRemoteProjectSubmodules(
    cancelOnRequest = false,
): Promise<void> {
    await electronApp.evaluate(({ BrowserWindow, ipcMain }, shouldCancel) => {
        const state = globalThis as typeof globalThis & {
            __guidedCancelRemoteImport?: () => void;
        };
        ipcMain.removeHandler('projects.importRemoteProject');
        ipcMain.handle('projects.importRemoteProject', async () => ({
            success: true,
            data: {
                ok: true,
                jobId: 'remote-discovery-job',
                repositoryPath: '/home/docs/Godot/Projects/games',
                hasSubmodules: true,
                projects: [],
            },
        }));
        ipcMain.removeHandler('projects.initialiseRemoteProjectSubmodules');
        ipcMain.handle(
            'projects.initialiseRemoteProjectSubmodules',
            async (_event, jobId: string) =>
                await new Promise((resolve) => {
                    const window = BrowserWindow.getAllWindows().find(
                        (candidate) =>
                            candidate.webContents
                                .getURL()
                                .startsWith('http://localhost:5123'),
                    );
                    setTimeout(() => {
                        window?.webContents.send(
                            'remote-project-import-progress',
                            {
                                jobId,
                                stage: 'initialising-submodules',
                                canCancel: true,
                                activity: {
                                    type: 'initialising',
                                    path: 'addons/gdextension',
                                },
                            },
                        );
                    }, 20);
                    if (shouldCancel) {
                        state.__guidedCancelRemoteImport = () =>
                            resolve({
                                success: true,
                                data: {
                                    ok: false,
                                    jobId,
                                    reason: 'cancelled',
                                },
                            });
                        return;
                    }
                    setTimeout(
                        () =>
                            resolve({
                                success: true,
                                data: {
                                    ok: true,
                                    jobId,
                                    projects: [
                                        {
                                            name: 'GDExtension Demo',
                                            relativePath: 'demo',
                                            projectFilePath:
                                                '/home/docs/Godot/Projects/games/demo/project.godot',
                                            detectedEditor: null,
                                        },
                                    ],
                                },
                            }),
                        150,
                    );
                }),
        );
        if (shouldCancel) {
            ipcMain.removeHandler('projects.cancelRemoteProjectImport');
            ipcMain.handle(
                'projects.cancelRemoteProjectImport',
                async (_event, jobId: string) => {
                    state.__guidedCancelRemoteImport?.();
                    state.__guidedCancelRemoteImport = undefined;
                    return {
                        success: true,
                        data: { jobId, status: 'cancelling' },
                    };
                },
            );
        }
    }, cancelOnRequest);
}

/** Sets the deterministic result returned by preserved-clone deletion. */
async function setRemoteCloneResolutionStatus(
    status: 'deleted' | 'delete-failed',
): Promise<void> {
    await electronApp.evaluate((_, nextStatus) => {
        const state = globalThis as typeof globalThis & {
            __guidedRemoteCloneResolutionStatus?:
                | 'deleted'
                | 'delete-failed';
        };
        state.__guidedRemoteCloneResolutionStatus = nextStatus;
    }, status);
}

/** Makes the nested discovery require editor resolution during registration. */
async function requireNestedRemoteEditorResolution(): Promise<void> {
    await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedRequireNestedRemoteEditor?: boolean;
        };
        state.__guidedRequireNestedRemoteEditor = true;
    });
}

/** Makes every remote discovery require sequential editor resolution. */
async function requireAllRemoteEditorResolutions(): Promise<void> {
    await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedRequireAllRemoteEditors?: boolean;
        };
        state.__guidedRequireAllRemoteEditors = true;
    });
}

/** Holds a remote editor installation open until its progress is asserted. */
async function stubPendingRemoteEditorInstallation(): Promise<void> {
    await electronApp.evaluate(({ ipcMain }) => {
        const state = globalThis as typeof globalThis & {
            __guidedCompleteRemoteEditorInstall?: () => void;
        };
        ipcMain.removeHandler('editorInstalls.installEditor');
        ipcMain.handle(
            'editorInstalls.installEditor',
            async (_event, release: ReleaseSummary, mono: boolean) =>
                await new Promise((resolve) => {
                    state.__guidedCompleteRemoteEditorInstall = () =>
                        resolve({
                            success: true,
                            data: {
                                success: true,
                                version: release.version,
                                release: {
                                    version: release.version,
                                    version_number: Number.parseFloat(
                                        release.version,
                                    ),
                                    install_path: '/editors/installed',
                                    editor_path: '/editors/installed/Godot',
                                    platform: 'linux',
                                    arch: 'x86_64',
                                    mono,
                                    prerelease: release.prerelease,
                                    config_version: 5,
                                    published_at: release.published_at,
                                    valid: true,
                                },
                            },
                        });
                }),
        );
        ipcMain.removeHandler('projects.setProjectEditor');
        ipcMain.handle('projects.setProjectEditor', async () => ({
            success: true,
            data: { success: true },
        }));
    });
}

/**
 * Resolves remote editor installs immediately, with one optional failure.
 *
 * @param failedVersion - Editor version that should return a failed result.
 */
async function stubRemoteEditorInstallations(
    failedVersion?: string,
): Promise<void> {
    await electronApp.evaluate(({ ipcMain }, injectedFailedVersion) => {
        const state = globalThis as typeof globalThis & {
            __guidedRemoteEditorInstallVersions?: string[];
            __guidedRemoteEditorAssignments?: string[];
        };
        state.__guidedRemoteEditorInstallVersions = [];
        state.__guidedRemoteEditorAssignments = [];
        ipcMain.removeHandler('editorInstalls.installEditor');
        ipcMain.handle(
            'editorInstalls.installEditor',
            async (_event, release: ReleaseSummary, mono: boolean) => {
                state.__guidedRemoteEditorInstallVersions?.push(
                    release.version,
                );
                if (release.version === injectedFailedVersion) {
                    return {
                        success: true,
                        data: {
                            success: false,
                            version: release.version,
                            error: 'Simulated editor failure',
                        },
                    };
                }
                return {
                    success: true,
                    data: {
                        success: true,
                        version: release.version,
                        release: {
                            version: release.version,
                            version_number: Number.parseFloat(release.version),
                            install_path: `/editors/${release.version}`,
                            editor_path: `/editors/${release.version}/Godot`,
                            platform: 'linux',
                            arch: 'x86_64',
                            mono,
                            prerelease: release.prerelease,
                            config_version: 5,
                            published_at: release.published_at,
                            valid: true,
                        },
                    },
                };
            },
        );
        ipcMain.removeHandler('projects.setProjectEditor');
        ipcMain.handle(
            'projects.setProjectEditor',
            async (_event, _project, release: InstalledRelease) => {
                state.__guidedRemoteEditorAssignments?.push(release.version);
                return {
                    success: true,
                    data: { success: true },
                };
            },
        );
    }, failedVersion);
}

/** Releases the pending remote editor installation result. */
async function completePendingRemoteEditorInstallation(): Promise<void> {
    await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedCompleteRemoteEditorInstall?: () => void;
        };
        const complete = state.__guidedCompleteRemoteEditorInstall;
        if (!complete) {
            throw new Error('No remote editor installation is pending.');
        }
        state.__guidedCompleteRemoteEditorInstall = undefined;
        complete();
    });
}

/** Makes the root discovery fail registration for continuation coverage. */
async function failRootRemoteProjectRegistration(): Promise<void> {
    await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedFailRootRemoteProject?: boolean;
        };
        state.__guidedFailRootRemoteProject = true;
    });
}

/** Makes every discovered project fail registration. */
async function failAllRemoteProjectRegistrations(): Promise<void> {
    await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedFailAllRemoteProjects?: boolean;
        };
        state.__guidedFailAllRemoteProjects = true;
    });
}

/** Reads the project paths submitted by the remote discovery review. */
async function readRemoteAddedProjectPaths(): Promise<string[]> {
    return electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedRemoteAddedProjectPaths?: string[];
        };
        return state.__guidedRemoteAddedProjectPaths ?? [];
    });
}

/** Reads the registration options submitted by the remote discovery review. */
async function readRemoteAddProjectOptions(): Promise<AddProjectOptions[]> {
    return electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedRemoteAddProjectOptions?: AddProjectOptions[];
        };
        return state.__guidedRemoteAddProjectOptions ?? [];
    });
}

/** Reads editor versions submitted by the remote background queue. */
async function readRemoteEditorInstallVersions(): Promise<string[]> {
    return electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedRemoteEditorInstallVersions?: string[];
        };
        return state.__guidedRemoteEditorInstallVersions ?? [];
    });
}

/** Reads editor versions assigned after background installation. */
async function readRemoteEditorAssignments(): Promise<string[]> {
    return electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedRemoteEditorAssignments?: string[];
        };
        return state.__guidedRemoteEditorAssignments ?? [];
    });
}

/** Reads clone recovery operations submitted by the remote import modal. */
async function readRemoteCloneResolutions(): Promise<
    Array<{ jobId: string; action: 'keep' | 'delete' }>
> {
    return electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedRemoteCloneResolutions?: Array<{
                jobId: string;
                action: 'keep' | 'delete';
            }>;
        };
        return state.__guidedRemoteCloneResolutions ?? [];
    });
}

/** Reads clone folders opened through the shell boundary. */
async function readOpenedRemoteClonePaths(): Promise<string[]> {
    return electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedOpenedRemoteClonePaths?: string[];
        };
        return state.__guidedOpenedRemoteClonePaths ?? [];
    });
}

/**
 * Publishes one editor installation update to the launcher window.
 *
 * @param progress - Installation state to deliver to the renderer.
 * @returns A promise that ends after the progress event is sent.
 */
async function publishReleaseInstallProgress(
    progress: ReleaseInstallProgress,
): Promise<void> {
    await electronApp.evaluate(
        (
            { BrowserWindow },
            injectedProgress: ReleaseInstallProgress,
        ) => {
            for (const window of BrowserWindow.getAllWindows()) {
                window.webContents.send(
                    'release-install-progress',
                    injectedProgress,
                );
            }
        },
        progress,
    );
}

/**
 * Creates an isolated environment for one Electron E2E app.
 *
 * @param homeDir - Fixture home used for launcher state.
 * @returns Environment variables for the isolated app.
 */
function createIsolatedLaunchEnvironment(
    homeDir: string,
): Record<string, string> {
    const launchEnvironment: Record<string, string> = {
        ...Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
            ),
        ),
        APPDATA: path.join(homeDir, 'AppData', 'Roaming'),
        HOME: homeDir,
        LOCALAPPDATA: path.join(homeDir, 'AppData', 'Local'),
        USERPROFILE: homeDir,
        XDG_CACHE_HOME: path.join(homeDir, '.cache'),
        XDG_CONFIG_HOME: path.join(homeDir, '.config'),
        XDG_DATA_HOME: path.join(homeDir, '.local', 'share'),
        XDG_STATE_HOME: path.join(homeDir, '.local', 'state'),
        GODOT_LAUNCHER_E2E_FIXTURES: '1',
        GODOT_LAUNCHER_E2E_HOME_DIR: homeDir,
    };
    delete launchEnvironment.ELECTRON_RUN_AS_NODE;
    return launchEnvironment;
}
