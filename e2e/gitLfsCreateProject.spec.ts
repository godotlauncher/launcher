import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Page,
    test,
} from '@playwright/test';
import {
    createFixtureHome,
    prepareAppWithStubbedData,
    setAppLanguage,
    stubGlobalGitIdentity,
} from './support/e2e-fixture-runtime';
import { TOOL_INTEGRATIONS_NO_GIT_LFS } from './support/e2e-fixture-data';
import { getMainWindow } from './splashscreen/getMainWindow';

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

test.beforeEach(async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    const closeButton = mainPage.getByTestId('btnCloseCreateProject');
    if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
    }
});

test.afterAll(async () => {
    await electronApp.close();
    await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('Git LFS help is keyboard accessible and depends on Git', async () => {
    await openCreateProject();

    const git = mainPage.getByRole('checkbox', {
        name: 'Initialize Git Repository',
    });
    const gitLfs = mainPage.getByRole('checkbox', { name: 'Use Git LFS' });
    const help = mainPage.getByRole('button', {
        name: 'Tracked file types',
    });

    await expect(git).toBeChecked();
    await expect(gitLfs).toBeEnabled();
    await expect(gitLfs).not.toBeChecked();

    await gitLfs.focus();
    await mainPage.keyboard.press('Tab');
    await expect(help).toBeFocused();
    const tooltip = mainPage.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('3D models');
    await expect(tooltip).toContainText('*.fbx *.gltf *.glb');
    await mainPage.keyboard.press('Escape');
    await expect(tooltip).not.toBeVisible();
    await expect(mainPage.getByTestId('btnCloseCreateProject')).not.toBeVisible();

    await openCreateProject();
    await git.uncheck();
    await expect(gitLfs).not.toBeVisible();
});

test('Missing Git LFS stays disabled with setup guidance', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp, {
        toolIntegrations: TOOL_INTEGRATIONS_NO_GIT_LFS,
    });
    await openCreateProject();

    await expect(
        mainPage.getByRole('checkbox', { name: 'Use Git LFS' }),
    ).toBeDisabled();
    await expect(
        mainPage.getByText('Unavailable', { exact: true }),
    ).toBeVisible();
    const unavailableHelp = mainPage.getByRole('button', {
        name: 'Git LFS is not installed on this computer',
    });
    await unavailableHelp.hover();
    await expect(mainPage.getByRole('tooltip')).toHaveText(
        'Git LFS is not installed on this computer',
    );
});

test('Create Project submits only the main-owned Git LFS policy ID', async () => {
    await stubGlobalGitIdentity(electronApp, {
        name: 'John Doe',
        email: 'john.doe@example.com',
    });
    await stubRecordedCreateProject(electronApp);
    await openCreateProject();

    await mainPage
        .getByTestId('inputProjectName')
        .fill('Git LFS E2E Project');
    await mainPage
        .getByRole('checkbox', { name: 'Use Git LFS' })
        .check();
    await mainPage.getByTestId('btnCreateProject').click();

    await expect
        .poll(async () => await readCreateProjectCalls(electronApp))
        .toHaveLength(1);
    const [request] = await readCreateProjectCalls(electronApp);
    expect(request[6]).toEqual({
        initialCommit: 'create',
        gitLfs: { trackingPolicy: 'godot-documentation-defaults' },
    });
    expect(JSON.stringify(request[6])).not.toContain('*.');
});

/** Opens the deterministic Create Project drawer. */
async function openCreateProject(): Promise<void> {
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectCreate').click();
    await expect(
        mainPage.getByRole('checkbox', { name: 'Initialize Git Repository' }),
    ).toBeVisible();
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

/**
 * Replaces Create Project with a recorder that performs no filesystem work.
 *
 * @param app - Electron app whose Create Project handler should be replaced.
 */
async function stubRecordedCreateProject(
    app: ElectronApplication,
): Promise<void> {
    await app.evaluate(({ ipcMain }) => {
        const state = globalThis as typeof globalThis & {
            __gitLfsCreateProjectCalls?: unknown[][];
        };
        state.__gitLfsCreateProjectCalls = [];
        ipcMain.removeHandler('projects.createProject');
        ipcMain.handle('projects.createProject', async (_event, ...args) => {
            state.__gitLfsCreateProjectCalls?.push(args);
            return {
                success: true,
                data: {
                    success: false,
                    error: 'Captured Create Project request.',
                },
            };
        });
    });
}

/**
 * Reads recorded Create Project bridge arguments.
 *
 * @param app - Electron app that owns the recorder.
 * @returns Recorded argument arrays in call order.
 */
async function readCreateProjectCalls(
    app: ElectronApplication,
): Promise<unknown[][]> {
    return await app.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __gitLfsCreateProjectCalls?: unknown[][];
        };
        return state.__gitLfsCreateProjectCalls ?? [];
    });
}
