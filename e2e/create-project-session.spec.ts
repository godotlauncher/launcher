import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Page,
    test,
} from '@playwright/test';
import { getMainWindow } from './splashscreen/getMainWindow';
import { SAMPLE_PREFS } from './support/e2e-fixture-data';
import {
    applyTheme,
    createFixtureHome,
    prepareAppWithStubbedData,
    setAppLanguage,
    stubGitIdentitySettings,
} from './support/e2e-fixture-runtime';
import { THEMES } from './support/e2e-fixture-theme';

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
    await prepareAppWithStubbedData(mainPage, electronApp, { projects: [] });
    await stubAvailableDestination();
    const drawer = mainPage.getByRole('dialog', { name: 'New Project' });
    if (await drawer.isVisible().catch(() => false)) {
        await mainPage.getByTestId('btnCloseCreateProject').click();
        await expect(drawer).not.toBeVisible();
    }
});

test.afterAll(async () => {
    await electronApp.close();
    await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('resets form values and restores first focus for every new drawer session', async () => {
    await openCreateProject();
    const projectName = mainPage.getByTestId('inputProjectName');
    const projectPath = mainPage.getByTestId('inputProjectPath');
    const renderer = mainPage.getByTestId('selectCreateProjectRenderer');

    await projectName.fill('Discarded Session');
    await projectPath.fill(
        path.join(SAMPLE_PREFS.projects_location, 'Temporary'),
    );
    await renderer.click();
    await mainPage.getByRole('option', { name: 'Mobile', exact: true }).click();
    await expect(renderer).toHaveText('Mobile');

    await mainPage.getByTestId('btnCloseCreateProject').click();
    await expect(
        mainPage.getByRole('dialog', { name: 'New Project' }),
    ).not.toBeVisible();

    await openCreateProject();
    await expect(projectName).toHaveValue('');
    await expect(projectPath).toHaveValue(SAMPLE_PREFS.projects_location);
    await expect(renderer).toHaveText('Forward Plus');
    await expect(projectName).toBeFocused();
});

test('does not enable Create from an outdated destination result after rapid name edits', async () => {
    await stubOutOfOrderDestinationChecks();
    await openCreateProject();
    const projectName = mainPage.getByTestId('inputProjectName');
    const createButton = mainPage.getByTestId('btnCreateProject');
    const destinationStatus = mainPage.getByTestId(
        'createProjectDestinationStatus',
    );

    await projectName.fill('First Project');
    await expect
        .poll(() => readDestinationCheckNames())
        .toEqual(['First Project']);

    await projectName.fill('Second Project');
    await expect
        .poll(() => readDestinationCheckNames())
        .toEqual(['First Project', 'Second Project']);
    await expect(destinationStatus).toContainText('Destination contains files');
    await expect(createButton).toBeDisabled();

    await releaseFirstDestinationCheck();
    await expect(destinationStatus).toContainText('Destination contains files');
    await expect(createButton).toBeDisabled();
});

test('cancels a preset identity prompt without creating and retains the captured form until confirmation', async () => {
    const projectNameValue = 'Preset Confirmation Project';
    await stubGitIdentitySettings(electronApp, {
        globalIdentity: { name: '', email: '' },
        projectPreset: {
            name: 'Preset User',
            email: 'preset@example.com',
            useForNewRepositories: false,
        },
    });
    await stubRecordedCreateProject();
    await openCreateProject();

    const projectName = mainPage.getByTestId('inputProjectName');
    const projectPath = mainPage.getByTestId('inputProjectPath');
    await projectName.fill(projectNameValue);
    await projectPath.fill(
        path.join(SAMPLE_PREFS.projects_location, 'Presets'),
    );
    await expect(mainPage.getByTestId('btnCreateProject')).toBeEnabled();
    await mainPage.getByTestId('btnCreateProject').click();

    const presetDialog = mainPage.getByRole('dialog', {
        name: 'Use project identity preset?',
    });
    await expect(presetDialog).toBeVisible();
    await mainPage.keyboard.press('Escape');
    await expect(presetDialog).not.toBeVisible();
    await expect(projectName).toHaveValue(projectNameValue);
    await expect(projectPath).toHaveValue(
        path.join(SAMPLE_PREFS.projects_location, 'Presets'),
    );
    await expect(readCreateProjectCalls()).resolves.toHaveLength(0);

    await mainPage.getByTestId('btnCreateProject').click();
    await presetDialog
        .getByRole('button', {
            name: 'Use preset and create project',
            exact: true,
        })
        .click();
    await expect.poll(() => readCreateProjectCalls()).toHaveLength(1);
    await expect
        .poll(async () => {
            const calls = await readCreateProjectCalls();
            return calls[0]?.[6];
        })
        .toEqual({
            initialCommit: 'create',
            identity: {
                name: 'Preset User',
                email: 'preset@example.com',
                scope: 'repository',
            },
        });
});

test('contains the creation form at the minimum viewport in both themes', async () => {
    await electronApp.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find(
            (candidate) => !candidate.isDestroyed(),
        );
        window?.setSize(1024, 600);
    });
    await mainPage.setViewportSize({ width: 1024, height: 600 });
    const outputDirectory = path.resolve(
        process.cwd(),
        '.internal-docs',
        'create-project-drawer-refactor',
    );
    await fs.mkdir(outputDirectory, { recursive: true });

    for (const theme of THEMES) {
        await applyTheme(mainPage, theme);
        await openCreateProject();
        await expect(
            mainPage.getByRole('checkbox', {
                name: 'Initialize Git Repository',
            }),
        ).toBeEnabled();
        const body = mainPage.locator(
            '.drawer-panel form > div.overflow-y-auto',
        );
        await expect
            .poll(() =>
                body.evaluate(
                    (element) =>
                        element.scrollHeight <= element.clientHeight + 1,
                ),
            )
            .toBe(true);
        await expect(mainPage.getByTestId('inputProjectName')).toBeFocused();
        await expect(mainPage.getByTestId('btnCreateProject')).toBeInViewport();
        await expect
            .poll(() =>
                mainPage
                    .locator('.drawer-panel')
                    .evaluate((element) =>
                        Math.round(element.getBoundingClientRect().right),
                    ),
            )
            .toBe(1024);
        await mainPage.screenshot({
            path: path.join(
                outputDirectory,
                `create-project-${theme.name}.png`,
            ),
        });
        await mainPage.getByTestId('btnCloseCreateProject').click();
        await expect(
            mainPage.getByRole('dialog', { name: 'New Project' }),
        ).not.toBeVisible();
    }
});

