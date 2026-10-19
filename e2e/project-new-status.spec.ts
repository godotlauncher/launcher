import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { SAMPLE_PREFS, SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { createFixtureHome, prepareAppWithStubbedData, writeJson } from './support/e2e-fixture-runtime';
import { getMainWindow } from './splashscreen/getMainWindow';

let app: ElectronApplication;
let page: Page;
let home: string;
const channels = ['projects.getProjectsDetails', 'projects.clearProjectNewStatus', 'projects.undoClearProjectNewStatus', 'projects.setProjectPinned'];
test.describe.configure({ mode: 'serial' });
test.setTimeout(60000);

/** Starts Electron with real project storage and its trusted preload handlers. */
async function launch() {
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env: { ...env, GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home } });
    page = await getMainWindow(app);
    await app.evaluate(({ ipcMain }, names) => {
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown>; newStatusHandlers: Map<string, (...args: unknown[]) => unknown> };
        ipc.newStatusHandlers = new Map(names.map(channel => [channel, ipc._invokeHandlers.get(channel)!]));
        const clear = ipc.newStatusHandlers.get('projects.clearProjectNewStatus')!;
        ipc.newStatusHandlers.set('projects.clearProjectNewStatus', async (...args) => {
            const result = await clear(...args) as { success: boolean; data?: { undoToken: string } };
            if (result.success && result.data) (ipc as typeof ipc & { newStatusUndoToken: string }).newStatusUndoToken = result.data.undoToken;
            return result;
        });
    }, channels);
    await prepareAppWithStubbedData(page, app, { preferences: { ...SAMPLE_PREFS, language: 'en' } });
    await restoreHandlers();
    await page.reload();
    await page.getByTestId('btnProjects').click();
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(projectRow('My Prototype')).toBeVisible();
}

/** Restores the real project operations after an injected failure or delay. */
async function restoreHandlers() {
    await app.evaluate(({ ipcMain, BrowserWindow }) => {
        const ipc = ipcMain as typeof ipcMain & { newStatusHandlers: Map<string, (...args: unknown[]) => unknown> };
        for (const [channel, handler] of ipc.newStatusHandlers) { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); }
        // Keep catalogue stubs while allowing authoritative project events through.
        for (const window of BrowserWindow.getAllWindows()) {
            const contents = window.webContents as typeof window.webContents & { __e2eFixtureProjects?: unknown };
            contents.__e2eFixtureProjects = undefined;
        }
    });
}

/** Finds one project in any of the three layouts.
 * @param name - Visible project name.
 */
function projectRow(name: string) {
    return page.locator('li[data-project-path]').filter({ hasText: name });
}

/** Opens a project's shared actions menu.
 * @param name - Visible project name.
 */
async function openActions(name = 'My Prototype') {
    await projectRow(name).getByTestId('btnProjectMoreOptions').click();
    const menu = page.getByRole('dialog', { name, exact: true });
    await expect(menu).toBeVisible();
    return menu;
}

/** Clears New through the real menu and waits for the persisted confirmation. */
async function clearNew() {
    const menu = await openActions();
    await menu.getByRole('button', { name: 'Mark as not new', exact: true }).click();
    const card = page.getByRole('article', { name: 'New status cleared', exact: true });
    await expect(card).toBeVisible();
    return card;
}

/** Reads the persisted state of the fixture project. */
async function storedPrototype() {
    const projects = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'projects.json'), 'utf8'));
    return projects.find((project: { name: string }) => project.name === 'My Prototype');
}

/** Delays an IPC reply after the main mutation, or delays a simulated failure.
 * @param channel - Project operation whose reply should wait.
 * @param fail - Whether to return a failure without applying the operation.
 */
async function delayReply(channel: string, fail = false) {
    await app.evaluate(({ ipcMain }, { channel, fail }) => {
        const ipc = ipcMain as typeof ipcMain & { newStatusHandlers: Map<string, (...args: unknown[]) => unknown>; finishNewStatusReply: () => void };
        const wait = new Promise<void>(resolve => { ipc.finishNewStatusReply = resolve; });
        const original = ipc.newStatusHandlers.get(channel)!;
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, async (event, ...args) => {
            const result = fail ? { success: false, error: { type: 'Error', message: 'write-failed' } } : await original(event, ...args);
            await wait;
            return result;
        });
    }, { channel, fail });
}

