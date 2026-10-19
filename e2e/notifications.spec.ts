import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, type Page, expect, test } from '@playwright/test';
import type { UserPreferences } from '@shared/contracts';
import { createFixtureHome, prepareAppWithStubbedData, setAppLanguage } from './support/e2e-fixture-runtime';
import { getMainWindow } from './splashscreen/getMainWindow';

let app: ElectronApplication;
let page: Page;
let home: string;
test.describe.configure({ mode: 'serial' });
test.setTimeout(45000);

/** Starts Electron with isolated fixtures and real preferences behind its preload bridge. */
async function launch() {
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env: { ...env, GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home } });
    page = await getMainWindow(app);
    await setAppLanguage(page, 'English');
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown>; notificationHandlers: Map<string, (...args: unknown[]) => unknown> };
        ipc.notificationHandlers = new Map(['app.getUserPreferences', 'app.setUserPreferences'].map(channel => [channel, ipc._invokeHandlers.get(channel)!]));
    });
    await prepareAppWithStubbedData(page, app);
    await restorePreferences();
    await page.reload();
    await page.getByTestId('btnProjects').click();
    await page.setViewportSize({ width: 1024, height: 700 });
}

/** Restores actual preference handlers after simulating action failure. */
async function restorePreferences() {
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { notificationHandlers: Map<string, (...args: unknown[]) => unknown> };
        for (const [channel, handler] of ipc.notificationHandlers) { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); }
    });
}

/** Opens the existing group-order modal. */
async function openOptions() {
    await page.getByTestId('btnProjectViewOptions').click();
    return page.getByRole('dialog', { name: 'View options', exact: true });
}

/** Saves a reordered group draft and returns its notification. */
async function saveOrder() {
    const modal = await openOptions();
    const row = modal.getByRole('button', { name: 'Reorder New', exact: true });
    await row.press('Space');
    await row.press('ArrowUp');
    await row.press('Space');
    await expect(modal.getByRole('list', { name: 'Group order', exact: true }).getByRole('button')).toHaveText(['New', 'Pinned', 'Recents']);
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(modal).toBeHidden();
    const card = page.getByRole('article', { name: 'Group order saved', exact: true });
    await expect(card).toBeVisible();
    return card;
}

test.beforeAll(async () => { home = await createFixtureHome(); await launch(); });
test.afterAll(async () => { await app?.close(); if (home) await fs.rm(home, { recursive: true, force: true }); });
test.beforeEach(async () => {
    await restorePreferences();
    await page.getByTestId('btnProjects').click();
    const modal = await openOptions();
    const restore = modal.getByRole('button', { name: 'Restore default order', exact: true });
    if (await restore.isEnabled()) {
        await restore.click();
        await modal.getByRole('button', { name: 'Save', exact: true }).click();
    } else await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(modal).toBeHidden();
    const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
    if (await dismiss.isVisible()) await dismiss.click();
});

