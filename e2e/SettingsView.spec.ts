import { _electron, expect, test } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
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
    await expect(connectionsShortcut).toHaveClass(/menu-active/);
    await expect(mainPage.getByTestId('btnSettings')).not.toHaveClass(
        /menu-active/,
    );
    await expect(mainPage.getByTestId('tabConnections')).toHaveAttribute(
        'aria-selected',
        'true',
    );
    await expect(mainPage.getByTestId('settingsTabRailEnd')).toHaveCSS(
        'border-bottom-width',
        '1px',
    );
    await expect(mainPage.getByTestId('settingsPanelContainer')).toHaveCSS(
        'border-top-left-radius',
        '0px',
    );
    await expect(mainPage.getByTestId('settingsPanelContainer')).toHaveCSS(
        'border-top-right-radius',
        '0px',
    );
    const githubCard = mainPage.getByTestId('app-integration-github');
    await expect(githubCard).toBeVisible();
    expect(
        await githubCard.evaluate((card) =>
            getComputedStyle(card.parentElement as HTMLElement).maxWidth,
        ),
    ).toBe('none');
    await expect(
        mainPage.getByRole('button', {
            name: /Connect GitHub|Add connection/,
        }),
    ).toBeEnabled();
});

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
        GODOT_LAUNCHER_E2E_FIXTURES: '1',
        GODOT_LAUNCHER_E2E_HOME_DIR: homeDir,
        NODE_OPTIONS: existingNodeOptions
            ? `${existingNodeOptions} ${requireOverrideOption}`
            : requireOverrideOption,
    };
    delete launchEnvironment.ELECTRON_RUN_AS_NODE;
    return launchEnvironment;
}