/** Releases the delayed response and lets its feedback settle in the renderer. */
async function releaseReply() {
    await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { finishNewStatusReply: () => void }).finishNewStatusReply());
    await page.waitForTimeout(300);
}

/** Saves another setting while the New-status response is delayed. */
async function saveGroupOrder() {
    await page.getByTestId('btnProjectViewOptions').click();
    const modal = page.getByRole('dialog', { name: 'View options', exact: true });
    const row = modal.getByRole('button', { name: 'Reorder New', exact: true });
    await row.press('Space'); await row.press('ArrowUp'); await row.press('Space');
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    const latest = page.getByRole('article', { name: 'Group order saved', exact: true });
    await expect(latest).toBeVisible();
    await latest.hover();
    return latest;
}

test.beforeAll(async () => {
    test.setTimeout(120000);
    home = await createFixtureHome();
    const source = SAMPLE_PROJECTS.find(project => project.name === 'My Prototype')!;
    await writeJson(path.join(home, '.gd-launcher', 'projects.json'), [
        ...SAMPLE_PROJECTS,
        { ...source, name: 'Imported Adventure', path: '/Users/docs/Godot/Projects/imported-adventure', is_new: false },
        { ...source, name: 'Legacy Unopened', path: '/Users/docs/Godot/Projects/legacy-unopened', is_new: undefined, added_at: undefined },
    ]);
    await launch();
});
test.afterAll(async () => { await app?.close(); if (home) await fs.rm(home, { recursive: true, force: true }); });

test.beforeEach(async () => {
    await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { finishNewStatusReply?: () => void }).finishNewStatusReply?.());
    await restoreHandlers();
    // Reset through real persisted operations, keeping each scenario's starting status identical.
    await app.evaluate(async ({ ipcMain, BrowserWindow }) => {
        const ipc = ipcMain as typeof ipcMain & { newStatusHandlers: Map<string, (...args: unknown[]) => unknown>; newStatusUndoToken?: string };
        const sender = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('http://localhost:5123'))!.webContents;
        const event = { sender, senderFrame: sender.mainFrame };
        const result = await ipc.newStatusHandlers.get('projects.getProjectsDetails')!(event) as { success: boolean; data: Array<{ name: string; is_new?: boolean; pinned?: boolean }> };
        if (!result.success) throw new Error('Could not read the real project fixture');
        let project = result.data.find(candidate => candidate.name === 'My Prototype')!;
        if (!project.is_new) {
            const restored = await ipc.newStatusHandlers.get('projects.undoClearProjectNewStatus')!(event, ipc.newStatusUndoToken) as { success: boolean; data: typeof project };
            if (!restored.success) throw new Error('Could not reset New through its real Undo');
            project = restored.data;
        }
        if (project.pinned) {
            const unpinned = await ipc.newStatusHandlers.get('projects.setProjectPinned')!(event, project, false) as { success: boolean };
            if (!unpinned.success) throw new Error('Could not reset the real project pin');
        }
    });
    await page.reload();
    await page.getByTestId('btnProjects').click();
    await expect(projectRow('My Prototype')).toBeVisible();
});

test('only explicitly new projects use New across all layouts, without fabricated dates', async () => {
    for (const mode of ['tabProjectCards', 'tabProjectList', 'tabProjectDenseList']) {
        await page.getByTestId(mode).click();
        await expect(projectRow('My Prototype')).toHaveAttribute('data-project-section', 'new');
        for (const name of ['Imported Adventure', 'Legacy Unopened']) {
            await expect(projectRow(name)).toHaveAttribute('data-project-section', 'recents');
            if (mode !== 'tabProjectDenseList') await expect(projectRow(name)).toContainText('Not opened yet');
            const menu = await openActions(name);
            await expect(menu.getByRole('button', { name: 'Mark as not new', exact: true })).toHaveCount(0);
            await menu.press('Escape');
        }
    }
});