test('appears at bottom left with both actions, preserves focus, and times out', async () => {
    const card = await saveOrder();
    await expect(page.getByTestId('btnProjectViewOptions')).toBeFocused();
    await expect(card.getByRole('button', { name: 'Undo', exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'View options', exact: true })).toBeVisible();
    await expect(card).toContainText('New > Pinned > Recents');
    const bounds = (await card.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(12);
    expect(bounds.x).toBeLessThanOrEqual(20);
    expect(700 - bounds.y - bounds.height).toBeGreaterThanOrEqual(12);
    expect(700 - bounds.y - bounds.height).toBeLessThanOrEqual(20);
    await expect(card).toBeHidden({ timeout: 7500 });
});

test('hover pauses dismissal and preserves the remaining time', async () => {
    const card = await saveOrder();
    await page.waitForTimeout(1000);
    await card.hover();
    await page.waitForTimeout(6500);
    await expect(card).toBeVisible();
    await page.getByTestId('projectsTitle').hover();
    await expect(card).toBeHidden({ timeout: 4000 });
});

test('focus pauses dismissal, and Escape and close restore focus', async () => {
    let card = await saveOrder();
    await card.getByRole('button', { name: 'Undo', exact: true }).focus();
    await page.waitForTimeout(6500);
    await expect(card).toBeVisible();
    await card.press('Escape');
    await expect(card).toBeHidden();
    await expect(page.getByTestId('btnProjectViewOptions')).toBeFocused();
    // Reopen and change the saved custom order using Restore default.
    const modal = await openOptions();
    await modal.getByRole('button', { name: 'Restore default order', exact: true }).click();
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    card = page.getByRole('article', { name: 'Group order saved', exact: true });
    await card.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
    await expect(card).toBeHidden();
    await expect(page.getByTestId('btnProjectViewOptions')).toBeFocused();
});

test('Undo preserves other preference changes and replaces the first notification safely', async () => {
    const card = await saveOrder();
    const changed = await app.evaluate(async ({ ipcMain, BrowserWindow }) => {
        const ipc = ipcMain as typeof ipcMain & { notificationHandlers: Map<string, (...args: unknown[]) => unknown> };
        const sender = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('http://localhost:5123'))!.webContents;
        const event = { sender, senderFrame: sender.mainFrame };
        const result = await ipc.notificationHandlers.get('app.getUserPreferences')!(event) as { success: true; data: UserPreferences };
        const saved = await ipc.notificationHandlers.get('app.setUserPreferences')!(event, { ...result.data, confirm_project_remove: false });
        return { result, saved };
    });
    expect(changed).toMatchObject({ result: { success: true }, saved: { success: true, data: { confirm_project_remove: false } } });
    expect(JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'prefs.json'), 'utf8')).confirm_project_remove).toBe(false);
    await card.getByRole('button', { name: 'Undo', exact: true }).click();
    const restored = page.getByRole('article', { name: 'Previous order restored', exact: true });
    await expect(restored).toBeVisible();
    await expect(restored).toContainText('Pinned > New > Recents');
    const prefs = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'prefs.json'), 'utf8'));
    expect(prefs.projects_group_order).toEqual(['pinned', 'new', 'recents']);
    expect(prefs.confirm_project_remove).toBe(false);
    await restored.getByRole('button', { name: 'View options', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'View options', exact: true });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await expect(restored).toBeHidden();
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('action failures stay visible for retry and do not dismiss a later result', async () => {
    const card = await saveOrder();
    await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('app.setUserPreferences');
        ipcMain.handle('app.setUserPreferences', () => ({ success: false, error: { type: 'Error', message: 'write-failed' } }));
    });
    await card.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(card.getByRole('alert')).toHaveText('The action could not be completed. Please try again.');
    await page.getByTestId('projectsTitle').click();
    await page.waitForTimeout(6500);
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: 'Undo', exact: true })).toBeEnabled();
    await restorePreferences();
    await card.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Previous order restored', exact: true })).toBeVisible();
});

test('a modal pauses the timer and notifications match both approved themes', async () => {
    const card = await saveOrder();
    await card.hover();
    for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
        await page.waitForTimeout(300);
        await page.screenshot({ path: test.info().outputPath(`notification-${theme}.png`) });
    }
    const modal = await openOptions();
    await page.waitForTimeout(6500);
    await expect(card).toBeVisible();
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(card).toBeHidden({ timeout: 7500 });
});

test('a pending action runs once and pauses dismissal until its result replaces the card', async () => {
    const card = await saveOrder();
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { notificationHandlers: Map<string, (...args: unknown[]) => unknown>; notificationActionWrites: number };
        const original = ipc.notificationHandlers.get('app.setUserPreferences')!;
        ipc.notificationActionWrites = 0;
        ipcMain.removeHandler('app.setUserPreferences');
        ipcMain.handle('app.setUserPreferences', async (event, ...args) => {
            ipc.notificationActionWrites += 1;
            await new Promise(resolve => setTimeout(resolve, 9000));
            return original(event, ...args);
        });
    });
    await card.getByRole('button', { name: 'Undo', exact: true }).dblclick();
    await page.getByTestId('inputProjectSearch').click();
    await page.waitForTimeout(6500);
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    await expect(page.getByRole('article', { name: 'Previous order restored', exact: true })).toBeVisible({ timeout: 5000 });
    expect(await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { notificationActionWrites: number }).notificationActionWrites)).toBe(1);
});

test('document visibility changes pause and resume the remaining notification time', async () => {
    const card = await saveOrder();
    await page.waitForTimeout(1000);
    // Playwright keeps the native page visible, so drive its visibility signal explicitly.
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    try {
        await page.waitForTimeout(6500);
        await expect(card).toBeVisible();
    } finally {
        await page.evaluate(() => {
            Reflect.deleteProperty(document, 'hidden');
            document.dispatchEvent(new Event('visibilitychange'));
        });
    }
    await expect(card).toBeVisible();
    await page.getByTestId('projectsTitle').hover();
    await expect(card).toBeHidden({ timeout: 4000 });
});
