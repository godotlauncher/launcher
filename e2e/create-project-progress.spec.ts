import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Locator,
    type Page,
    test,
} from '@playwright/test';
import type {
    ProjectDetails,
    ReleaseInstallProgress,
    ReleaseSummary,
} from '@shared/contracts';
import {
    createFixtureHome,
    prepareAppWithStubbedData,
    setAppLanguage,
} from './support/e2e-fixture-runtime';
import {
    SAMPLE_PROJECT_PROTOTYPE,
    TOOL_INTEGRATIONS_NO_GIT,
} from './support/e2e-fixture-data';
import { getMainWindow } from './splashscreen/getMainWindow';

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
    await setAppLanguage(mainPage, 'English');
});

test.beforeEach(async () => {
    await prepareAppWithStubbedData(mainPage, electronApp, {
        projects: [],
        installedReleases: [],
        toolIntegrations: TOOL_INTEGRATIONS_NO_GIT,
    });
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('projects.inspectCreateProjectDestination');
        ipcMain.handle('projects.inspectCreateProjectDestination', async () => ({
            success: true, data: { status: 'available' },
        }));
        ipcMain.removeHandler('projects.inspectCreateProjectRepository');
        ipcMain.handle('projects.inspectCreateProjectRepository', async () => ({
            success: true, data: { status: 'not-a-repository' },
        }));
    });
});

