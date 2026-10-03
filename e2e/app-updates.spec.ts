import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';
import type { AppUpdateMessage } from '@shared/contracts';
import { getMainWindow } from './splashscreen/getMainWindow';
import { SAMPLE_PREFS } from './support/e2e-fixture-data';
import { createFixtureHome, prepareAppWithStubbedData, setAppLanguage } from './support/e2e-fixture-runtime';

let electronApp: ElectronApplication;
let page: Page;
let fixtureHome: string;
const offeredVersion = '99.0.0-beta.2';
const notesUrl = `https://docs.godotlauncher.org/release-notes/${offeredVersion}/`;

type UpdateFixtureState = {
    checks: unknown[];
    downloads: number;
    installs: number;
    urls: string[];
    skipped: string[];
    preferenceReads: number;
    failExternal: boolean;
};
type FixtureGlobal = typeof globalThis & { __appUpdateFixture: UpdateFixtureState };
type PendingFixtureGlobal = FixtureGlobal & { __finishAppUpdateDownload?: () => void };
type PendingSkipFixtureGlobal = FixtureGlobal & { __finishAppUpdateSkip?: () => void };

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
    if (!page.url().endsWith('#/projects')) await page.getByTestId('btnProjects').click();
    await expect(page.getByTestId('inputProjectSearch')).toBeFocused();
    await page.setViewportSize({ width: 1024, height: 600 });
});

