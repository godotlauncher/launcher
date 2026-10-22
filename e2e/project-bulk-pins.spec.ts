import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';
import { getMainWindow } from './splashscreen/getMainWindow';
import { SAMPLE_PREFS, SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { applyTheme, createFixtureHome, prepareAppWithStubbedData, writeJson } from './support/e2e-fixture-runtime';
import { THEMES } from './support/e2e-fixture-theme';

let app: ElectronApplication;
let page: Page;
let home: string;
const channels = ['projects.getProjectsDetails', 'projects.clearProjectNewStatus', 'projects.undoClearProjectNewStatus', 'projects.setProjectPinned', 'projects.removeProject', 'projects.reorderPinnedProjects'];
test.describe.configure({ mode: 'serial' });
test.setTimeout(60000);

test.beforeEach(async () => {
    home = await createFixtureHome();
    const prototype = SAMPLE_PROJECTS.find((project) => project.name === 'My Prototype')!;
    const existingA = SAMPLE_PROJECTS.find(project => project.name === 'My Awesome Game')!;
    const existingB = SAMPLE_PROJECTS.find(project => project.name === 'My Other Game')!;
    await writeJson(path.join(home, '.gd-launcher', 'projects.json'), [
        { ...prototype, name: 'Gamma', path: '/fixture/gamma', added_at: new Date('2026-10-20T10:00:00Z') },
        { ...existingB, pinned: true, pinned_order: 1 },
        { ...prototype, name: 'Alpha', path: '/fixture/alpha', added_at: new Date('2026-10-20T12:00:00Z') },
        { ...existingA, pinned: true, pinned_order: 0 },
        { ...prototype, name: 'Beta', path: '/fixture/beta', added_at: new Date('2026-10-20T11:00:00Z') },
        { ...existingB, name: 'Older Unpinned', path: '/fixture/older', pinned: false, pinned_order: undefined },
    ]);
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env: { ...env, GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home } });
    page = await getMainWindow(app);
    await app.evaluate(({ ipcMain }, names) => {
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown>; selectionHandlers: Map<string, (...args: unknown[]) => unknown> };
        ipc.selectionHandlers = new Map(names.map((name) => [name, ipc._invokeHandlers.get(name)!]));
    }, channels);
    await prepareAppWithStubbedData(page, app, { preferences: { ...SAMPLE_PREFS, language: 'en' } });
    await app.evaluate(({ ipcMain, BrowserWindow }) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown> };
        for (const [name, handler] of ipc.selectionHandlers) { ipcMain.removeHandler(name); ipcMain.handle(name, handler); }
        for (const window of BrowserWindow.getAllWindows()) {
            const contents = window.webContents as typeof window.webContents & { __e2eFixtureProjects?: unknown };
            contents.__e2eFixtureProjects = undefined;
        }
    });
    await page.reload();
    await page.getByTestId('btnProjects').click();
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(row('Gamma')).toBeVisible();
});
test.afterEach(async () => {
    await app?.close();
    if (home) await fs.rm(home, { recursive: true, force: true });
});

/** Finds one project in any presentation.
 * @param name - Fixture display name.
 */
function row(name: string) { return page.locator('li[data-project-path]').filter({ hasText: name }); }
/** Opens the selected-project Actions menu. */
async function actions() {
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    return page.getByRole('dialog', { name: 'Actions', exact: true });
}
/** Selects every shown project or just the New subset.
 * @param all - Whether to include existing pins and recents.
 */
async function select(all = false) {
    await page.getByRole('button', { name: 'Enable multi-select', exact: true }).click();
    await (await actions()).getByRole('button', { name: all ? 'Select all shown' : 'Select New shown', exact: true }).click();
    await expect(page.getByText(`${all ? 6 : 3} selected`, { exact: true })).toBeVisible();
}
/** Reads actual persisted project records. */
async function stored() {
    return JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'projects.json'), 'utf8')) as { name: string; path: string; pinned?: boolean; pinned_order?: number; is_new?: boolean; last_opened: string | null; added_at?: string }[];
}
/** Reads actual rendered pinned order using project identities. */
async function pinnedNames() {
    const paths = await page.locator('li[data-project-section="pinned"]').evaluateAll(elements => elements.map(element => element.getAttribute('data-project-path')));
    const projects = await stored();
    return paths.map(path => projects.find(project => project.path === path)!.name);
}
/** Waits for one aggregate result and restored toolbar focus.
 * @param text - Expected result text.
 */
