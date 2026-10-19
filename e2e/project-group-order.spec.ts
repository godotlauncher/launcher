import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, type Locator, type Page, expect, test } from '@playwright/test';
import { createFixtureHome, prepareAppWithStubbedData, setAppLanguage } from './support/e2e-fixture-runtime';
import { getMainWindow } from './splashscreen/getMainWindow';

let app: ElectronApplication;
let page: Page;
let home: string;
test.describe.configure({ mode: 'serial' });
const defaultNames = ['Pinned', 'New', 'Recents'];

/** Launches Electron with real disk-backed preferences and isolated project fixtures. */
async function launch() {
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env: { ...env, GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home } });
    page = await getMainWindow(app);
    await setAppLanguage(page, 'English');
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown>; groupOrderHandlers: Map<string, (...args: unknown[]) => unknown> };
        ipc.groupOrderHandlers = new Map(['app.getUserPreferences', 'app.setUserPreferences'].map(channel => [channel, ipc._invokeHandlers.get(channel)!]));
    });
    await prepareAppWithStubbedData(page, app);
    await restorePreferences();
    await page.reload();
    await page.getByTestId('btnProjects').click();
    await page.setViewportSize({ width: 1024, height: 700 });
}

/** Restores the real preference handlers after a fixture or simulated save failure. */
async function restorePreferences() {
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { groupOrderHandlers: Map<string, (...args: unknown[]) => unknown> };
        for (const [channel, handler] of ipc.groupOrderHandlers) {
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, handler);
        }
    });
}

/** Opens the view-options modal and returns its accessible locator. */
async function openOptions() {
    await page.getByRole('button', { name: 'View options', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'View options', exact: true });
    await expect(modal.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    return modal;
}

/** Reads the visible group headings without their project counts. */
async function groupNames() {
    return page.locator('section[aria-labelledby$="-projects-heading"]').evaluateAll(sections => sections.map(section => section.querySelector('h2')!.textContent!.replace(/\s*\d+\s*$/, '').trim()));
}

/** Moves a row with the keyboard and completes its sort.
 * @param row - Whole-row sorting button.
 * @param direction - Requested keyboard movement.
 */
async function moveRow(row: Locator, direction: 'ArrowUp' | 'ArrowDown') {
    await row.press('Space');
    await row.press(direction);
    await row.press('Space');
    await expect(row).not.toHaveAttribute('aria-grabbed', 'true');
}

test.beforeAll(async () => { home = await createFixtureHome(); await launch(); });
test.afterAll(async () => { await app?.close(); if (home) await fs.rm(home, { recursive: true, force: true }); });
test.beforeEach(async () => {
    await restorePreferences();
    await page.getByTestId('inputProjectSearch').fill('');
    await page.getByTestId('tabProjectCards').click();
    const modal = await openOptions();
    const restore = modal.getByRole('button', { name: 'Restore default order', exact: true });
    if (await restore.isEnabled()) {
        await restore.click();
        await modal.getByRole('button', { name: 'Save', exact: true }).click();
    } else await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(modal).toBeHidden();
});

test('defaults, drafts, Cancel, Escape and keyboard sorting preserve the saved order', async () => {
    expect(await groupNames()).toEqual(defaultNames);
    await expect(page.getByRole('button', { name: 'View options', exact: true })).toHaveText('');
    let modal = await openOptions();
    const rows = modal.getByRole('list', { name: 'Group order', exact: true }).getByRole('button');
    await expect(rows).toHaveText(defaultNames);
    await moveRow(modal.getByRole('button', { name: 'Reorder New', exact: true }), 'ArrowUp');
    await expect(rows).toHaveText(['New', 'Pinned', 'Recents']);
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await groupNames()).toEqual(defaultNames);
    await expect(page.getByRole('button', { name: 'View options', exact: true })).toBeFocused();

    modal = await openOptions();
    const pinned = modal.getByRole('button', { name: 'Reorder Pinned', exact: true });
    await pinned.press('Space');
    await pinned.press('ArrowDown');
    await pinned.press('Escape');
    await expect(modal).toBeVisible();
    await expect(rows).toHaveText(defaultNames);
    await expect(pinned).toBeFocused();
    await moveRow(pinned, 'ArrowDown');
    await modal.getByRole('button', { name: 'Restore default order', exact: true }).click();
    await expect(rows).toHaveText(defaultNames);
    await expect(modal.getByRole('button', { name: 'Restore default order', exact: true })).toBeDisabled();
    await moveRow(pinned, 'ArrowDown');
    await modal.press('Escape');
    await expect(modal).toBeHidden();
    expect(await groupNames()).toEqual(defaultNames);
});

