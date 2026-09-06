import { _electron, expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { UserPreferences } from '@shared/contracts';
import {
    createFixtureHome,
    setAppLanguage,
} from './support/e2e-fixture-runtime';
import { getMainWindow } from './splashscreen/getMainWindow';

let electronApp: Awaited<ReturnType<typeof _electron.launch>>;
let mainPage: Awaited<ReturnType<typeof electronApp.firstWindow>>;
let fixtureHome: string;

test.beforeEach(async () => {
    fixtureHome = await createFixtureHome();
    electronApp = await _electron.launch({
        args: [
            '.',
            `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`,
        ],
        env: createIsolatedLaunchEnvironment(fixtureHome),
    });
    mainPage = await getMainWindow(electronApp);
    await setAppLanguage(mainPage, 'English', false);
    const settingsView = await mainPage.getByTestId('settingsTitle');
    await expect(settingsView).toHaveCount(1);
    await expect(settingsView).toBeVisible();
});

test.afterEach(async () => {
    await electronApp?.close();
    await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('isolates persisted preferences and Electron user data', async () => {
    const userDataPath = await electronApp.evaluate(({ app }) =>
        app.getPath('userData'),
    );
    const preferences = JSON.parse(
        await fs.readFile(
            path.join(fixtureHome, '.gd-launcher', 'prefs.json'),
            'utf-8',
        ),
    ) as UserPreferences;

    expect(await fs.realpath(userDataPath)).toBe(
        await fs.realpath(path.join(fixtureHome, 'electron-user-data')),
    );
    expect(preferences.projects_location).toBe(
        path.join(fixtureHome, 'Godot', 'Projects'),
    );
    expect(preferences.install_location).toBe(
        path.join(fixtureHome, 'Godot', 'Editors'),
    );
    expect(preferences.config_location).toBe(
        path.join(fixtureHome, '.gd-launcher'),
    );
});

test('Can set theme light', async () => {
    await mainPage.getByTestId('themeLight').click();
    const theme = await mainPage.evaluate(() =>
        window.localStorage.getItem('theme'),
    );
    expect(theme).toBe('light');
});

test('Can set theme dark', async () => {
    await mainPage.getByTestId('themeDark').click();
    const theme = await mainPage.evaluate(() =>
        window.localStorage.getItem('theme'),
    );
    expect(theme).toBe('dark');
});

test('Can set theme auto', async () => {
    await mainPage.getByTestId('themeAuto').click();
    const theme = await mainPage.evaluate(() =>
        window.localStorage.getItem('theme'),
    );
    expect(theme).toBe('auto');
});

test('Can open the Connections presentation from its shortcut', async () => {
    const connectionsShortcut = mainPage.getByTestId('btnConnections');

    await connectionsShortcut.click();

    await expect(mainPage).toHaveURL(/\/settings\/connections$/);
    await expect(mainPage.getByTestId('tabConnections')).toHaveAttribute(
        'aria-selected',
        'true',
    );
    const githubCard = mainPage.getByTestId('app-integration-github');
    await expect(githubCard).toBeVisible();
    await expect(
        mainPage.getByRole('button', {
            name: /Connect GitHub|Add connection/,
        }),
    ).toBeEnabled();
});

const locationConfigurations = [
    {
        name: 'Projects',
        tabTestId: 'tabProjects',
        pathTestId: 'projectLocationPath',
        browseTestId: 'btnSelectProjectDir',
        preferenceKey: 'projects_location' as const,
        currentPath: (homeDir: string) =>
            path.join(homeDir, 'Godot', 'Projects'),
        selectedPath: '/Users/docs/Work/Projects',
        dialogTitle: 'Select Project Directory',
    },
    {
        name: 'Installs',
        tabTestId: 'tabInstalls',
        pathTestId: 'editorInstallLocationPath',
        browseTestId: 'btnSelectInstallDir',
        preferenceKey: 'install_location' as const,
        currentPath: (homeDir: string) =>
            path.join(homeDir, 'Godot', 'Editors'),
        selectedPath: '/Users/docs/Work/Editors',
        dialogTitle: 'Select Install Directory',
    },
];

for (const configuration of locationConfigurations) {
    test(`${configuration.name} location preserves dialog, focus, and layout behaviour`, async () => {
        const currentPath = configuration.currentPath(fixtureHome);
        await mainPage.getByTestId(configuration.tabTestId).click();
        const pathField = mainPage.getByTestId(configuration.pathTestId);
        const browseButton = mainPage.getByTestId(
            configuration.browseTestId,
        );

        await expect(pathField).toHaveValue(currentPath);
        await expect(pathField).toHaveAttribute('readonly', '');
        await pathField.selectText();
        expect(
            await pathField.evaluate((input: HTMLInputElement) => ({
                start: input.selectionStart,
                end: input.selectionEnd,
                length: input.value.length,
            })),
        ).toEqual({
            start: 0,
            end: currentPath.length,
            length: currentPath.length,
        });

        await stubSettingsLocationHandlers({
            result: { canceled: true, filePaths: [] },
            pending: true,
        });
        await browseButton.focus();
        await browseButton.press('Enter');

        const waitingMessage = mainPage.getByText('Waiting for dialog...', {
            exact: true,
        });
        await expect(waitingMessage).toBeVisible();
        await expect
            .poll(() => readSettingsLocationCalls('directory'))
            .toEqual([
                [currentPath, configuration.dialogTitle],
            ]);

        await releaseSettingsLocationDialog();
        await expect(waitingMessage).not.toBeVisible();
        await expect(pathField).toHaveValue(currentPath);
        await expect(browseButton).toBeFocused();
        expect(await readSettingsLocationCalls('preferences')).toEqual([]);

        await stubSettingsLocationHandlers({
            result: {
                canceled: false,
                filePaths: [configuration.selectedPath],
            },
        });
        await browseButton.click();

        await expect(pathField).toHaveValue(configuration.selectedPath);
        await expect
            .poll(() => readSettingsLocationCalls('preferences'))
            .toHaveLength(1);
        const savedPreferences = (
            await readSettingsLocationCalls('preferences')
        )[0]?.[0] as UserPreferences;
        expect(savedPreferences[configuration.preferenceKey]).toBe(
            configuration.selectedPath,
        );

        await mainPage.setViewportSize({ width: 1024, height: 600 });
        const viewportWidth = await mainPage.evaluate(() => window.innerWidth);
        for (const locator of [pathField, browseButton]) {
            const box = await locator.boundingBox();
            expect(box).not.toBeNull();
            expect(box?.x).toBeGreaterThanOrEqual(0);
            expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
                viewportWidth,
            );
        }
    });
}

type SettingsLocationHandlerOptions = {
    result: { canceled: boolean; filePaths: string[] };
    pending?: boolean;
};

/**
 * Stubs and records Settings directory selection and preference saves.
 *
 * @param options - Directory result and optional pending state.
 */
async function stubSettingsLocationHandlers(
    options: SettingsLocationHandlerOptions,
): Promise<void> {
    await electronApp.evaluate(
        ({ ipcMain }, injected: SettingsLocationHandlerOptions) => {
            const state = globalThis as typeof globalThis & {
                __settingsLocationE2E?: {
                    directoryCalls: unknown[][];
                    preferenceCalls: unknown[][];
                    release?: () => void;
                };
            };
            const handlerState = {
                directoryCalls: [],
                preferenceCalls: [],
            } as NonNullable<typeof state.__settingsLocationE2E>;
            state.__settingsLocationE2E = handlerState;

            ipcMain.removeHandler('app.openDirectoryDialog');
            ipcMain.handle(
                'app.openDirectoryDialog',
                async (_event, ...args) => {
                    handlerState.directoryCalls.push(args);
                    if (injected.pending) {
                        await new Promise<void>((resolve) => {
                            handlerState.release = resolve;
                        });
                    }
                    return { success: true, data: injected.result };
                },
            );

            ipcMain.removeHandler('app.setUserPreferences');
            ipcMain.handle(
                'app.setUserPreferences',
                async (_event, nextPreferences: UserPreferences) => {
                    handlerState.preferenceCalls.push([nextPreferences]);
                    return { success: true, data: nextPreferences };
                },
            );
        },
        options,
    );
}

/**
 * Reads recorded Settings location IPC arguments.
 *
 * @param kind - Handler whose calls should be returned.
 * @returns Recorded argument arrays.
 */
async function readSettingsLocationCalls(
    kind: 'directory' | 'preferences',
): Promise<unknown[][]> {
    return await electronApp.evaluate((_electron, injectedKind) => {
        const state = globalThis as typeof globalThis & {
            __settingsLocationE2E?: {
                directoryCalls: unknown[][];
                preferenceCalls: unknown[][];
            };
        };
        return injectedKind === 'directory'
            ? (state.__settingsLocationE2E?.directoryCalls ?? [])
            : (state.__settingsLocationE2E?.preferenceCalls ?? []);
    }, kind);
}

/** Releases the pending Settings directory dialog response. */
async function releaseSettingsLocationDialog(): Promise<void> {
    await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __settingsLocationE2E?: { release?: () => void };
        };
        const release = state.__settingsLocationE2E?.release;
        if (!release) {
            throw new Error('No pending Settings directory dialog.');
        }
        release();
    });
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
    const launchEnvironment: Record<string, string> = {
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
    delete launchEnvironment.ELECTRON_RUN_AS_NODE;
    return launchEnvironment;
}