test('Clear New and Undo move the project and restore useful focus in every layout', async () => {
    for (const mode of ['tabProjectCards', 'tabProjectList', 'tabProjectDenseList']) {
        await page.getByTestId(mode).click();
        const cleared = await clearNew();
        await expect(projectRow('My Prototype')).toHaveAttribute('data-project-section', 'recents');
        await expect(cleared).toContainText('My Prototype moved to Recents.');
        await expect(projectRow('My Prototype').getByTestId('btnProjectMoreOptions')).toBeFocused();
        expect(await storedPrototype()).toMatchObject({ is_new: false, last_opened: null });
        await cleared.getByRole('button', { name: 'Undo', exact: true }).click();
        const restored = page.getByRole('article', { name: 'New status restored', exact: true });
        await expect(restored).toBeVisible();
        await expect(restored).toContainText('My Prototype is back in New.');
        await expect(projectRow('My Prototype')).toHaveAttribute('data-project-section', 'new');
        await expect(projectRow('My Prototype').getByTestId('btnProjectMoreOptions')).toBeFocused();
        expect(await storedPrototype()).toMatchObject({ is_new: true, last_opened: null });
        await restored.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
    }
});

test('the project action dialog pauses the notification timeout', async () => {
    const cleared = await clearNew();
    const menu = await openActions('Imported Adventure');
    await page.waitForTimeout(3500);
    await expect(cleared).toBeVisible();
    await menu.press('Escape');
    await expect(cleared).toBeHidden({ timeout: 4500 });
});

for (const fail of [false, true]) {
    test(`a delayed Clear New ${fail ? 'failure' : 'success'} preserves newer feedback`, async () => {
        await delayReply('projects.clearProjectNewStatus', fail);
        const menu = await openActions();
        await menu.getByRole('button', { name: 'Mark as not new', exact: true }).click();
        const latest = await saveGroupOrder();
        await releaseReply();
        await expect(latest).toBeVisible();
        await expect(page.getByRole('article', { name: 'New status cleared', exact: true })).toHaveCount(0);
        await expect(page.getByRole('article', { name: 'Could not clear New status', exact: true })).toHaveCount(0);
        await expect(projectRow('My Prototype')).toHaveAttribute('data-project-section', fail ? 'new' : 'recents');
    });
}

test('delayed clear and Undo replies retain a newer pin update', async () => {
    await delayReply('projects.clearProjectNewStatus');
    const menu = await openActions();
    await menu.getByRole('button', { name: 'Mark as not new', exact: true }).click();
    await expect(projectRow('My Prototype')).toHaveAttribute('data-project-section', 'recents');
    await projectRow('My Prototype').getByTestId('btnToggleProjectPinned').click();
    await expect(projectRow('My Prototype')).toHaveAttribute('data-project-section', 'pinned');
    await releaseReply();
    const cleared = page.getByRole('article', { name: 'New status cleared', exact: true });
    await expect(cleared).toContainText('My Prototype stays in Pinned.');
    await expect(projectRow('My Prototype')).toHaveAttribute('data-project-section', 'pinned');
    await delayReply('projects.undoClearProjectNewStatus');
    await cleared.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect.poll(async () => (await storedPrototype()).is_new).toBe(true);
    await projectRow('My Prototype').getByTestId('btnToggleProjectPinned').click();
    await expect(projectRow('My Prototype')).toHaveAttribute('data-project-section', 'new');
    await releaseReply();
    await expect(page.getByRole('article', { name: 'New status restored', exact: true })).toContainText('My Prototype is back in New.');
    await expect(projectRow('My Prototype')).toHaveAttribute('data-project-section', 'new');
});