async function result(text: string) {
    const notification = page.getByRole('article', { name: 'Projects', exact: true });
    await expect(notification).toContainText(text);
    await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeFocused();
    await notification.hover();
    return notification;
}
/** Installs selected save/order failures and records actual mutation attempts.
 * @param unpin - Whether the per-project failure is an Unpin failure.
 * @param failOrder - Whether the first necessary order repair should fail too.
 */
async function failures(unpin = false, failOrder = false) {
    await app.evaluate(({ ipcMain }, { unpin, failOrder }) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown>; pinCalls: string[]; orderCalls: number };
        const originalPin = ipc.selectionHandlers.get('projects.setProjectPinned')!;
        const originalOrder = ipc.selectionHandlers.get('projects.reorderPinnedProjects')!;
        ipc.pinCalls = []; ipc.orderCalls = 0;
        let failed = false;
        ipcMain.removeHandler('projects.setProjectPinned');
        ipcMain.handle('projects.setProjectPinned', async (event, ...args) => {
            const project = args[0] as { name: string };
            ipc.pinCalls.push(`${project.name}:${String(args[1])}`);
            if (!failed && project.name === (unpin ? 'My Other Game' : 'Beta')) {
                failed = true;
                return { success: false, error: { type: 'Error', message: 'write-failed' } };
            }
            return originalPin(event, ...args);
        });
        ipcMain.removeHandler('projects.reorderPinnedProjects');
        ipcMain.handle('projects.reorderPinnedProjects', async (...args) => {
            if (++ipc.orderCalls === 1 && failOrder) return { success: false, error: { type: 'Error', message: 'order-failed' } };
            return originalOrder(...args);
        });
    }, { unpin, failOrder });
}

