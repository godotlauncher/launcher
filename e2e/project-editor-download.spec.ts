import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Page,
    test,
} from '@playwright/test';
import type { InstalledRelease, ProjectDetails, ReleaseSummary } from '@shared/contracts';
import {
    createFixtureHome,
    prepareAppWithStubbedData,
    setAppLanguage,
} from './support/e2e-fixture-runtime';
import { getMainWindow } from './splashscreen/getMainWindow';

let electronApp: ElectronApplication;
let mainPage: Page;
let fixtureHome: string;

const release: ReleaseSummary = {
    version: '4.5.1-stable',
    version_number: 4.5,
    name: '4.5.1-stable',
    published_at: '2025-08-18T17:04:20Z',
    draft: false,
    prerelease: false,
    assets: [
        {
            name: 'Godot_v4.5.1-stable_macos.universal.zip',
            download_url: 'https://example.invalid/Godot_v4.5.1-stable.zip',
            platform_tags: ['darwin', 'universal'],
            mono: false,
        },
    ],
};

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

test('installs one exact missing editor for shared projects without launching them', async () => {
    const missingProjects = [
        createMissingProject('Archive Prototype', '/projects/archive-prototype'),
        createMissingProject('Archive Sample', '/projects/archive-sample'),
    ];
    await prepareAppWithStubbedData(mainPage, electronApp, {
        projects: missingProjects,
        installedReleases: [],
        availableReleases: [release],
        availablePrereleases: [],
    });
    await stubProjectEditorDownload(missingProjects);
    await mainPage.getByTestId('btnProjects').click();

    const cards = mainPage.locator('[data-project-path]');
    const installButtons = mainPage.getByTestId(
        'btnInstallRequiredProjectEditor',
    );
    await expect(installButtons).toHaveCount(2);
    await expect(installButtons.first()).toHaveAccessibleName(
        'Install required editor',
    );
    await installButtons.first().click();

    await expect.poll(readInstallCalls).toEqual([
        { version: '4.5.1-stable', mono: false },
    ]);
    await expect(installButtons).toHaveCount(2);
    for (const installButton of await installButtons.all()) {
        await expect(installButton).toBeDisabled();
    }
    await expect(cards.filter({ hasText: 'Archive Prototype' })).toContainText(
        '4.5.1-stable',
    );
    await mainPage.screenshot({
        path: path.resolve(
            '.internal-docs/project-editor-download/missing-editor-installing.png',
        ),
    });

    await completeProjectEditorDownload();

    await expect.poll(readAssignedProjects).toEqual(
        missingProjects.map((project) => project.path),
    );
    await expect(installButtons).toHaveCount(0);
    const launchButtons = mainPage.getByTestId('btnEditProjectInGodot');
    await expect(launchButtons).toHaveCount(2);
    for (const launchButton of await launchButtons.all()) {
        await expect(launchButton).toBeEnabled();
    }
    await expect(readLaunchCalls()).resolves.toBe(0);
});

/**
 * Creates one project that requires the test release before it can launch.
 *
 * @param name - Project display name.
 * @param projectPath - Absolute project folder path.
 * @returns A missing-editor project fixture.
 */
function createMissingProject(name: string, projectPath: string): ProjectDetails {
    return {
        name,
        version: release.version,
        version_number: release.version_number,
        renderer: 'FORWARD_PLUS',
        path: projectPath,
        editor_settings_path: '',
        editor_settings_file: '',
        last_opened: null,
        release: {
            version: release.version,
            version_number: release.version_number,
            install_path: '',
            editor_path: '',
            platform: 'darwin',
            arch: 'universal',
            mono: false,
            prerelease: false,
            config_version: 5,
            published_at: release.published_at,
            valid: false,
            source: 'official',
        },
        launch_path: '',
        config_version: 5,
        codeEditorId: null,
        withGit: false,
        valid: false,
        invalid_reason: 'missing_editor',
    };
}

/**
 * Replaces editor installation, project repair, and launch handlers with one
 * stateful exact-release workflow.
 *
 * @param initialProjects - Missing projects whose editor will be repaired.
 * @returns A promise that ends after the IPC handlers are ready.
 */