test('whole-row pointer sorting is saved across layouts and an Electron restart', async () => {
    test.setTimeout(90000);
    const modal = await openOptions();
    const source = modal.getByRole('button', { name: 'Reorder Recents', exact: true });
    const target = modal.getByRole('button', { name: 'Reorder Pinned', exact: true });
    const sourceBounds = (await source.boundingBox())!;
    const targetBounds = (await target.boundingBox())!;
    await page.mouse.move(sourceBounds.x + sourceBounds.width * 0.75, sourceBounds.y + sourceBounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(sourceBounds.x + sourceBounds.width * 0.75, sourceBounds.y + 10, { steps: 5 });
    await expect(source).toHaveAttribute('aria-grabbed', 'true');
    await page.mouse.move(targetBounds.x + targetBounds.width * 0.75, targetBounds.y + 8, { steps: 15 });
    await page.mouse.up();
    await expect(modal.getByRole('list', { name: 'Group order', exact: true }).getByRole('button')).toHaveText(['Recents', 'Pinned', 'New']);
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(modal).toBeHidden();
    for (const mode of ['tabProjectCards', 'tabProjectList', 'tabProjectDenseList']) {
        await page.getByTestId(mode).click();
        expect(await groupNames()).toEqual(['Recents', 'Pinned', 'New']);
    }
    const prefs = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'prefs.json'), 'utf8'));
    expect(prefs.projects_group_order).toEqual(['recents', 'pinned', 'new']);
    await app.close();
    await launch();
    expect(await groupNames()).toEqual(['Recents', 'Pinned', 'New']);
    for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
        await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`project-group-headings-${theme}.png`) });
        await openOptions();
        await expect(page.getByRole('dialog', { name: 'View options', exact: true })).toBeInViewport({ ratio: 1 });
        await page.screenshot({ animations: 'disabled', path: test.info().outputPath(`project-group-order-${theme}.png`) });
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
});

test('a failed save retains the draft for retry and empty groups remain sortable', async () => {
    await page.getByTestId('inputProjectSearch').fill('Prototype');
    expect(await groupNames()).toEqual(['New']);
    const modal = await openOptions();
    const rows = modal.getByRole('list', { name: 'Group order', exact: true }).getByRole('button');
    await expect(rows).toHaveText(defaultNames);
    await moveRow(modal.getByRole('button', { name: 'Reorder Recents', exact: true }), 'ArrowUp');
    await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('app.setUserPreferences');
        ipcMain.handle('app.setUserPreferences', () => ({ success: false, error: { type: 'Error', message: 'write-failed' } }));
    });
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(modal.getByRole('alert')).toHaveText('Could not save the group order. Please try again.');
    await expect(rows).toHaveText(['Pinned', 'Recents', 'New']);
    const prefs = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'prefs.json'), 'utf8'));
    expect(prefs.projects_group_order).toEqual(['pinned', 'new', 'recents']);
    await restorePreferences();
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(modal).toBeHidden();
    await expect(page.getByTestId('inputProjectSearch')).toHaveValue('Prototype');
    await page.getByTestId('inputProjectSearch').fill('');
    expect(await groupNames()).toEqual(['Pinned', 'Recents', 'New']);
});
