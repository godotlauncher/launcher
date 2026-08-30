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
    stubGlobalGitIdentity,
} from './documentationScreenshots/runtime';
import { TOOL_INTEGRATIONS_NO_GIT_LFS } from './documentationScreenshots/sampleData';
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

    await help.focus();
    const tooltip = mainPage.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('3D models');
    await expect(tooltip).toContainText('*.fbx *.gltf *.glb');
    await mainPage.keyboard.press('Escape');
    await expect(tooltip).not.toBeVisible();

    await mainPage
        .getByText('Initialize Git Repository', { exact: true })
        .click();
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
        GODOT_LAUNCHER_DOCS_SCREENSHOTS: '1',
        GODOT_LAUNCHER_DOCS_HOME_DIR: homeDir,
        NODE_OPTIONS: existingNodeOptions
            ? `${existingNodeOptions} ${requireOverrideOption}`
            : requireOverrideOption,
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
