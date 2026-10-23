import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Page, test } from './support/electron.fixture';
import { getMainWindow } from './splashscreen/getMainWindow';
import { SAMPLE_PREFS, SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { applyTheme, createFixtureHome, prepareAppWithStubbedData, writeJson } from './support/e2e-fixture-runtime';
import { THEMES } from './support/e2e-fixture-theme';

let app: ElectronApplication;
let page: Page;
let home: string;
const channels = ['projects.getProjectsDetails', 'projects.clearProjectNewStatus', 'projects.undoClearProjectNewStatus', 'projects.setProjectPinned', 'projects.removeProject'];
test.describe.configure({ mode: 'serial' });
test.setTimeout(60000);

test.beforeEach(async () => {
    home = await createFixtureHome();
    const prototype = SAMPLE_PROJECTS.find((project) => project.name === 'My Prototype')!;
    await writeJson(path.join(home, '.gd-launcher', 'projects.json'), [
        ...SAMPLE_PROJECTS,
        { ...prototype, name: 'Second Prototype', path: '/fixture/second-prototype' },
    ]);
    await writeJson(path.join(home, '.gd-launcher', 'project-tags.json'), { tags: [{ id: 'prototype', name: 'Prototype', colour: 0 }], assignments: { [prototype.path]: ['prototype'] } });
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
    await expect(row('Second Prototype')).toBeVisible();
});
test.afterEach(async () => {
    await app?.close();
    if (home) await fs.rm(home, { recursive: true, force: true });
});

/** Finds a project independently of its view or current section.
 * @param name - Project display name.
 */
function row(name: string) {
    return page.locator('li[data-project-path]').filter({ hasText: name });
}
/** Opens the aggregate selection actions. */
async function actions() {
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    return page.getByRole('dialog', { name: 'Actions', exact: true });
}
/** Selects the visible New subset through the shared Actions menu. */
async function selectNew() {
    await page.getByRole('button', { name: 'Enable multi-select', exact: true }).click();
    const menu = await actions();
    await menu.getByRole('button', { name: 'Select New shown', exact: true }).click();
    await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
}
/** Runs the reviewed eligible clear operation. */
async function clearSelected() {
    const menu = await actions();
    await menu.getByRole('button', { name: 'Mark as not new (2)', exact: true }).click();
    const result = page.getByRole('article', { name: 'Projects', exact: true });
    await expect(result).toBeVisible();
    await result.hover();
    return result;
}
/** Reads real persisted projects, preserving original launch-history fields. */
async function stored() {
    return JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'projects.json'), 'utf8')) as { name: string; is_new: boolean; last_opened: string | null }[];
}
/** Saves an optional private Electron preview.
 * @param name - Screenshot filename.
 */
async function screenshot(name: string) {
    const directory = process.env.GODOT_LAUNCHER_PREVIEW_DIR;
    if (!directory) return;
    await fs.mkdir(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, name) });
}

test('selection survives view/section moves, clears on search and drops removed records', async () => {
    await selectNew();
    for (const mode of ['tabProjectList', 'tabProjectDenseList', 'tabProjectCards']) {
        await page.getByTestId(mode).click();
        await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
        await expect(page.getByRole('checkbox', { name: 'Select My Prototype', exact: true })).toBeChecked();
    }
    await row('My Prototype').getByTestId('btnToggleProjectPinned').click();
    await expect(row('My Prototype')).toHaveAttribute('data-project-section', 'pinned');
    await expect(page.getByRole('checkbox', { name: 'Select My Prototype', exact: true })).toBeChecked();
    await page.getByTestId('inputProjectSearch').fill('Second');
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
    let menu = await actions();
    await menu.getByRole('button', { name: 'Select all shown', exact: true }).click();
    await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
    // An external registration removal must prune the selected path.
    await app.evaluate(async ({ ipcMain, BrowserWindow }) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown> };
        const sender = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().startsWith('http://localhost:5123'))!.webContents;
        const event = { sender, senderFrame: sender.mainFrame };
        const response = await ipc.selectionHandlers.get('projects.getProjectsDetails')!(event) as { data: { name: string }[] };
        await ipc.selectionHandlers.get('projects.removeProject')!(event, response.data.find((project) => project.name === 'Second Prototype'));
    });
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
    await page.getByTestId('inputProjectSearch').fill('');
    menu = await actions();
    await expect(menu.getByRole('button', { name: 'Mark as not new (0)', exact: true })).toBeDisabled();
});

