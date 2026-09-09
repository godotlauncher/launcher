import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Page,
    test,
} from '@playwright/test';
import type { ReleaseSummary } from '@shared/contracts';
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
        args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`],
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

test('resets form values and focuses the drawer title for every new session', async () => {
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
    await expect(
        mainPage.getByRole('heading', { name: 'New Project', exact: true }),
    ).toBeFocused();
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

test('groups both catalogue channels and preserves exact keyboard selection after filtering', async () => {
    test.setTimeout(60000);
    await prepareAppWithStubbedData(mainPage, electronApp, {
        projects: [],
        installedReleases: [],
        availableReleases: [
            groupedCatalogueRelease('4.9.1-stable'),
            groupedCatalogueRelease('4.10.2-stable'),
            groupedCatalogueRelease('4.10-stable'),
        ],
        availablePrereleases: [
            groupedCatalogueRelease('4.10-rc1', true),
            groupedCatalogueRelease('4.11-dev2', true),
        ],
    });
    await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()
            .find((window) => !window.isDestroyed())
            ?.setSize(1024, 600);
    });
    await mainPage.setViewportSize({ width: 1024, height: 600 });
    const outputDirectory = path.resolve(
        process.cwd(),
        '.internal-docs',
        'create-project-catalogue-groups',
    );
    await fs.mkdir(outputDirectory, { recursive: true });

    for (const theme of THEMES) {
        await applyTheme(mainPage, theme);
        await openCreateProject();
        const trigger = mainPage.getByTestId('selectCreateProjectGodotEditor');
        await trigger.click();
        const popover = mainPage.getByTestId(
            'createProjectEditorPickerPopover',
        );
        const list = popover.getByTestId('createProjectEditorCatalogueList');
        const search = popover.getByTestId('inputCreateProjectEditorSearch');
        await expect(search).toBeFocused();
        await expect(list.getByRole('group')).toHaveCount(2);
        expect(
            await list
                .getByRole('group')
                .evaluateAll((groups) =>
                    groups.map((group) => group.getAttribute('aria-label')),
                ),
        ).toEqual(['4.10', '4.9']);
        await expect(
            list
                .getByRole('group', { name: '4.10', exact: true })
                .getByRole('option'),
        ).toHaveCount(4);
        await expect(list.getByRole('option')).toHaveCount(6);
        await expect(popover).toBeInViewport({ ratio: 1 });
        await mainPage.screenshot({
            path: path.join(outputDirectory, `stable-${theme.name}.png`),
        });

        await search.fill('4.9.1');
        await expect(list.getByRole('group')).toHaveCount(1);
        await expect(
            list
                .getByRole('group', { name: '4.9', exact: true })
                .getByRole('option'),
        ).toHaveCount(2);
        await search.fill('no matching version');
        await expect(list.getByRole('group')).toHaveCount(0);
        await expect(list).toContainText('No matching releases');
        await search.fill('');
        const dotnet = list.getByTestId(
            'createProjectCatalogueEditor_catalogue:4.10.2-stable:mono',
        );
        await dotnet.focus();
        await dotnet.press('Enter');
        await expect(popover).not.toBeVisible();
        await expect(trigger).toBeFocused();
        await expect(trigger).toHaveText(
            'Godot 4.10.2-stable (4.10.2-stable) - .NET',
        );

        await trigger.click();
        await popover.getByTestId('tabCreateProjectPrereleaseEditors').click();
        await expect(list.getByRole('group')).toHaveCount(2);
        expect(
            await list
                .getByRole('group')
                .evaluateAll((groups) =>
                    groups.map((group) => group.getAttribute('aria-label')),
                ),
        ).toEqual(['4.11', '4.10']);
        await expect(list.getByRole('option')).toHaveCount(4);
        await expect(popover).toBeInViewport({ ratio: 1 });
        await mainPage.screenshot({
            path: path.join(outputDirectory, `prerelease-${theme.name}.png`),
        });
        await search.fill('4.10-rc1');
        await expect(list.getByRole('group')).toHaveCount(1);
        await expect(
            list
                .getByRole('group', { name: '4.10', exact: true })
                .getByRole('option'),
        ).toHaveCount(2);
        await search.fill('');
        await popover.getByTestId('tabCreateProjectStableEditors').click();
        await expect(dotnet).toHaveAttribute('aria-selected', 'true');
        await popover.getByTestId('tabCreateProjectPrereleaseEditors').click();
        const prerelease = list.getByTestId(
            'createProjectCatalogueEditor_catalogue:4.11-dev2:std',
        );
        await prerelease.focus();
        await prerelease.press('Space');
        await expect(popover).not.toBeVisible();
        await expect(trigger).toBeFocused();
        await expect(trigger).toHaveText(
            'Godot 4.11-dev2 (4.11-dev2) - Standard',
        );
        await mainPage.getByTestId('btnCloseCreateProject').click();
        await expect(
            mainPage.getByRole('dialog', { name: 'New Project' }),
        ).not.toBeVisible();
    }
});

/**
 * Creates exact Standard and .NET catalogue variants without downloading assets.
 * @param version - Full catalogue version string.
 * @param prerelease - Whether the release belongs to the pre-release channel.
 * @returns A deterministic release with both selectable variants.
 */
function groupedCatalogueRelease(
    version: string,
    prerelease = false,
): ReleaseSummary {
    return {
        version,
        name: `Godot ${version}`,
        tag: version,
        version_number: Number.parseFloat(version),
        published_at: '2026-09-01T00:00:00.000Z',
        prerelease,
        draft: false,
        assets: [false, true].map((mono) => ({
            name: mono ? 'godot-mono.zip' : 'godot.zip',
            download_url: 'https://example.invalid/godot.zip',
            platform_tags: ['linux', 'x64'],
            mono,
        })),
    };
}

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
        await expect(
            mainPage.getByRole('heading', { name: 'New Project', exact: true }),
        ).toBeFocused();
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
