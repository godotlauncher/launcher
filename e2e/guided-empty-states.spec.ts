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

test('GitHub repositories use the same multi-project review', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
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
    await expect(modal.getByRole('checkbox')).toHaveCount(3);
    await modal.getByTestId('btnAddDiscoveredProjects').click();
    await expect(modal.getByText('Project import complete')).toBeVisible();
    await expect(modal.getByText(/Failed: Duplicate root project/)).toBeVisible();
    await expect.poll(readRemoteAddedProjectPaths).toEqual([
        '/home/docs/Godot/Projects/games/examples/fixture/project.godot',
    ]);
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
            __guidedFailRootRemoteProject?: boolean;
            __guidedRequireNestedRemoteEditor?: boolean;
        };
        state.__guidedRemoteAddedProjectPaths = [];
        state.__guidedFailRootRemoteProject = false;
        state.__guidedRequireNestedRemoteEditor = false;

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
                projects: [
                    {
                        name: 'Root Game',
                        relativePath: '.',
                        projectFilePath:
                            '/home/docs/Godot/Projects/games/project.godot',
                    },
                    {
                        name: 'Example Fixture',
                        relativePath: 'examples/fixture',
                        projectFilePath:
                            '/home/docs/Godot/Projects/games/examples/fixture/project.godot',
                    },
                ],
            },
        }));
        ipcMain.removeHandler('projects.addProject');
        ipcMain.handle(
            'projects.addProject',
            async (_event, projectFilePath: string) => {
                if (
                    state.__guidedFailRootRemoteProject &&
                    projectFilePath ===
                        '/home/docs/Godot/Projects/games/project.godot'
                ) {
                    return {
                        success: true,
                        data: {
                            success: false,
                            error: 'Duplicate root project',
                        },
                    };
                }
                if (
                    state.__guidedRequireNestedRemoteEditor &&
                    projectFilePath ===
                        '/home/docs/Godot/Projects/games/examples/fixture/project.godot'
                ) {
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
                return { success: true, data: { success: true } };
            },
        );
    });
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

/** Makes the root discovery fail registration for continuation coverage. */
async function failRootRemoteProjectRegistration(): Promise<void> {
    await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __guidedFailRootRemoteProject?: boolean;
        };
        state.__guidedFailRootRemoteProject = true;
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