test.afterAll(async () => {
    await electronApp.close();
    await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('keeps welcome actions in place when GitHub import becomes available', async () => {
    await mainPage.getByTestId('btnProjects').click();
    const heading = mainPage.getByRole('heading', { name: 'Add or create a project' });
    const createButton = mainPage.getByTestId('btnWelcomeCreateProject');
    await expect(createButton).toBeVisible();
    await expect(mainPage.getByTestId('btnWelcomeAddFromGitHub')).toHaveCount(0);
    const headingBox = await heading.boundingBox();
    const createBox = await createButton.boundingBox();

    await prepareAppWithStubbedData(mainPage, electronApp, {
        projects: [],
        installedReleases: [],
    });
    await mainPage.getByTestId('btnProjects').click();
    await expect(mainPage.getByTestId('btnWelcomeAddFromGitHub')).toBeVisible();
    expect(await heading.boundingBox()).toEqual(headingBox);
    expect(await createButton.boundingBox()).toEqual(createBox);
});

test('blocks an occupied destination before downstream operations and rechecks on submit', async () => {
    await electronApp.evaluate(({ ipcMain }) => {
        const state = globalThis as typeof globalThis & { __destinationChecks?: number; __downstreamCalls?: number };
        state.__destinationChecks = 0;
        state.__downstreamCalls = 0;
        ipcMain.removeHandler('projects.inspectCreateProjectDestination');
        ipcMain.handle('projects.inspectCreateProjectDestination', async (_event, name: string) => {
            state.__destinationChecks = (state.__destinationChecks ?? 0) + 1;
            return { success: true, data: name === 'Occupied' || (state.__destinationChecks ?? 0) >= 3
                ? { status: 'blocked', error: 'Destination contains files' }
                : { status: 'available' } };
        });
        for (const channel of ['projects.inspectCreateProjectRepository', 'editorInstalls.installEditor', 'projects.createProject']) {
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, async () => {
                state.__downstreamCalls = (state.__downstreamCalls ?? 0) + 1;
                throw new Error('Downstream operation must not run');
            });
        }
    });
    await openCreateProject();
    const status = mainPage.getByTestId('createProjectDestinationStatus');
    const idleStatusBox = await status.boundingBox();
    await mainPage.getByTestId('inputProjectName').fill('Occupied');
    await expect(status).toContainText('Destination contains files');
    expect(await status.boundingBox()).toEqual(idleStatusBox);
    await expect(mainPage.getByTestId('btnCreateProject')).toBeDisabled();
    await mainPage.getByTestId('inputProjectName').fill('Free');
    await expect(status).toContainText('Project location available');
    expect(await status.boundingBox()).toEqual(idleStatusBox);
    await mainPage.getByTestId('btnCreateProject').click();
    await expect(status).toContainText('Destination contains files');
    await expect(mainPage.getByTestId('btnCreateProject')).toBeDisabled();
    expect(await electronApp.evaluate(() => (globalThis as typeof globalThis & { __downstreamCalls?: number }).__downstreamCalls)).toBe(0);
    await mainPage.getByTestId('btnCloseCreateProject').click();
});

test('locks the drawer while installing, creating, and launching', async () => {
    await stubPendingCreateProjectWorkflow();
    await openCreateProject();
    await selectCatalogueEditor('4.7.1-stable');

    const location = mainPage.getByTestId('inputProjectPath');
    await expect(location).toBeEnabled();
    await expect(mainPage.getByTestId('btnSelectProjectFolder')).toBeVisible();
    await expect(
        mainPage.getByTestId('checkboxOverwriteProjectPath'),
    ).toHaveCount(0);
    await location.fill('/Users/docs/Godot/Custom');
    await mainPage.getByTestId('inputProjectName').fill('Progress Project');
    await mainPage.getByTestId('btnCreateProject').click();

    const overlay = mainPage.getByTestId('createProjectProgressOverlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.locator('[data-step="installing"]')).toHaveAttribute(
        'data-step-state',
        'active',
    );
    await expect(mainPage.getByTestId('btnCloseCreateProject')).toBeDisabled();
    const installDetails = mainPage.getByTestId('createProjectInstallDetails');
    const initialDetailsBox = await installDetails.boundingBox();
    const initialCreateStepBox = await overlay.locator('[data-step="creating"]').boundingBox();

    await publishInstallProgress({
        id: 'create-project-editor-install',
        version: '4.7.1-stable',
        mono: false,
        prerelease: false,
        published_at: '2026-01-01T00:00:00.000Z',
        stage: 'downloading',
        canCancel: false,
        percent: 42,
        receivedBytes: 42 * 1024 * 1024,
        totalBytes: 100 * 1024 * 1024,
    });
    await expect(overlay).toContainText('42%');
    await expect(overlay).toContainText('42 MB / 100 MB');
    expect(await installDetails.boundingBox()).toEqual(initialDetailsBox);
    expect(await overlay.locator('[data-step="creating"]').boundingBox()).toEqual(initialCreateStepBox);

    await completePendingEditorInstall();
    await expect(overlay.locator('[data-step="creating"]')).toHaveAttribute(
        'data-step-state',
        'active',
    );
    await expect(installDetails).toContainText('100%');
    expect(await installDetails.boundingBox()).toEqual(initialDetailsBox);
    expect(await overlay.locator('[data-step="creating"]').boundingBox()).toEqual(initialCreateStepBox);
    await expect
        .poll(async () =>
            (await readSubmittedProjectPath())?.replaceAll('\\', '/'),
        )
        .toBe('/Users/docs/Godot/Custom/Progress-Project');

    await completePendingProjectCreation();
    await expect(overlay.locator('[data-step="launching"]')).toHaveAttribute(
        'data-step-state',
        'active',
    );
    await completePendingProjectLaunch();
    await expect(mainPage.getByRole('dialog', { name: 'New Project' })).not.toBeVisible();
});

test('shows an alert after failure and returns to the preserved form', async () => {
    await stubFailedEditorInstall();
    await openCreateProject();
    await selectCatalogueEditor('4.7.1-stable');
    const projectName = mainPage.getByTestId('inputProjectName');
    await projectName.fill('Retry Project');
    await mainPage.getByTestId('btnCreateProject').click();

    await expectWorkflowFailure(
        projectName,
        'Retry Project',
        'Simulated editor install failure',
    );
});

test('returns to the preserved form when project creation fails', async () => {
    await stubFailedProjectCreation();
    await openCreateProject();
    await selectCatalogueEditor('4.7.1-stable');
    const projectName = mainPage.getByTestId('inputProjectName');
    await projectName.fill('Creation Retry Project');
    await mainPage.getByTestId('btnCreateProject').click();

    await expectWorkflowFailure(
        projectName,
        'Creation Retry Project',
        'Simulated project creation failure',
    );
});

test('returns to the preserved form when editor launch fails', async () => {
    await stubFailedProjectLaunch();
    await openCreateProject();
    await selectCatalogueEditor('4.7.1-stable');
    const projectName = mainPage.getByTestId('inputProjectName');
    await projectName.fill('Launch Retry Project');
    await mainPage.getByTestId('btnCreateProject').click();

    await expectWorkflowFailure(
        projectName,
        'Launch Retry Project',
        'Simulated project launch failure',
    );
});

/** Opens Create Project from the deterministic empty Projects welcome. */
async function openCreateProject(): Promise<void> {
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnWelcomeCreateProject').click();
    await expect(mainPage.getByRole('dialog', { name: 'New Project' })).toBeVisible();
}

/**
 * Selects the Standard build of one catalogue editor.
 *
 * @param version - Exact catalogue version to select.
 */
async function selectCatalogueEditor(version: string): Promise<void> {
    await mainPage.getByTestId('selectCreateProjectGodotEditor').click();
    const option = mainPage.getByTestId(
        `createProjectCatalogueEditor_catalogue:${version}:std`,
    );
    await expect(option).toBeVisible();
    await option.click();
}

/**
 * Confirms a workflow error uses the alert and restores the retained form.
 *
 * @param projectName - Project name field retained by the drawer.
 * @param expectedName - Expected retained field value.
 * @param expectedMessage - Expected alert error text.
 */
async function expectWorkflowFailure(
    projectName: Locator,
    expectedName: string,
    expectedMessage: string,
): Promise<void> {
    const alert = mainPage.getByRole('dialog', { name: 'Error' });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(expectedMessage);
    await expect(
        mainPage.getByTestId('createProjectProgressOverlay'),
    ).toHaveCount(0);
    await alert.getByTestId('btnAlertOk').click();

    await expect(mainPage.getByRole('dialog', { name: 'New Project' })).toBeVisible();
    await expect(projectName).toHaveValue(expectedName);
    const closeButton = mainPage.getByTestId('btnCloseCreateProject');
    await expect(closeButton).toBeEnabled();
    await closeButton.click();
    await expect(mainPage.getByRole('dialog', { name: 'New Project' })).not.toBeVisible();
}

/** Holds each workflow operation until its active progress step is asserted. */
async function stubPendingCreateProjectWorkflow(): Promise<void> {
    await electronApp.evaluate(
        ({ ipcMain }, project: ProjectDetails) => {
            const state = globalThis as typeof globalThis & {
                __completeCreateProjectEditorInstall?: () => void;
                __completeCreateProjectCreation?: () => void;
                __completeCreateProjectLaunch?: () => void;
                __submittedCreateProjectPath?: string;
            };
            ipcMain.removeHandler('editorInstalls.installEditor');
            ipcMain.handle(
                'editorInstalls.installEditor',
                async (_event, release: ReleaseSummary, mono: boolean) =>
                    await new Promise((resolve) => {
                        state.__completeCreateProjectEditorInstall = () =>
                            resolve({
                                success: true,
                                data: {
                                    success: true,
                                    version: release.version,
                                    release: {
                                        version: release.version,
                                        version_number: release.version_number,
                                        install_path:
                                            '/Users/docs/Godot/Editors/4.8',
                                        editor_path:
                                            '/Users/docs/Godot/Editors/4.8/Godot.app',
                                        platform: 'darwin',
                                        arch: 'arm64',
                                        mono,
                                        prerelease: false,
                                        config_version: 5,
                                        published_at: release.published_at,
                                        valid: true,
                                    },
                                },
                            });
                    }),
            );
            ipcMain.removeHandler('projects.createProject');
            ipcMain.handle(
                'projects.createProject',
                async (_event, ...args: unknown[]) =>
                    await new Promise((resolve) => {
                        state.__submittedCreateProjectPath = args[5] as string;
                        state.__completeCreateProjectCreation = () =>
                            resolve({
                                success: true,
                                data: { success: true, projectDetails: project },
                            });
                    }),
            );
            ipcMain.removeHandler('projects.launchProject');
            ipcMain.handle(
                'projects.launchProject',
                async () =>
                    await new Promise((resolve) => {
                        state.__completeCreateProjectLaunch = () =>
                            resolve({
                                success: true,
                                data: { launched: true, project },
                            });
                    }),
            );
        },
        SAMPLE_PROJECT_PROTOTYPE,
    );
}

/** Makes the selected editor installation fail deterministically. */
async function stubFailedEditorInstall(): Promise<void> {
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('editorInstalls.installEditor');
        ipcMain.handle('editorInstalls.installEditor', async () => ({
            success: true,
            data: {
                success: false,
                version: '4.7.1-stable',
                error: 'Simulated editor install failure',
            },
        }));
    });
}