test.afterAll(async () => {
    await electronApp?.close();
    if (fixtureHome) await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('opens only on request and supports keyboard, outside dismissal and focus return', async () => {
    const trigger = page.getByTestId('btnAppUpdateNotification');
    const panel = page.getByTestId('appUpdatePopover');
    await offerUpdate();
    await expect(trigger).toHaveText('Update');
    await expect(trigger).toHaveAccessibleName('Update available');
    await expect(panel).not.toBeVisible();
    await expect(page.getByTestId('appUpdateBanner')).toHaveCount(0);
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await expect(panel).not.toContainText('Review what has changed');
    await expect(panel).toContainText('Restart to install after the download finishes.');
    await expect(page.getByTestId('btnAppUpdateClose')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('btnAppUpdateReleaseNotes')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    await page.getByRole('heading', { name: 'Projects', exact: true }).click();
    await expect(panel).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByTestId('btnAppUpdateClose').click();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByTestId('inputProjectSearch').click();
    await expect(panel).not.toBeVisible();
    await expect(page.getByTestId('inputProjectSearch')).toBeFocused();
    await trigger.click();
    await page.getByTestId('btnFilterProjectTags').click();
    const tags = page.getByRole('dialog', { name: 'Tags', exact: true });
    await expect(panel).not.toBeVisible();
    await expect(tags).toBeVisible();
    await expect(tags.getByRole('combobox', { name: 'Search tags' })).toBeFocused();
    await page.keyboard.press('Escape');
    expect((await fixtureState()).downloads).toBe(0);
    expect((await fixtureState()).skipped).toEqual([]);
});

test('keeps downloading and ready state across dismissal, navigation and late checks', async () => {
    const trigger = page.getByTestId('btnAppUpdateNotification');
    const panel = page.getByTestId('appUpdatePopover');
    await offerUpdate();
    await trigger.click();
    await page.getByTestId('btnAppUpdateReleaseNotes').click();
    expect((await fixtureState()).urls).toEqual([notesUrl]);
    await page.getByTestId('btnAppUpdateDownload').click();
    await expect(trigger).toHaveText('Downloading');
    await expect(page.getByTestId('appUpdateProgress')).not.toHaveAttribute('value');
    await page.getByTestId('btnAppUpdateClose').click();
    await emitUpdate({ type: 'downloading', available: true, downloaded: false, progressPercent: 55.4, message: 'Downloading update: 55%' });
    await expect(trigger).toHaveText('Downloading 55%');
    await expect(trigger).toHaveAccessibleName('Downloading 55%');
    await expect(panel).not.toBeVisible();
    await trigger.click();
    await expect(page.getByTestId('appUpdateTitle')).toContainText(offeredVersion);
    await expect(page.getByTestId('appUpdateProgress')).toHaveAttribute('value', '55');
    await emitUpdate({ type: 'none', available: false, downloaded: false });
    await expect(page.getByTestId('appUpdateProgress')).toHaveAttribute('value', '55');
    await page.getByTestId('btnSettings').click();
    await expect(panel).not.toBeVisible();
    await page.getByTestId('tabUpdates').click();
    await expect(page.getByRole('status')).toContainText('Downloading update: 55%');
    await expect(page.getByRole('button', { name: 'Check for updates', exact: true })).toBeEnabled();
    await expect(page.getByTestId('chkReceiveBetaUpdates')).toBeEnabled();
    await page.getByTestId('btnProjects').click();
    await emitUpdate({ type: 'ready', available: true, downloaded: true });
    await expect(trigger).toHaveText('Update');
    await expect(trigger).toHaveAccessibleName('Update ready');
    await expect(panel).not.toBeVisible();
    await trigger.click();
    await expect(page.getByTestId('appUpdateTitle')).toContainText(offeredVersion);
    await page.getByTestId('btnAppUpdateLater').click();
    await expect(panel).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await page.evaluate(async () => {
        await window.__di_electron__!.invoke('app.checkForUpdates', { ignoreSkippedVersion: true });
    });
    await trigger.click();
    await expect(page.getByTestId('btnAppUpdateRestart')).toBeVisible();
    expect((await fixtureState()).installs).toBe(0);
    await page.getByTestId('btnAppUpdateRestart').click();
    await expect.poll(async () => (await fixtureState()).installs).toBe(1);
    expect((await fixtureState()).downloads).toBe(1);
});

test('a late Skip completion preserves a download, ready update or newer offer', async () => {
    for (const type of ['downloading', 'ready', 'available'] as const) {
        await prepareAppWithStubbedData(page, electronApp);
        await stubUpdateActions();
        await electronApp.evaluate(({ ipcMain }) => {
            ipcMain.removeHandler('app.skipAppUpdate');
            ipcMain.handle('app.skipAppUpdate', (_event, version: string) => {
                (globalThis as FixtureGlobal).__appUpdateFixture.skipped.push(version);
                return new Promise((resolve) => {
                    (globalThis as PendingSkipFixtureGlobal).__finishAppUpdateSkip = () => resolve({ success: true, data: version });
                });
            });
        });
        try {
            await offerUpdate();
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabUpdates').click();
            await page.getByRole('button', { name: 'Skip this version', exact: true }).click();
            await expect.poll(async () => (await fixtureState()).skipped).toEqual([offeredVersion]);
            const version = type === 'available' ? '99.0.0-beta.3' : offeredVersion;
            if (type === 'downloading') {
                await page.getByRole('button', { name: 'Download update', exact: true }).click();
                await expect.poll(async () => (await fixtureState()).downloads).toBe(1);
            }
            await emitUpdate({ type, available: true, downloaded: type === 'ready', version });
            await electronApp.evaluate(() => (globalThis as PendingSkipFixtureGlobal).__finishAppUpdateSkip?.());
            await expect.poll(async () => (await fixtureState()).preferenceReads).toBeGreaterThan(0);
            const trigger = page.getByTestId('btnAppUpdateNotification');
            await expect(trigger).toBeVisible();
            await trigger.click();
            await expect(page.getByTestId('appUpdateTitle')).toContainText(version);
            if (type === 'downloading') await expect(page.getByTestId('appUpdateProgress')).toBeVisible();
            if (type === 'ready') await expect(page.getByTestId('btnAppUpdateRestart')).toBeVisible();
            if (type === 'available') await expect(page.getByTestId('btnAppUpdateDownload')).toBeVisible();
        } finally {
            await electronApp.evaluate(() => (globalThis as PendingSkipFixtureGlobal).__finishAppUpdateSkip?.());
        }
    }
});

test('download failure retries downloading and install failure retries installing', async () => {
    await offerUpdate();
    await page.getByTestId('btnAppUpdateNotification').click();
    await page.getByTestId('btnAppUpdateDownload').click();
    await emitUpdate({ type: 'error', available: true, downloaded: false, failedOperation: 'download' });
    await expect(page.getByTestId('appUpdateContent')).toContainText('Failed to download the update.');
    await page.getByTestId('btnAppUpdateRetry').click();
    await expect(page.getByTestId('appUpdateProgress')).toBeVisible();
    expect((await fixtureState()).downloads).toBe(2);
    expect((await fixtureState()).checks).toEqual([]);
    await emitUpdate({ type: 'ready', available: true, downloaded: true });
    await emitUpdate({ type: 'error', available: true, downloaded: true, failedOperation: 'install' });
    await expect(page.getByTestId('appUpdateContent')).toContainText('Failed to install the update.');
    await page.getByTestId('btnAppUpdateRetry').click();
    await expect.poll(async () => (await fixtureState()).installs).toBe(1);
    expect((await fixtureState()).downloads).toBe(2);
});

test('release notes and dismissal remain usable while the download IPC request is pending', async () => {
    await electronApp.evaluate(({ ipcMain, BrowserWindow }) => {
        ipcMain.removeHandler('app.downloadAppUpdate');
        ipcMain.handle('app.downloadAppUpdate', () => {
            (globalThis as FixtureGlobal).__appUpdateFixture.downloads += 1;
            for (const window of BrowserWindow.getAllWindows()) {
                window.webContents.send('app-updates', { type: 'downloading', available: true, downloaded: false });
            }
            return new Promise((resolve) => {
                (globalThis as PendingFixtureGlobal).__finishAppUpdateDownload = () => resolve({ success: true, data: undefined });
            });
        });
    });
    try {
        await offerUpdate();
        await page.getByTestId('btnAppUpdateNotification').click();
        await page.getByTestId('btnAppUpdateDownload').click();
        await expect(page.getByTestId('appUpdateProgress')).toBeVisible();
        await expect(page.getByTestId('btnAppUpdateReleaseNotes')).toBeEnabled();
        await page.getByTestId('btnAppUpdateReleaseNotes').click();
        expect((await fixtureState()).urls).toEqual([notesUrl]);
        await page.getByTestId('btnAppUpdateClose').click();
        await expect(page.getByTestId('appUpdatePopover')).not.toBeVisible();
        await page.getByTestId('btnAppUpdateNotification').click();
        await expect(page.getByTestId('appUpdateProgress')).toBeVisible();
        expect((await fixtureState()).downloads).toBe(1);
    } finally {
        await electronApp.evaluate(() => (globalThis as PendingFixtureGlobal).__finishAppUpdateDownload?.());
    }
});

test('a check failure retries checking and unknown errors offer no guessed retry', async () => {
    const trigger = page.getByTestId('btnAppUpdateNotification');
    await emitUpdate({ type: 'error', available: false, downloaded: false, failedOperation: 'check' });
    await trigger.click();
    await expect(page.getByTestId('appUpdateContent')).toContainText('Failed to check for updates.');
    await page.getByTestId('btnAppUpdateRetry').click();
    await expect(trigger).toHaveCount(0);
    const state = await fixtureState();
    expect(state.checks).toEqual([{ ignoreSkippedVersion: true }]);
    expect(state.downloads).toBe(0);
    expect(state.installs).toBe(0);
    await emitUpdate({ type: 'error', available: false, downloaded: false });
    await trigger.click();
    await expect(page.getByTestId('appUpdateContent')).toContainText('An update error occurred.');
    await expect(page.getByTestId('btnAppUpdateRetry')).toHaveCount(0);
});

test('OSTree guidance offers manual download, exact notes and skip without automatic install', async () => {
    const manualUrl = 'https://example.invalid/manual-release';
    await emitUpdate({ type: 'manual', available: true, downloaded: false, version: offeredVersion, url: manualUrl });
    await page.getByTestId('btnAppUpdateNotification').click();
    const panel = page.getByTestId('appUpdatePopover');
    await expect(panel).toContainText('Automatic installation is not supported on this rpm-ostree system.');
    await expect(page.getByTestId('btnAppUpdateDownload')).toHaveCount(0);
    await expect(page.getByTestId('btnAppUpdateRestart')).toHaveCount(0);
    await page.getByTestId('btnAppUpdateManual').click();
    await page.getByTestId('btnAppUpdateReleaseNotes').click();
    expect((await fixtureState()).urls).toEqual([manualUrl, notesUrl]);
    await page.getByTestId('btnAppUpdateSkip').click();
    await expect(page.getByTestId('btnAppUpdateNotification')).toHaveCount(0);
    await expect.poll(async () => (await fixtureState()).preferenceReads).toBeGreaterThan(0);
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabUpdates').click();
    await expect(page.getByRole('button', { name: 'Unskip skipped update', exact: true })).toBeVisible();
    const state = await fixtureState();
    expect(state.skipped).toEqual([offeredVersion]);
    expect(state.downloads).toBe(0);
    expect(state.installs).toBe(0);
});

test('a browser-open failure keeps update actions available and can be retried', async () => {
    await electronApp.evaluate(() => { (globalThis as FixtureGlobal).__appUpdateFixture.failExternal = true; });
    await offerUpdate();
    await page.getByTestId('btnAppUpdateNotification').click();
    await expect(page.getByTestId('appUpdatePopover')).toBeVisible();
    await page.getByTestId('btnAppUpdateReleaseNotes').click();
    await expect(page.getByRole('alert')).toHaveText('Could not open the link. Please try again.');
    await expect(page.getByTestId('btnAppUpdateDownload')).toBeEnabled();
    await expect(page.getByTestId('btnAppUpdateSkip')).toBeEnabled();
    await page.getByTestId('btnAppUpdateReleaseNotes').click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect((await fixtureState()).urls).toEqual([notesUrl, notesUrl]);
});

test('stays within the window at minimum and larger sizes, including long versions', async () => {
    for (const size of [{ width: 1024, height: 600 }, { width: 1440, height: 900 }]) {
        await page.setViewportSize(size);
        await offerUpdate('99.0.0-beta.123456789+long-build-identifier-for-layout');
        await page.getByTestId('btnAppUpdateNotification').click();
        const panel = page.getByTestId('appUpdatePopover');
        await expect(panel).toBeInViewport({ ratio: 1 });
        await expect(page.getByTestId('btnAppUpdateSkip')).toBeInViewport({ ratio: 1 });
        const rect = await panel.boundingBox();
        expect(rect!.x).toBeGreaterThanOrEqual(0);
        expect(rect!.y).toBeGreaterThanOrEqual(0);
        expect(rect!.x + rect!.width).toBeLessThanOrEqual(size.width);
        expect(rect!.y + rect!.height).toBeLessThanOrEqual(size.height);
        await page.getByTestId('btnAppUpdateClose').click();
    }
});

test('keeps release notes above one row of actions in all supported languages at minimum size', async () => {
    test.setTimeout(120000);
    const languages = ['English', 'Deutsch', 'Español', 'Français', 'Italiano', '日本語', 'Malti', 'Polski', 'Português', 'Português (Brasil)', 'Русский', 'Türkçe', '简体中文', '繁體中文'];
    const offered: AppUpdateMessage = { type: 'available', available: true, downloaded: false, version: offeredVersion };
    const states: { message: AppUpdateMessage; buttons: number }[] = [
        { message: { type: 'error', available: false, downloaded: false }, buttons: 0 },
        { message: { type: 'error', available: false, downloaded: false, failedOperation: 'check' }, buttons: 1 },
        { message: { ...offered, version: 'invalid' }, buttons: 1 },
        { message: offered, buttons: 2 },
        { message: { ...offered, type: 'manual' }, buttons: 2 },
        { message: { ...offered, type: 'error' }, buttons: 0 },
        { message: { ...offered, type: 'downloading' }, buttons: 0 },
        { message: { ...offered, type: 'downloading', progressPercent: 55 }, buttons: 0 },
        { message: { ...offered, type: 'error', failedOperation: 'download' }, buttons: 1 },
        { message: { ...offered, type: 'ready', downloaded: true }, buttons: 2 },
        { message: { ...offered, type: 'error', downloaded: true, failedOperation: 'install' }, buttons: 2 },
    ];
    try {
        for (const language of languages) {
            await prepareAppWithStubbedData(page, electronApp);
            await stubUpdateActions();
            await setAppLanguage(page, language);
            await expect(page.getByTestId('inputProjectSearch')).toBeFocused();
            for (const state of states) {
                await emitUpdate(state.message);
                await page.getByTestId('btnAppUpdateNotification').click();
                const panel = page.getByTestId('appUpdatePopover');
                const row = page.getByTestId('appUpdateActions');
                const buttons = row.getByRole('button');
                await expect(panel).toBeVisible();
                await expect(buttons).toHaveCount(state.buttons);
                await expect(row.getByTestId('btnAppUpdateReleaseNotes')).toHaveCount(0);
                if (state.buttons) {
                    await expect.poll(async () => {
                        const boundary = await panel.boundingBox();
                        const boxes = await buttons.evaluateAll((nodes) => nodes.map((node) => {
                            const rect = node.getBoundingClientRect();
                            return { x: rect.x, right: rect.right, middle: rect.y + rect.height / 2 };
                        }));
                        return Boolean(boundary) && boxes.every((box) =>
                            Math.abs(box.middle - boxes[0].middle) < 1 &&
                            box.x >= boundary!.x && box.right <= boundary!.x + boundary!.width,
                        );
                    }, { message: `${language}: ${state.message.type} actions share one visible row` }).toBe(true);
                    for (const button of await buttons.all()) await expect(button).toBeInViewport({ ratio: 1 });
                    const notes = page.getByTestId('btnAppUpdateReleaseNotes');
                    if (await notes.count()) {
                        await expect.poll(async () => {
                            const notesBox = await notes.boundingBox();
                            const rowBox = await row.boundingBox();
                            return Boolean(notesBox && rowBox) && notesBox!.y + notesBox!.height < rowBox!.y;
                        }, { message: `${language}: release notes sit above the action row` }).toBe(true);
                    }
                }
                await page.getByTestId('btnAppUpdateClose').click();
            }
        }
    } finally {
        await setAppLanguage(page, 'English');
    }
});

/**
 * Offers a deterministic release without triggering provider network work.
 * @param version - Exact version to display in the fixture.
 */
async function offerUpdate(version = offeredVersion): Promise<void> {
    await emitUpdate({ type: 'available', available: true, downloaded: false, version });
}

/**
 * Sends an event through Electron and its real preload bridge.
 * @param update - Event delivered to the running renderer.
 */
async function emitUpdate(update: AppUpdateMessage): Promise<void> {
    await electronApp.evaluate(({ BrowserWindow }, payload) => {
        for (const window of BrowserWindow.getAllWindows()) window.webContents.send('app-updates', payload);
    }, update);
}

/** Reads observed IPC actions without accessing React internals. */
async function fixtureState(): Promise<UpdateFixtureState> {
    return await electronApp.evaluate(() => (globalThis as FixtureGlobal).__appUpdateFixture);
}

/** Suppresses provider downloads, browser launches and restart while recording IPC actions. */
async function stubUpdateActions(): Promise<void> {
    await electronApp.evaluate(({ ipcMain, BrowserWindow }, initialPrefs) => {
        const state: UpdateFixtureState = { checks: [], downloads: 0, installs: 0, urls: [], skipped: [], preferenceReads: 0, failExternal: false };
        (globalThis as FixtureGlobal).__appUpdateFixture = state;
        let preferences = initialPrefs;
        /**
         * Sends a provider fixture to every renderer window.
         * @param payload - Event sent through the preload transport.
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
        ipcMain.removeHandler('app.openExternal');
        ipcMain.handle('app.openExternal', (_event, url: string) => {
            state.urls.push(url);
            if (state.failExternal) {
                state.failExternal = false;
                return { success: false, error: 'Fixture browser failure' };
            }
            return { success: true, data: undefined };
        });
        ipcMain.removeHandler('app.skipAppUpdate');
        ipcMain.handle('app.skipAppUpdate', (_event, version: string) => {
            state.skipped.push(version);
            preferences = { ...preferences, skipped_app_update_version: version };
            return { success: true, data: undefined };
        });
        ipcMain.removeHandler('app.getUserPreferences');
        ipcMain.handle('app.getUserPreferences', () => {
            state.preferenceReads += 1;
            return { success: true, data: preferences };
        });
    }, SAMPLE_PREFS);
}

/**
 * Isolates preferences, app data and fixtures from the normal app.
 * @param homeDir - Temporary home used for this Electron session.
 */
function createIsolatedLaunchEnvironment(homeDir: string): Record<string, string> {
    const environment = {
        ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
        APPDATA: path.join(homeDir, 'AppData', 'Roaming'), HOME: homeDir,
        LOCALAPPDATA: path.join(homeDir, 'AppData', 'Local'), USERPROFILE: homeDir,
        XDG_CACHE_HOME: path.join(homeDir, '.cache'), XDG_CONFIG_HOME: path.join(homeDir, '.config'),
        XDG_DATA_HOME: path.join(homeDir, '.local', 'share'), XDG_STATE_HOME: path.join(homeDir, '.local', 'state'),
        GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: homeDir, NODE_ENV: 'production',
    };
    delete (environment as Record<string, string>).ELECTRON_RUN_AS_NODE;
    return environment;
}