for (const [mode, theme] of [['tabProjectCards', 0], ['tabProjectList', 1], ['tabProjectDenseList', 0]] as const) {
    test(`clears and undoes a mixed selection through real persistence in ${mode}`, async () => {
        await page.getByTestId(mode).click();
        await applyTheme(page, THEMES[theme]);
        const before = await stored();
        await page.getByRole('button', { name: 'Enable multi-select', exact: true }).click();
        await (await actions()).getByRole('button', { name: 'Select all shown', exact: true }).click();
        await expect(page.getByText('4 selected', { exact: true })).toBeVisible();
        await actions();
        await screenshot(`projects-selection-${mode}-${theme}.png`);
        await page.getByRole('button', { name: 'Mark as not new (2)', exact: true }).click();
        let result = page.getByRole('article', { name: 'Projects', exact: true });
        await expect(result).toContainText('New status cleared: 2.');
        await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeFocused();
        await result.hover();
        await expect(row('My Prototype')).toHaveAttribute('data-project-section', 'recents');
        await expect(page.getByText('4 selected', { exact: true })).toBeVisible();
        const after = await stored();
        expect(after.map((project) => [project.name, project.last_opened])).toEqual(before.map((project) => [project.name, project.last_opened]));
        expect(after.filter((project) => project.is_new)).toHaveLength(0);
        await screenshot(`projects-cleared-${mode}-${theme}.png`);
        await result.getByRole('button', { name: 'Undo', exact: true }).click();
        result = page.getByRole('article', { name: 'Projects', exact: true });
        await expect(result).toContainText('New status restored: 2.');
        await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeFocused();
        expect((await stored()).filter((project) => project.is_new)).toHaveLength(2);
        await page.reload();
        await page.getByTestId('btnProjects').click();
        await expect(row('My Prototype')).toHaveAttribute('data-project-section', 'new');
        await expect(page.getByRole('button', { name: 'Enable multi-select', exact: true })).toBeVisible();
        await expect(page.getByRole('checkbox', { name: /^Select / })).toHaveCount(0);
    });
}

test('names partial failures and retries only failed clears and Undo tokens', async () => {
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown>; selectionCalls: string[] };
        ipc.selectionCalls = [];
        for (const channel of ['projects.clearProjectNewStatus', 'projects.undoClearProjectNewStatus']) {
            const original = ipc.selectionHandlers.get(channel)!;
            let attempts = 0;
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, async (event, ...args) => {
                ipc.selectionCalls.push(channel === 'projects.clearProjectNewStatus' ? (args[0] as { name: string }).name : 'undo');
                if (++attempts === 2) return { success: false, error: { type: 'Error', message: 'write-failed' } };
                return original(event, ...args);
            });
        }
    });
    await selectNew();
    let result = await clearSelected();
    await expect(result).toContainText('New status cleared: 1.');
    await expect(result).toContainText('Failed: Second Prototype: write-failed');
    await result.getByRole('button', { name: 'Retry clearing New', exact: true }).click();
    result = page.getByRole('article', { name: 'Projects', exact: true });
    await expect(result).toContainText('New status cleared: 2.');
    await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeFocused();
    await result.getByRole('button', { name: 'Undo', exact: true }).click();
    result = page.getByRole('article', { name: 'Projects', exact: true });
    await expect(result).toContainText('New status restored: 1.');
    await expect(result).toContainText('Second Prototype: write-failed');
    await result.getByRole('button', { name: 'Retry Undo', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Projects', exact: true })).toContainText('New status restored: 2.');
    const calls = await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { selectionCalls: string[] }).selectionCalls);
    expect(calls).toEqual(['My Prototype', 'Second Prototype', 'Second Prototype', 'undo', 'undo', 'undo']);
});

