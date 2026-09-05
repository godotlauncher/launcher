import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Page,
    test,
} from '@playwright/test';
import type { EditorCatalogResult } from '@shared/contracts';
import {
    createFixtureHome,
    prepareAppWithStubbedData,
    setAppLanguage,
} from './support/e2e-fixture-runtime';
import { TOOL_INTEGRATIONS_NO_GIT } from './support/e2e-fixture-data';
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
        availableReleases: [],
        availablePrereleases: [],
        catalogRefreshError: 'Simulated catalogue failure.',
        toolIntegrations: TOOL_INTEGRATIONS_NO_GIT,
    });
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('projects.inspectCreateProjectDestination');
        ipcMain.handle('projects.inspectCreateProjectDestination', async () => ({
            success: true,
            data: { status: 'available' },
        }));
    });
});

test.afterAll(async () => {
    await electronApp.close();
    await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('retries an empty failed catalogue without discarding the Create Project name', async () => {
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnWelcomeCreateProject').click();

    const drawer = mainPage.getByRole('dialog', { name: 'New Project' });
    const projectName = drawer.getByTestId('inputProjectName');
    await expect(drawer).toBeVisible();
    await projectName.fill('Recovered Catalogue Project');

    await drawer.getByTestId('selectCreateProjectGodotEditor').click();
    const popover = drawer.getByTestId('createProjectEditorPickerPopover');
    const retry = popover.getByTestId(
        'btnRetryCreateProjectEditorCatalogue',
    );
    await expect(
        popover.getByTestId('createProjectEditorCatalogueError'),
    ).toBeVisible();
    await expect(retry).toBeVisible();

    await stubRecoveredCatalogue();
    await retry.click();

    await expect(
        popover.getByTestId(
            'createProjectCatalogueEditor_catalogue:4.9.3-stable:std',
        ),
    ).toBeVisible();
    await expect(projectName).toHaveValue('Recovered Catalogue Project');
});

/** Installs a successful response for the next catalogue refresh request. */
async function stubRecoveredCatalogue(): Promise<void> {
    const catalogue = createRecoveredCatalogue();
    await electronApp.evaluate(({ ipcMain }, recoveredCatalogue) => {
        ipcMain.removeHandler('editorCatalog.refreshCatalog');
        ipcMain.handle('editorCatalog.refreshCatalog', async () => ({
            success: true,
            data: recoveredCatalogue,
        }));
    }, catalogue);
}

/**
 * Creates one downloadable stable release for the successful retry response.
 *
 * @returns An editor catalogue response accepted by the renderer bridge.
 */
function createRecoveredCatalogue(): EditorCatalogResult {
    return {
        releases: [
            {
                id: 'official-stable:4.9.3-stable',
                sourceReleaseId: '4.9.3-stable',
                providerId: 'official-stable',
                tag: '4.9.3-stable',
                version: '4.9.3-stable',
                baseVersion: '4.9.3',
                name: 'Godot 4.9.3',
                publishedAt: '2026-09-05T00:00:00.000Z',
                prerelease: false,
                versionParts: {
                    major: 4,
                    minor: 9,
                    patch: 3,
                    channel: 'stable',
                    iteration: 0,
                },
                variants: [
                    {
                        id: 'official-stable:4.9.3-stable:gdscript',
                        flavor: 'gdscript',
                        assets: [
                            {
                                id: 'official-stable:4.9.3-stable:gdscript:darwin-arm64',
                                name: 'Godot_4.9.3-stable_macos.zip',
                                downloadUrl:
                                    'https://example.com/Godot_4.9.3-stable_macos.zip',
                                platform: 'darwin',
                                architecture: 'arm64',
                            },
                        ],
                    },
                ],
            },
        ],
        providers: [
            {
                id: 'official-stable',
                lastFetchedAt: Date.now(),
                isStale: false,
            },
            {
                id: 'official-prerelease',
                lastFetchedAt: Date.now(),
                isStale: false,
            },
        ],
    };
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