for (const [mode, theme] of [['tabProjectCards', 0], ['tabProjectList', 1], ['tabProjectDenseList', 0]] as const) {
    test(`selects visible sections independently with mixed and keyboard states in ${mode}`, async () => {
        await page.getByTestId(mode).click();
        await applyTheme(page, THEMES[theme]);
        const section = (name: string) => page.getByRole('checkbox', { name, exact: true });
        await expect(section('New')).toHaveCount(0);
        await page.getByRole('button', { name: 'Enable multi-select', exact: true }).click();
        await expect(page.getByTestId('btnReorderPinnedProject')).toHaveCount(0);
        await section('New').check();
        await expect(page.getByText('3 selected', { exact: true })).toBeVisible();
        await expect(section('New')).toBeChecked();
        await expect(section('Pinned')).not.toBeChecked();
        await expect(section('Recents')).not.toBeChecked();
        await section('Select Alpha').uncheck();
        await expect(section('New')).toHaveJSProperty('indeterminate', true);
        await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
        await page.screenshot({ path: test.info().outputPath(`section-selection-${mode}.png`), animations: 'disabled' });
        await section('New').focus();
        await page.keyboard.press('Space');
        await expect(section('New')).toBeChecked();
        await expect(section('New')).toHaveJSProperty('indeterminate', false);
        await section('Pinned').check();
        await expect(page.getByText('5 selected', { exact: true })).toBeVisible();
        await section('New').uncheck();
        await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
        await expect(section('Pinned')).toBeChecked();
        await section('Recents').check();
        await section('Pinned').uncheck();
        await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
        await expect(section('Select Older Unpinned')).toBeChecked();
        await page.getByTestId('inputProjectSearch').fill('Alpha');
        await expect(section('Pinned')).toHaveCount(0);
        await expect(section('New')).not.toBeChecked();
        await section('New').check();
        await expect(section('Select Alpha')).toBeChecked();
        await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Disable multi-select', exact: true }).click();
        await expect(section('New')).toHaveCount(0);
        await page.getByTestId('inputProjectSearch').fill('');
        await expect(page.getByTestId('btnReorderPinnedProject')).toHaveCount(2);
    });
    test(`pins and unpins only eligible projects in display order in ${mode}`, async () => {
        await page.getByTestId(mode).click();
        await applyTheme(page, THEMES[theme]);
        const before = await stored();
        await select(true);
        let menu = await actions();
        await expect(menu.getByRole('button', { name: 'Pin (4)', exact: true })).toBeEnabled();
        await expect(menu.getByRole('button', { name: 'Unpin (2)', exact: true })).toBeEnabled();
        await page.screenshot({ path: test.info().outputPath(`bulk-pins-${mode}-${theme}.png`), animations: 'disabled' });
        await menu.getByRole('button', { name: 'Pin (4)', exact: true }).click();
        await result('Projects pinned: 4.');
        await expect.poll(pinnedNames).toEqual(['Alpha', 'Beta', 'Gamma', 'Older Unpinned', 'My Awesome Game', 'My Other Game']);
        await expect(page.getByText('6 selected', { exact: true })).toBeVisible();
        for (const view of ['tabProjectList', 'tabProjectCards', mode]) {
            await page.getByTestId(view).click();
            await expect(page.getByRole('checkbox', { name: 'Select Alpha', exact: true })).toBeChecked();
        }
        menu = await actions();
        await expect(menu.getByRole('button', { name: 'Pin (0)', exact: true })).toBeDisabled();
        await menu.getByRole('button', { name: 'Unpin (6)', exact: true }).click();
        await result('Projects unpinned: 6.');
        await expect.poll(pinnedNames).toEqual([]);
        await expect(row('Alpha')).toHaveAttribute('data-project-section', 'new');
        await expect(page.getByText('6 selected', { exact: true })).toBeVisible();
        expect((await stored()).map(project => [project.name, project.last_opened, project.is_new, project.added_at]).sort()).toEqual(before.map(project => [project.name, project.last_opened, project.is_new, project.added_at]).sort());
        menu = await actions();
        await expect(menu.getByRole('button', { name: 'Unpin (0)', exact: true })).toBeDisabled();
        await page.keyboard.press('Escape');
        await page.reload();
        await page.getByTestId('btnProjects').click();
        await expect.poll(pinnedNames).toEqual([]);
        expect((await stored()).every(project => !project.pinned)).toBe(true);
    });
}

test('uses the current section display order when recents are moved before New', async () => {
    await page.getByTestId('btnProjectViewOptions').click();
    const modal = page.getByRole('dialog', { name: 'View options', exact: true });
    const recent = modal.getByRole('button', { name: 'Reorder Recents', exact: true });
    await recent.press('Space'); await recent.press('ArrowUp'); await recent.press('ArrowUp'); await recent.press('Space');
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    await select(true);
    await (await actions()).getByRole('button', { name: 'Pin (4)', exact: true }).click();
    await result('Projects pinned: 4.');
    await expect.poll(pinnedNames).toEqual(['Older Unpinned', 'Alpha', 'Beta', 'Gamma', 'My Awesome Game', 'My Other Game']);
});

test('retries a failed middle pin and then retries ordering without repinning successes', async () => {
    await failures(false, true);
    await select();
    await (await actions()).getByRole('button', { name: 'Pin (3)', exact: true }).click();
    let notification = await result('Beta: write-failed');
    await expect.poll(pinnedNames).toEqual(['Alpha', 'Gamma', 'My Awesome Game', 'My Other Game']);
    await notification.getByRole('button', { name: 'Retry', exact: true }).click();
    notification = await result('Could not save pinned order: order-failed');
    await expect(notification).toContainText('Projects pinned: 3.');
    await notification.getByRole('button', { name: 'Retry', exact: true }).click();
    await result('Projects pinned: 3.');
    await expect.poll(pinnedNames).toEqual(['Alpha', 'Beta', 'Gamma', 'My Awesome Game', 'My Other Game']);
    const calls = await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { pinCalls: string[]; orderCalls: number };
        return { pins: ipc.pinCalls, orders: ipc.orderCalls };
    });
    expect(calls).toEqual({ pins: ['Gamma:true', 'Beta:true', 'Alpha:true', 'Beta:true'], orders: 2 });
    await expect(page.getByText('3 selected', { exact: true })).toBeVisible();
    await page.reload(); await page.getByTestId('btnProjects').click();
    await expect.poll(pinnedNames).toEqual(['Alpha', 'Beta', 'Gamma', 'My Awesome Game', 'My Other Game']);
});

