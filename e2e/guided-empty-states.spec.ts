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
    ReleaseInstallProgress,
    ReleaseSummary,
} from '@shared/contracts';
import {
    createFixtureHome,
    prepareAppWithStubbedData,
    prepareOnboardingScreenshot,
    reloadScreenshotPage,
    stubAppData,
} from './documentationScreenshots/runtime.ts';
import {
    createPreferences,
    SAMPLE_AVAILABLE_PRERELEASES,
    SAMPLE_AVAILABLE_RELEASES,
    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
    SAMPLE_VSCODE_SETTINGS_AVAILABLE,
    SAMPLE_VSCODIUM_SETTINGS_AVAILABLE,
    TOOL_INTEGRATIONS_NO_GIT,
} from './documentationScreenshots/sampleData.ts';
import { getMainWindow } from './splashscreen/getMainWindow.ts';

let electronApp: ElectronApplication;
let mainPage: Page;
let fixtureHome: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    electronApp = await _electron.launch({
        args: ['.'],
        env: createIsolatedLaunchEnvironment(fixtureHome),
    });
    mainPage = await getMainWindow(electronApp);
});

test.afterAll(async () => {
    await electronApp.close();
    await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('Installs empty actions open the editor drawer and both custom editor workflows', async () => {
    await prepareEmptyApp([]);
    await mainPage.getByTestId('btnInstalls').click();

    const primaryAction = mainPage.getByTestId('btnEmptyStatePrimary');
    await primaryAction.focus();
    await primaryAction.click();

    const installDrawer = mainPage.getByRole('dialog', {
        name: 'Install Godot Editor',
    });
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

    await mainPage.getByTestId('btnEmptyStateSecondary').click();
    const customEditorMenu = mainPage.getByRole('dialog', {
        name: 'Custom Editor',
    });
    await expect(customEditorMenu).toBeVisible();
    await customEditorMenu
        .getByTestId('btnEmptyStateCreateCustomEditorManifest')
        .click();

    const customEditorDrawer = mainPage.getByRole('dialog', {
        name: 'Create Custom Editor Manifest',
    });
    await expect(customEditorDrawer).toBeVisible();
    await expect(mainPage).toHaveURL(/#\/installs$/);
    await customEditorDrawer
        .getByRole('button', { name: 'Close drawer' })
        .click();
    await expect(customEditorDrawer).not.toBeVisible();

    await stubOpenFileDialog();
    await mainPage.getByTestId('btnEmptyStateSecondary').click();
    await mainPage
        .getByTestId('btnEmptyStateSelectCustomEditorManifest')
        .click();
    await expect.poll(readOpenFileDialogCallCount).toBe(1);
});

test('Projects empty actions preserve routes, Back behavior, and native import', async () => {
    await prepareEmptyApp([]);
    await stubOpenFileDialog();
    await mainPage.getByTestId('btnProjects').click();

    await mainPage.getByTestId('btnEmptyStateSecondary').click();
    await mainPage.getByTestId('btnAddProjectFromComputer').click();
    await expect.poll(readOpenFileDialogCallCount).toBe(1);

    await mainPage.getByTestId('btnEmptyStatePrimary').click();
    const installDrawer = mainPage.getByRole('dialog', {
        name: 'Install Godot Editor',
    });
    await expect(mainPage).toHaveURL(/#\/installs\/install$/);
    await expect(installDrawer).toBeVisible();

    await mainPage.goBack();
    await expect(mainPage).toHaveURL(/#\/projects$/);
    await expect(installDrawer).not.toBeVisible();
    await expect(
        mainPage.getByText('Install Godot to start a project'),
    ).toBeVisible();

    const installedRelease = SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM[0];
    if (!installedRelease) {
        throw new Error('The guided empty-state release fixture is missing');
    }
    await publishReleaseInstallProgress({
        id: 'guided-empty-state-install',
        version: installedRelease.version,
        mono: installedRelease.mono,
        prerelease: installedRelease.prerelease,
        published_at: installedRelease.published_at,
        stage: 'downloading',
        percent: 55,
        receivedBytes: 55 * 1024 * 1024,
        totalBytes: 100 * 1024 * 1024,
    });

    const installingAction = mainPage.getByTestId('btnEmptyStatePrimary');
    await expect(
        mainPage.getByText(
            'Your editor is installing. You can create a project as soon as it is ready.',
        ),
    ).toBeVisible();
    await expect(installingAction).toHaveText(/Installing editor/);
    await expect(installingAction).toBeDisabled();
    await expect(installingAction).toHaveAttribute('aria-busy', 'true');
    await expect(mainPage.getByTestId('inputProjectSearch')).toHaveCount(0);

    await publishReleaseInstallProgress({
        id: 'guided-empty-state-install',
        version: installedRelease.version,
        mono: installedRelease.mono,
        prerelease: installedRelease.prerelease,
        published_at: installedRelease.published_at,
        stage: 'complete',
        percent: 100,
        release: installedRelease,
    });
    await expect(mainPage.getByText('Start your first project')).toBeVisible();
    await expect(mainPage.getByTestId('btnEmptyStatePrimary')).toBeEnabled();
    await expect(mainPage.getByTestId('inputProjectSearch')).toHaveCount(0);

    await prepareEmptyApp(SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM);
    await stubOpenFileDialog();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnEmptyStateSecondary').click();
    await mainPage.getByTestId('btnAddProjectFromComputer').click();
    await expect.poll(readOpenFileDialogCallCount).toBe(1);

    const newProjectAction = mainPage.getByTestId('btnEmptyStatePrimary');
    await newProjectAction.focus();
    await newProjectAction.click();
    const createDrawer = mainPage.getByRole('dialog', {
        name: 'New Project',
    });
    await expect(mainPage).toHaveURL(/#\/projects\/new$/);
    await expect(createDrawer).toBeVisible();
    await expect(createDrawer.locator(':focus')).toHaveCount(1);

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
    await modal
        .getByTestId('inputPublicGitRepositoryUrl')
        .fill('https://example.com/team/games.git');
    await modal.getByRole('button', { name: 'Continue' }).click();
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
    await modal
        .getByTestId('inputPublicGitRepositoryUrl')
        .fill('https://example.com/team/games.git');
    await modal.getByRole('button', { name: 'Continue' }).click();
    await modal.getByRole('button', { name: 'Clone repository' }).click();

    await expect(
        modal.getByText('This repository uses Git submodules'),
    ).toBeVisible();
    await modal.getByTestId('btnInitialiseSubmodules').click();
    await expect(
        modal.getByText('Initialising addons/gdextension'),
    ).toBeVisible();
    await expect(modal.getByText('Choose projects to add')).toBeVisible();
    await expect(modal.getByText('GDExtension Demo')).toBeVisible();
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
    await mainPage.locator('select').selectOption('de');
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectAdd').click();
    await mainPage.getByTestId('btnAddProjectPublicGit').click();

    const modal = mainPage.getByRole('dialog');
    await modal
        .getByTestId('inputPublicGitRepositoryUrl')
        .fill('https://example.com/team/games.git');
    await modal.locator('button.btn-primary').click();
    await modal.locator('button.btn-primary').click();
    await modal.getByTestId('btnDeletePreservedClone').click();

    try {
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
        await modal.locator('button.btn-primary').last().click();
        await mainPage.getByTestId('btnSettings').click();
        await mainPage.getByTestId('tabAppearance').click();
        await mainPage.locator('select').selectOption('en');
    }
});

test('Remote registration surfaces editor resolution above the import modal', async () => {
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

    const resolutionDialog = mainPage.getByRole('dialog', {
        name: 'Editor version required',
    });
    await expect(resolutionDialog).toBeVisible();
    await resolutionDialog.getByRole('button', { name: 'Cancel' }).click();
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

    const resolutionDialog = mainPage.getByRole('dialog', {
        name: 'Editor version required',
    });
    await resolutionDialog
        .getByRole('button', { name: 'Add With Missing Editor' })
        .click();
    await expect(importModal.getByText('Project import complete')).toBeVisible();
    await expect.poll(readRemoteAddProjectOptions).toEqual([
        { codeEditorId: 'vscodium' },
        { codeEditorId: 'vscodium', resolution: 'add_missing' },
    ]);
});

test('Remote registration shows progress for its missing editor installation', async () => {
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

    const resolutionDialog = mainPage.getByRole('dialog', {
        name: 'Editor version required',
    });
    await resolutionDialog.getByRole('button', { name: 'Options' }).click();
    await resolutionDialog
        .getByRole('button', { name: 'Download 4.4.3-stable' })
        .click();

    const installProgress = importModal.getByTestId(
        'remoteProjectEditorInstallProgress',
    );
    await expect(installProgress).toContainText(
        'Installing Godot 4.4.3-stable Standard',
    );
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
    await expect(installProgress).toContainText('Downloading');
    await expect(installProgress).toContainText('42%');
    await expect(installProgress).toContainText('42 MB / 100 MB');

    await completePendingRemoteEditorInstallation();
    await expect(importModal.getByText('Project import complete')).toBeVisible();
});

test('Remote registration resolves missing editors sequentially for multiple projects', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await stubRemoteProjectDiscovery();
    await requireAllRemoteEditorResolutions();
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

    const firstResolution = mainPage.getByRole('dialog', {
        name: 'Editor version required',
    });
    await firstResolution
        .getByRole('button', { name: 'Add With Missing Editor' })
        .click();
    const secondResolution = mainPage.getByRole('dialog', {
        name: 'Editor version required',
    });
    await expect(secondResolution).toBeVisible();
    await secondResolution
        .getByRole('button', { name: 'Add With Missing Editor' })
        .click();

    await expect(importModal.getByText('Project import complete')).toBeVisible();
    await expect.poll(readRemoteAddedProjectPaths).toEqual([
        '/home/docs/Godot/Projects/games/project.godot',
        '/home/docs/Godot/Projects/games/examples/fixture/project.godot',
    ]);
});

test('Onboarding without an editor finishes inside the install drawer', async () => {
    await prepareOnboardingScreenshot(
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
    await reloadScreenshotPage(mainPage);

    const finishButton = mainPage.getByRole('button', {
        name: 'Finish and install an editor',
    });
    await expect(finishButton).toBeVisible();
    await finishButton.click();

    const installDrawer = mainPage.getByRole('dialog', {
        name: 'Install Godot Editor',
    });
    await expect(mainPage).toHaveURL(/#\/installs\/install$/);
    await expect(installDrawer).toBeVisible();

    await installDrawer.getByTestId('btnCloseInstallEditor').click();
    await expect(mainPage).toHaveURL(/#\/installs$/);
    await expect(installDrawer).not.toBeVisible();
    await expect(
        mainPage.getByText('Install your first Godot editor'),
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
                    return {
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

/** Adds a deterministic public submodule initialisation and activity flow. */
async function stubRemoteProjectSubmodules(): Promise<void> {
    await electronApp.evaluate(({ BrowserWindow, ipcMain }) => {
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
    });
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
    const overrideHomeScript = path.resolve(
        process.cwd(),
        'e2e',
        'support',
        'overrideHome.cjs',
    );
    const existingNodeOptions = process.env.NODE_OPTIONS?.trim();
    const requireOverrideOption = `--require "${overrideHomeScript}"`;
    const launchEnvironment: Record<string, string> = {
        ...Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
            ),
        ),
        APPDATA: path.join(homeDir, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(homeDir, 'AppData', 'Local'),
        GODOT_LAUNCHER_DOCS_SCREENSHOTS: '1',
        GODOT_LAUNCHER_DOCS_HOME_DIR: homeDir,
        NODE_OPTIONS: existingNodeOptions
            ? `${existingNodeOptions} ${requireOverrideOption}`
            : requireOverrideOption,
    };
    delete launchEnvironment.ELECTRON_RUN_AS_NODE;
    return launchEnvironment;
}
