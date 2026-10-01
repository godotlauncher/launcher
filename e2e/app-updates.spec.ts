import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';
import type { AppUpdateMessage } from '@shared/contracts';
import { getMainWindow } from './splashscreen/getMainWindow';
import { createFixtureHome, prepareAppWithStubbedData, setAppLanguage } from './support/e2e-fixture-runtime';

let electronApp: ElectronApplication;
let page: Page;
let fixtureHome: string;
const offeredVersion = '99.0.0';

type UpdateFixtureState = {
    checks: unknown[];
    downloads: number;
    installs: number;
};
type FixtureGlobal = typeof globalThis & { __appUpdateFixture: UpdateFixtureState };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    electronApp = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`],
        env: createIsolatedLaunchEnvironment(fixtureHome),
    });
    page = await getMainWindow(electronApp);
    await setAppLanguage(page, 'English');
});

test.beforeEach(async () => {
    await prepareAppWithStubbedData(page, electronApp);
    await stubUpdateActions();
    await page.getByTestId('btnProjects').click();
});

test.afterAll(async () => {
    await electronApp?.close();
    if (fixtureHome) await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('retains the selected release through progress, download retry and ready in both views', async () => {
    const banner = page.getByTestId('appUpdateBanner');
    const check = page.getByRole('button', { name: 'Check for updates', exact: true });
    const beta = page.getByTestId('chkReceiveBetaUpdates');

    await test.step('Available: downloading starts only from the explicit action', async () => {
        await emitUpdate({ type: 'available', available: true, downloaded: false, version: offeredVersion });
        await expect(banner).toContainText(offeredVersion);
        expect((await fixtureState()).downloads).toBe(0);
        await page.getByTestId('btnAppUpdateDownload').click();
        await expect(banner).toContainText('Downloading update...');
        await expect(page.getByTestId('btnAppUpdateDownload')).toHaveCount(0);
    });

    await test.step('Downloading: Settings shares progress and blocks conflicting controls', async () => {
        await emitUpdate({ type: 'downloading', available: true, downloaded: false, progressPercent: 55.4 });
        await expect(banner).toContainText('Downloading update: 55%');
        await page.getByTestId('btnSettings').click();
        await page.getByTestId('tabUpdates').click();
        await expect(page.getByRole('status').filter({ hasText: 'Downloading update: 55%' })).toHaveCount(2);
        await expect(check).toBeDisabled();
        await expect(beta).toBeDisabled();

        // Late check events must not clear a selected download.
        await emitUpdate({ type: 'checking', available: false, downloaded: false });
        await emitUpdate({ type: 'none', available: false, downloaded: false });
        await expect(banner).toContainText('Downloading update: 55%');
        expect((await fixtureState()).downloads).toBe(1);
    });

    await test.step('Download failure: Retry invokes download rather than checking', async () => {
        await emitUpdate({ type: 'error', available: true, downloaded: false, failedOperation: 'download' });
        await expect(banner).toContainText('Failed to download the update.');
        await expect(check).toBeEnabled();
        await expect(beta).toBeEnabled();
        await page.getByTestId('btnAppUpdateRetry').click();
        await expect(banner).toContainText('Downloading update...');
        expect(await fixtureState()).toEqual({ checks: [], downloads: 2, installs: 0 });
    });

    await test.step('Ready: the offered version survives incomplete events and later checks', async () => {
        await emitUpdate({ type: 'ready', available: true, downloaded: true });
        await expect(banner).toContainText(offeredVersion);
        await expect(page.getByTestId('btnAppUpdateRestart')).toBeVisible();
        await expect(check).toBeDisabled();
        await expect(beta).toBeDisabled();
        // Exercise the real preload transport while the fake provider emits stale no-update state.
        await page.evaluate(async () => {
            await window.__di_electron__!.invoke('app.checkForUpdates', { ignoreSkippedVersion: true });
        });
        await expect(page.getByTestId('btnAppUpdateRestart')).toBeVisible();
        await expect(banner).toContainText(offeredVersion);
        expect((await fixtureState()).installs).toBe(0);
    });

    await test.step('Install failure: Retry invokes install and preserves the ready target', async () => {
        await emitUpdate({ type: 'error', available: true, downloaded: true, failedOperation: 'install' });
        await expect(banner).toContainText('Failed to install the update.');
        await page.getByRole('button', { name: 'Retry', exact: true }).last().click();
        expect(await fixtureState()).toEqual({ checks: [{ ignoreSkippedVersion: true }], downloads: 2, installs: 1 });
        await expect(beta).toBeDisabled();
    });
});

test('a failed check stays truthful and Retry checks without downloading or installing', async () => {
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabUpdates').click();
    await emitUpdate({ type: 'error', available: false, downloaded: false, failedOperation: 'check', message: 'Provider failure' });
    await expect(page.getByTestId('appUpdateBanner')).toContainText('Failed to check for updates.');
    await expect(page.getByRole('status').filter({ hasText: 'Failed to check for updates.' })).toHaveCount(2);
    await page.getByRole('button', { name: 'Retry', exact: true }).last().click();
    await expect(page.getByTestId('appUpdateBanner')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('No updates available');
    expect(await fixtureState()).toEqual({ checks: [{ ignoreSkippedVersion: true }], downloads: 0, installs: 0 });
});

/**
 * Sends a deterministic update event through Electron and its real preload bridge.
 *
 * @param update - Event to deliver to the running renderer.
 */
async function emitUpdate(update: AppUpdateMessage): Promise<void> {
    await electronApp.evaluate(({ BrowserWindow }, payload) => {
        for (const window of BrowserWindow.getAllWindows()) {
            window.webContents.send('app-updates', payload);
        }
    }, update);
}

/** Reads the fixture's observed IPC actions without accessing React internals. */
async function fixtureState(): Promise<UpdateFixtureState> {
    return await electronApp.evaluate(() => (globalThis as FixtureGlobal).__appUpdateFixture);
}

/** Suppresses real provider downloads and restart while recording update IPC actions. */
async function stubUpdateActions(): Promise<void> {
    await electronApp.evaluate(({ ipcMain, BrowserWindow }) => {
        const state: UpdateFixtureState = { checks: [], downloads: 0, installs: 0 };
        (globalThis as FixtureGlobal).__appUpdateFixture = state;
        /**
         * Sends a provider fixture to every renderer window.
         *
         * @param payload - Update event to send through the preload transport.
         */
        const send = (payload: AppUpdateMessage) => {
            for (const window of BrowserWindow.getAllWindows()) window.webContents.send('app-updates', payload);
        };
        ipcMain.removeHandler('app.downloadAppUpdate');
        ipcMain.handle('app.downloadAppUpdate', () => {
            state.downloads += 1;
            send({ type: 'downloading', available: true, downloaded: false });
            return { success: true, data: undefined };
        });
        ipcMain.removeHandler('app.checkForUpdates');
        ipcMain.handle('app.checkForUpdates', (_event, options) => {
            state.checks.push(options);
            const result: AppUpdateMessage = { type: 'none', available: false, downloaded: false };
            send(result);
            return { success: true, data: result };
        });
        ipcMain.removeHandler('app.installUpdateAndRestart');
        ipcMain.handle('app.installUpdateAndRestart', () => {
            state.installs += 1;
            return { success: true, data: undefined };
        });
    });
}

/**
 * Isolates Launcher preferences, app data and updater fixtures from the normal app.
 *
 * @param homeDir - Temporary fixture home to use for this Electron session.
 */
function createIsolatedLaunchEnvironment(homeDir: string): Record<string, string> {
    const environment = {
        ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
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
        NODE_ENV: 'production',
    };
    delete (environment as Record<string, string>).ELECTRON_RUN_AS_NODE;
    return environment;
}