test('retries failed Unpin targets without inverting or changing unpinned projects', async () => {
    await failures(true);
    await select(true);
    await (await actions()).getByRole('button', { name: 'Unpin (2)', exact: true }).click();
    const notification = await result('My Other Game: write-failed');
    await expect(notification).toContainText('Projects unpinned: 1.');
    await notification.getByRole('button', { name: 'Retry', exact: true }).click();
    await result('Projects unpinned: 2.');
    await expect.poll(pinnedNames).toEqual([]);
    expect(await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { pinCalls: string[] }).pinCalls)).toEqual(['My Awesome Game:false', 'My Other Game:false', 'My Other Game:false']);
});

test('blocks pending repeats and an older New Undo while preserving newer feedback', async () => {
    await select();
    await (await actions()).getByRole('button', { name: 'Mark as not new (3)', exact: true }).click();
    const old = await result('New status cleared: 3.');
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown>; releasePins: () => void; pinCalls: number; undoCalls: number };
        const pin = ipc.selectionHandlers.get('projects.setProjectPinned')!;
        const undo = ipc.selectionHandlers.get('projects.undoClearProjectNewStatus')!;
        const wait = new Promise<void>(resolve => { ipc.releasePins = resolve; });
        ipc.pinCalls = 0; ipc.undoCalls = 0;
        ipcMain.removeHandler('projects.setProjectPinned');
        ipcMain.handle('projects.setProjectPinned', async (...args) => { ipc.pinCalls++; const saved = await pin(...args); await wait; return saved; });
        ipcMain.removeHandler('projects.undoClearProjectNewStatus');
        ipcMain.handle('projects.undoClearProjectNewStatus', async (...args) => { ipc.undoCalls++; return undo(...args); });
    });
    await (await actions()).getByRole('button', { name: 'Pin (3)', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: 'Select Gamma', exact: true })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: 'Pinned', exact: true })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: 'Recents', exact: true })).toBeDisabled();
    await old.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.getByTestId('btnProjectViewOptions').click();
    const modal = page.getByRole('dialog', { name: 'View options', exact: true });
    const group = modal.getByRole('button', { name: 'Reorder New', exact: true });
    await group.press('Space'); await group.press('ArrowUp'); await group.press('Space');
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    const newer = page.getByRole('article', { name: 'Group order saved', exact: true });
    await expect(newer).toBeVisible(); await newer.hover();
    await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { releasePins: () => void }).releasePins());
    await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeEnabled();
    expect(await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { pinCalls: number; undoCalls: number };
        return [ipc.pinCalls, ipc.undoCalls];
    })).toEqual([3, 0]);
    await expect(newer).toBeVisible();
    await expect(page.getByRole('article', { name: 'Projects', exact: true })).toHaveCount(0);
});