test('pinned projects keep their position, including a pin change made before Undo', async () => {
    await projectRow('My Prototype').getByTestId('btnToggleProjectPinned').click();
    await expect(projectRow('My Prototype')).toHaveAttribute('data-project-section', 'pinned');
    let cleared = await clearNew();
    await expect(cleared).toContainText('My Prototype stays in Pinned.');
    expect(await storedPrototype()).toMatchObject({ is_new: false, pinned: true, pinned_order: 0 });
    await cleared.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('article', { name: 'New status restored', exact: true })).toContainText('My Prototype is still pinned.');
    expect(await storedPrototype()).toMatchObject({ is_new: true, pinned: true, pinned_order: 0 });
    await projectRow('My Prototype').getByTestId('btnToggleProjectPinned').click();
    cleared = await clearNew();
    await projectRow('My Prototype').getByTestId('btnToggleProjectPinned').click();
    await cleared.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('article', { name: 'New status restored', exact: true })).toBeVisible();
    await expect(projectRow('My Prototype')).toHaveAttribute('data-project-section', 'pinned');
    expect(await storedPrototype()).toMatchObject({ is_new: true, pinned: true, pinned_order: 0 });
});



test('failed clear and Undo writes retain saved grouping and allow retry', async () => {
    await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('projects.clearProjectNewStatus');
        ipcMain.handle('projects.clearProjectNewStatus', () => ({ success: false, error: { type: 'Error', message: 'write-failed' } }));
    });
    const menu = await openActions();
    await menu.getByRole('button', { name: 'Mark as not new', exact: true }).click();
    const failed = page.getByRole('article', { name: 'Could not clear New status', exact: true });
    await expect(failed).toBeVisible();
    await expect(projectRow('My Prototype')).toHaveAttribute('data-project-section', 'new');
    expect((await storedPrototype()).is_new).toBe(true);
    await restoreHandlers();
    const cleared = await clearNew();
    await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('projects.undoClearProjectNewStatus');
        ipcMain.handle('projects.undoClearProjectNewStatus', () => ({ success: false, error: { type: 'Error', message: 'write-failed' } }));
    });
    await cleared.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(cleared.getByRole('alert')).toHaveText('The action could not be completed. Please try again.');
    await page.getByTestId('projectsTitle').click();
    await page.waitForTimeout(3500);
    await expect(cleared).toBeVisible();
    expect((await storedPrototype()).is_new).toBe(false);
    await restoreHandlers();
    await cleared.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(projectRow('My Prototype')).toHaveAttribute('data-project-section', 'new');
});

test('a completing Undo preserves a newer notification', async () => {
    const cleared = await clearNew();
    await delayReply('projects.undoClearProjectNewStatus');
    await cleared.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(cleared.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    const latest = await saveGroupOrder();
    await releaseReply();
    await expect(projectRow('My Prototype')).toHaveAttribute('data-project-section', 'new');
    await expect(latest).toBeVisible();
    await expect(page.getByRole('article', { name: 'New status restored', exact: true })).toHaveCount(0);
});

test('a later project removal update removes the obsolete Undo offer', async () => {
    await clearNew();
    await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().startsWith('http://localhost:5123'))!;
        // Drive the renderer event; main's stale-Undo rejection is covered separately.
        window.webContents.send('projects-updated', []);
    });
    await expect(page.getByRole('article', { name: 'New status cleared', exact: true })).toHaveCount(0);
});

test('clear and restored notifications match the approved light and dark surfaces', async () => {
    const cleared = await clearNew();
    await cleared.hover();
    for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
        await page.waitForTimeout(300);
        await page.screenshot({ path: test.info().outputPath(`clear-new-${theme}.png`) });
    }
    await cleared.getByRole('button', { name: 'Undo', exact: true }).click();
    const restored = page.getByRole('article', { name: 'New status restored', exact: true });
    await expect(restored).toBeVisible();
    await restored.hover();
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.waitForTimeout(300);
    await page.screenshot({ path: test.info().outputPath('restored-new-dark.png') });
});

test('cleared New persists after an Electron restart and its menu action stays absent', async () => {
    test.setTimeout(120000);
    await clearNew();
    await app.close();
    await launch();
    await expect(projectRow('My Prototype')).toHaveAttribute('data-project-section', 'recents');
    await expect(page.getByRole('article', { name: 'New status cleared', exact: true })).toHaveCount(0);
    const menu = await openActions();
    await expect(menu.getByRole('button', { name: 'Mark as not new', exact: true })).toHaveCount(0);
    expect(await storedPrototype()).toMatchObject({ is_new: false, last_opened: null });
});