async function stubProjectEditorDownload(
    initialProjects: ProjectDetails[],
): Promise<void> {
    await electronApp.evaluate(
        ({ ipcMain, BrowserWindow }, projects: ProjectDetails[]) => {
            const state = globalThis as typeof globalThis & {
                __projectEditorDownloadComplete?: () => void;
                __projectEditorDownloadInstalls?: Array<{
                    version: string;
                    mono: boolean;
                }>;
                __projectEditorDownloadAssignments?: string[];
                __projectEditorDownloadLaunches?: number;
                __projectEditorDownloadProjects?: ProjectDetails[];
                __projectEditorDownloadInstalledReleases?: InstalledRelease[];
            };
            state.__projectEditorDownloadInstalls = [];
            state.__projectEditorDownloadAssignments = [];
            state.__projectEditorDownloadLaunches = 0;
            state.__projectEditorDownloadProjects = projects;
            state.__projectEditorDownloadInstalledReleases = [];

            const installedRelease = (release: ReleaseSummary, mono: boolean) =>
                ({
                    version: release.version,
                    version_number: release.version_number,
                    install_path: `/editors/${release.version}`,
                    editor_path: `/editors/${release.version}/Godot`,
                    platform: 'darwin',
                    arch: 'universal',
                    mono,
                    prerelease: release.prerelease,
                    config_version: 5,
                    published_at: release.published_at,
                    valid: true,
                }) satisfies InstalledRelease;

            ipcMain.removeHandler('editorInstalls.installEditor');
            ipcMain.handle(
                'editorInstalls.installEditor',
                async (_event, requestedRelease: ReleaseSummary, mono: boolean) =>
                    await new Promise((resolve) => {
                        state.__projectEditorDownloadInstalls?.push({
                            version: requestedRelease.version,
                            mono,
                        });
                        state.__projectEditorDownloadComplete = () => {
                            const installed = installedRelease(
                                requestedRelease,
                                mono,
                            );
                            state.__projectEditorDownloadInstalledReleases = [
                                installed,
                            ];
                            for (const window of BrowserWindow.getAllWindows()) {
                                const webContents = window.webContents as typeof window.webContents & {
                                    __e2eFixtureInstalledReleases?: InstalledRelease[];
                                };
                                webContents.__e2eFixtureInstalledReleases = [
                                    installed,
                                ];
                                webContents.send('releases-updated', [installed]);
                            }
                            resolve({
                                success: true,
                                data: {
                                    success: true,
                                    version: requestedRelease.version,
                                    release: installed,
                                },
                            });
                        };
                    }),
            );

            ipcMain.removeHandler('editorInstalls.getInstalledEditors');
            ipcMain.handle('editorInstalls.getInstalledEditors', async () => ({
                success: true,
                data: state.__projectEditorDownloadInstalledReleases ?? [],
            }));

            ipcMain.removeHandler('projects.setProjectEditor');
            ipcMain.handle(
                'projects.setProjectEditor',
                async (
                    _event,
                    project: ProjectDetails,
                    assignedRelease: InstalledRelease,
                ) => {
                    state.__projectEditorDownloadAssignments?.push(project.path);
                    state.__projectEditorDownloadProjects =
                        state.__projectEditorDownloadProjects?.map(
                            (candidate) =>
                                candidate.path === project.path
                                    ? {
                                          ...candidate,
                                          version: assignedRelease.version,
                                          version_number:
                                              assignedRelease.version_number,
                                          release: assignedRelease,
                                          launch_path:
                                              assignedRelease.editor_path,
                                          valid: true,
                                          invalid_reason: undefined,
                                      }
                                    : candidate,
                        );
                    return {
                        success: true,
                        data: {
                            success: true,
                            projects:
                                state.__projectEditorDownloadProjects ?? [],
                        },
                    };
                },
            );

            ipcMain.removeHandler('projects.launchProject');
            ipcMain.handle('projects.launchProject', async () => {
                state.__projectEditorDownloadLaunches =
                    (state.__projectEditorDownloadLaunches ?? 0) + 1;
                return { success: true, data: { launched: true } };
            });
        },
        initialProjects,
    );
}

/** Completes the currently pending editor install. */
async function completeProjectEditorDownload(): Promise<void> {
    await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __projectEditorDownloadComplete?: () => void;
        };
        const complete = state.__projectEditorDownloadComplete;
        if (!complete) {
            throw new Error('No project editor installation is pending.');
        }
        state.__projectEditorDownloadComplete = undefined;
        complete();
    });
}

/** Reads editor-install calls recorded by the isolated Electron main process. */
async function readInstallCalls(): Promise<
    Array<{ version: string; mono: boolean }>
> {
    return electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __projectEditorDownloadInstalls?: Array<{
                version: string;
                mono: boolean;
            }>;
        };
        return state.__projectEditorDownloadInstalls ?? [];
    });
}

/** Reads project paths repaired by the isolated Electron main process. */
async function readAssignedProjects(): Promise<string[]> {
    return electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __projectEditorDownloadAssignments?: string[];
        };
        return state.__projectEditorDownloadAssignments ?? [];
    });
}

/** Reads launch attempts recorded by the isolated Electron main process. */
async function readLaunchCalls(): Promise<number> {
    return electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __projectEditorDownloadLaunches?: number;
        };
        return state.__projectEditorDownloadLaunches ?? 0;
    });
}

/**
 * Creates an isolated environment for one Electron E2E app.
 *
 * @param homeDir - Fixture home used for launcher state.
 * @returns Environment variables for the fixture Electron process.
 */
function createIsolatedLaunchEnvironment(
    homeDir: string,
): Record<string, string> {
    const environment: Record<string, string> = {
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
    delete environment.ELECTRON_RUN_AS_NODE;
    return environment;
}