test('reports a removed pending target and never substitutes another unpinned project', async () => {
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown>; releasePins: () => void; pinCalls: string[] };
        const original = ipc.selectionHandlers.get('projects.setProjectPinned')!;
        const wait = new Promise<void>(resolve => { ipc.releasePins = resolve; });
        ipc.pinCalls = [];
        ipcMain.removeHandler('projects.setProjectPinned');
        ipcMain.handle('projects.setProjectPinned', async (event, ...args) => {
            ipc.pinCalls.push((args[0] as { name: string }).name);
            const saved = await original(event, ...args);
            await wait;
            return saved;
        });
    });
    await select();
    await (await actions()).getByRole('button', { name: 'Pin (3)', exact: true }).click();
    await expect(row('Gamma')).toHaveAttribute('data-project-section', 'pinned');
    await app.evaluate(async ({ ipcMain, BrowserWindow }) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown>; releasePins: () => void };
        const sender = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('http://localhost:5123'))!.webContents;
        const event = { sender, senderFrame: sender.mainFrame };
        const response = await ipc.selectionHandlers.get('projects.getProjectsDetails')!(event) as { data: { name: string }[] };
        await ipc.selectionHandlers.get('projects.removeProject')!(event, response.data.find(project => project.name === 'Beta'));
        ipc.releasePins();
    });
    let notification = await result('Beta: This project is no longer available.');
    await expect(notification).toContainText('Projects pinned: 2.');
    await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
    await expect(row('Older Unpinned')).toHaveAttribute('data-project-section', 'recents');
    await notification.getByRole('button', { name: 'Retry', exact: true }).click();
    notification = await result('Beta: This project is no longer available.');
    expect(await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { pinCalls: string[] }).pinCalls)).toEqual(['Gamma', 'Alpha']);
});

test('a delayed final reply cannot restore a newer removed project', async () => {
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown>; releasePins: () => void };
        const original = ipc.selectionHandlers.get('projects.setProjectPinned')!;
        const wait = new Promise<void>(resolve => { ipc.releasePins = resolve; });
        ipcMain.removeHandler('projects.setProjectPinned');
        ipcMain.handle('projects.setProjectPinned', async (...args) => { const saved = await original(...args); await wait; return saved; });
    });
    await page.getByRole('button', { name: 'Enable multi-select', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Select Alpha', exact: true }).check();
    await (await actions()).getByRole('button', { name: 'Pin (1)', exact: true }).click();
    await expect(row('Alpha')).toHaveAttribute('data-project-section', 'pinned');
    await app.evaluate(async ({ ipcMain, BrowserWindow }) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown>; releasePins: () => void };
        const sender = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('http://localhost:5123'))!.webContents;
        const event = { sender, senderFrame: sender.mainFrame };
        const response = await ipc.selectionHandlers.get('projects.getProjectsDetails')!(event) as { data: { name: string }[] };
        await ipc.selectionHandlers.get('projects.removeProject')!(event, response.data.find(project => project.name === 'Beta'));
    });
    await expect(row('Beta')).toHaveCount(0);
    await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { releasePins: () => void }).releasePins());
    await result('Projects pinned: 1.');
    await expect(row('Beta')).toHaveCount(0);
});

test('keeps pending controls guarded after leaving and returning to Projects', async () => {
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown>; releasePins: () => void; pinCalls: number };
        const original = ipc.selectionHandlers.get('projects.setProjectPinned')!;
        const wait = new Promise<void>(resolve => { ipc.releasePins = resolve; });
        ipc.pinCalls = 0;
        ipcMain.removeHandler('projects.setProjectPinned');
        ipcMain.handle('projects.setProjectPinned', async (...args) => { ipc.pinCalls++; const saved = await original(...args); await wait; return saved; });
    });
    await select();
    await (await actions()).getByRole('button', { name: 'Pin (3)', exact: true }).click();
    await expect(row('Gamma')).toHaveAttribute('data-project-section', 'pinned');
    await page.getByTestId('btnInstalls').click();
    await page.getByTestId('btnProjects').click();
    await expect(page.getByRole('button', { name: 'Enable multi-select', exact: true })).toBeDisabled();
    await expect(row('Alpha').getByTestId('btnToggleProjectPinned').click({ trial: true, timeout: 500 })).rejects.toThrow();
    await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { releasePins: () => void }).releasePins());
    await expect(page.getByRole('button', { name: 'Enable multi-select', exact: true })).toBeEnabled();
    await expect.poll(pinnedNames).toEqual(['Alpha', 'Beta', 'Gamma', 'My Awesome Game', 'My Other Game']);
    expect(await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { pinCalls: number }).pinCalls)).toBe(3);
});