test('blocks repeated pending submissions and preserves newer notification feedback', async () => {
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown>; releaseSelection: () => void; clearCalls: number };
        const original = ipc.selectionHandlers.get('projects.clearProjectNewStatus')!;
        const wait = new Promise<void>((resolve) => { ipc.releaseSelection = resolve; });
        ipc.clearCalls = 0;
        ipcMain.removeHandler('projects.clearProjectNewStatus');
        ipcMain.handle('projects.clearProjectNewStatus', async (...args) => {
            ipc.clearCalls++;
            const saved = await original(...args);
            await wait;
            return saved;
        });
    });
    await selectNew();
    await (await actions()).getByRole('button', { name: 'Mark as not new (2)', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: 'Select My Prototype', exact: true })).toBeDisabled();
    await page.getByTestId('btnProjectViewOptions').click();
    const modal = page.getByRole('dialog', { name: 'View options', exact: true });
    const group = modal.getByRole('button', { name: 'Reorder New', exact: true });
    await group.press('Space'); await group.press('ArrowUp'); await group.press('Space');
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    const newer = page.getByRole('article', { name: 'Group order saved', exact: true });
    await expect(newer).toBeVisible();
    await newer.hover();
    await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { releaseSelection: () => void }).releaseSelection());
    await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeEnabled();
    await expect(newer).toBeVisible();
    await expect(page.getByRole('article', { name: 'Projects', exact: true })).toHaveCount(0);
    expect(await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { clearCalls: number }).clearCalls)).toBe(2);
});


test('keyboard selection and manual project-tag filters clear the previous selection', async () => {
    await selectNew();
    await (await actions()).getByRole('button', { name: 'Clear selection', exact: true }).click();
    const checkbox = page.getByRole('checkbox', { name: 'Select My Prototype', exact: true });
    await checkbox.focus();
    await checkbox.press('Space');
    await expect(checkbox).toBeChecked();
    await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
    await page.getByTestId('btnFilterProjectTags').click();
    let popup = page.getByRole('dialog', { name: 'Tags', exact: true });
    await popup.getByRole('combobox').fill('Prototype');
    await popup.getByRole('combobox').press('Enter');
    await expect(row('Second Prototype')).toHaveCount(0);
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
    await popup.getByRole('combobox').press('Escape');
    await (await actions()).getByRole('button', { name: 'Select all shown', exact: true }).click();
    await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
    await page.getByTestId('btnFilterProjectTags').click();
    popup = page.getByRole('dialog', { name: 'Tags', exact: true });
    await popup.getByRole('button', { name: 'Clear tags', exact: true }).click();
    await expect(row('Second Prototype')).toBeVisible();
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
});

test('Undo cannot restore a removed project and still restores the remaining successful clear', async () => {
    await selectNew();
    await clearSelected();
    await app.evaluate(async ({ ipcMain, BrowserWindow }) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown> };
        const sender = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().startsWith('http://localhost:5123'))!.webContents;
        const event = { sender, senderFrame: sender.mainFrame };
        const response = await ipc.selectionHandlers.get('projects.getProjectsDetails')!(event) as { data: { name: string }[] };
        await ipc.selectionHandlers.get('projects.removeProject')!(event, response.data.find((project) => project.name === 'Second Prototype'));
    });
    await expect(row('Second Prototype')).toHaveCount(0);
    await page.getByRole('article', { name: 'Projects', exact: true }).getByRole('button', { name: 'Undo', exact: true }).click();
    const result = page.getByRole('article', { name: 'Projects', exact: true });
    await expect(result).toContainText('New status restored: 1.');
    await expect(result).toContainText('Second Prototype:');
    expect((await stored()).find((project) => project.name === 'My Prototype')?.is_new).toBe(true);
    expect((await stored()).some((project) => project.name === 'Second Prototype')).toBe(false);
});