/** Makes project creation fail after a successful editor installation. */
async function stubFailedProjectCreation(): Promise<void> {
    await stubImmediateEditorInstall();
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('projects.createProject');
        ipcMain.handle('projects.createProject', async () => ({
            success: true,
            data: {
                success: false,
                error: 'Simulated project creation failure',
            },
        }));
    });
}

/** Makes editor launch fail after successful installation and creation. */
async function stubFailedProjectLaunch(): Promise<void> {
    await stubImmediateEditorInstall();
    await electronApp.evaluate(
        ({ ipcMain }, project: ProjectDetails) => {
            ipcMain.removeHandler('projects.createProject');
            ipcMain.handle('projects.createProject', async () => ({
                success: true,
                data: { success: true, projectDetails: project },
            }));
            ipcMain.removeHandler('projects.launchProject');
            ipcMain.handle('projects.launchProject', async () => {
                throw new Error('Simulated project launch failure');
            });
        },
        SAMPLE_PROJECT_PROTOTYPE,
    );
}

/** Completes editor installation immediately for later-step failure tests. */
async function stubImmediateEditorInstall(): Promise<void> {
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('editorInstalls.installEditor');
        ipcMain.handle(
            'editorInstalls.installEditor',
            async (_event, release: ReleaseSummary, mono: boolean) => ({
                success: true,
                data: {
                    success: true,
                    version: release.version,
                    release: {
                        version: release.version,
                        version_number: release.version_number,
                        install_path: '/Users/docs/Godot/Editors/4.7.1',
                        editor_path:
                            '/Users/docs/Godot/Editors/4.7.1/Godot.app',
                        platform: 'darwin',
                        arch: 'arm64',
                        mono,
                        prerelease: false,
                        config_version: 5,
                        published_at: release.published_at,
                        valid: true,
                    },
                },
            }),
        );
    });
}

