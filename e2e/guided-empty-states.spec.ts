import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Page,
    test,
} from '@playwright/test';
import type { ReleaseInstallProgress } from '@shared/contracts';
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