/** Opens the New Project drawer from the empty Projects view. */
async function openCreateProject(): Promise<void> {
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnWelcomeCreateProject').click();
    await expect(
        mainPage.getByRole('dialog', { name: 'New Project' }),
    ).toBeVisible();
}

/** Provides an immediately available Create Project destination. */
async function stubAvailableDestination(): Promise<void> {
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('projects.inspectCreateProjectDestination');
        ipcMain.handle(
            'projects.inspectCreateProjectDestination',
            async () => ({
                success: true,
                data: { status: 'available' },
            }),
        );
        ipcMain.removeHandler('projects.inspectCreateProjectRepository');
        ipcMain.handle('projects.inspectCreateProjectRepository', async () => ({
            success: true,
            data: { status: 'not-a-repository' },
        }));
    });
}

/** Defers the first destination check and blocks the second one. */
async function stubOutOfOrderDestinationChecks(): Promise<void> {
    await electronApp.evaluate(({ ipcMain }) => {
        const state = globalThis as typeof globalThis & {
            __createProjectSessionDestinationNames?: string[];
            __releaseFirstCreateProjectSessionDestination?: () => void;
        };
        state.__createProjectSessionDestinationNames = [];
        ipcMain.removeHandler('projects.inspectCreateProjectDestination');
        ipcMain.handle(
            'projects.inspectCreateProjectDestination',
            async (_event, projectName: string) => {
                state.__createProjectSessionDestinationNames?.push(projectName);
                if (projectName === 'First Project') {
                    await new Promise<void>((resolve) => {
                        state.__releaseFirstCreateProjectSessionDestination =
                            resolve;
                    });
                    return { success: true, data: { status: 'available' } };
                }
                return {
                    success: true,
                    data: {
                        status: 'blocked',
                        error: 'Destination contains files',
                    },
                };
            },
        );
    });
}

/** Returns destination check names in their main-process invocation order. */
async function readDestinationCheckNames(): Promise<string[]> {
    return await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __createProjectSessionDestinationNames?: string[];
        };
        return state.__createProjectSessionDestinationNames ?? [];
    });
}

/** Releases the first deferred destination inspection. */
async function releaseFirstDestinationCheck(): Promise<void> {
    await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __releaseFirstCreateProjectSessionDestination?: () => void;
        };
        const release = state.__releaseFirstCreateProjectSessionDestination;
        if (!release) {
            throw new Error('The first destination check is not pending.');
        }
        state.__releaseFirstCreateProjectSessionDestination = undefined;
        release();
    });
}

/** Records Create Project calls without creating a filesystem project. */
async function stubRecordedCreateProject(): Promise<void> {
    await electronApp.evaluate(({ ipcMain }) => {
        const state = globalThis as typeof globalThis & {
            __createProjectSessionCreateCalls?: unknown[][];
        };
        state.__createProjectSessionCreateCalls = [];
        ipcMain.removeHandler('projects.createProject');
        ipcMain.handle('projects.createProject', async (_event, ...args) => {
            state.__createProjectSessionCreateCalls?.push(args);
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

/** Returns captured Create Project bridge calls. */
async function readCreateProjectCalls(): Promise<unknown[][]> {
    return await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __createProjectSessionCreateCalls?: unknown[][];
        };
        return state.__createProjectSessionCreateCalls ?? [];
    });
}

/**
 * Creates a process environment isolated to one deterministic Electron fixture home.
 *
 * @param homeDir - Temporary home directory assigned to the Electron process.
 * @returns Environment variables for the Electron launch.
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