/** Completes the deferred editor installation. */
async function completePendingEditorInstall(): Promise<void> {
    await completePending('__completeCreateProjectEditorInstall');
}

/** Completes the deferred project creation. */
async function completePendingProjectCreation(): Promise<void> {
    await completePending('__completeCreateProjectCreation');
}

/** Completes the deferred project launch. */
async function completePendingProjectLaunch(): Promise<void> {
    await completePending('__completeCreateProjectLaunch');
}

/**
 * Completes one deferred main-process operation.
 *
 * @param key - State callback to invoke.
 */
async function completePending(
    key:
        | '__completeCreateProjectEditorInstall'
        | '__completeCreateProjectCreation'
        | '__completeCreateProjectLaunch',
): Promise<void> {
    await electronApp.evaluate((_electron, callbackKey) => {
        const state = globalThis as Record<string, unknown>;
        const complete = state[callbackKey];
        if (typeof complete !== 'function') {
            throw new Error(`No pending Create Project operation: ${callbackKey}`);
        }
        state[callbackKey] = undefined;
        complete();
    }, key);
}

/** Publishes exact editor installation progress to the renderer. */
async function publishInstallProgress(
    progress: ReleaseInstallProgress,
): Promise<void> {
    await electronApp.evaluate(({ BrowserWindow }, payload) => {
        for (const window of BrowserWindow.getAllWindows()) {
            window.webContents.send('release-install-progress', payload);
        }
    }, progress);
}

/** Reads the final path supplied to the main Create Project operation. */
async function readSubmittedProjectPath(): Promise<string | undefined> {
    return await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __submittedCreateProjectPath?: string;
        };
        return state.__submittedCreateProjectPath;
    });
}

/**
 * Creates an isolated Electron environment for the E2E fixture home.
 *
 * @param homeDir - Temporary home directory for the test app.
 * @returns Environment variables for the isolated Electron process.
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
    const environment: Record<string, string> = {
        ...Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
            ),
        ),
        APPDATA: path.join(homeDir, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(homeDir, 'AppData', 'Local'),
        GODOT_LAUNCHER_E2E_FIXTURES: '1',
        GODOT_LAUNCHER_E2E_HOME_DIR: homeDir,
        NODE_OPTIONS: existingNodeOptions
            ? `${existingNodeOptions} ${requireOverrideOption}`
            : requireOverrideOption,
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    return environment;
}
