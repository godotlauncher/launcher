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
const channels = ['projects.getProjectsDetails', 'projects.clearProjectNewStatus', 'projects.undoClearProjectNewStatus', 'projects.setProjectPinned', 'projects.removeProject', 'projectTags.getSnapshot', 'projectTags.setProjectTags'];
test.describe.configure({ mode: 'serial' });
test.setTimeout(60000);

test.beforeEach(async () => {
    home = await createFixtureHome();
    const prototype = SAMPLE_PROJECTS.find((project) => project.name === 'My Prototype')!;
    await writeJson(path.join(home, '.gd-launcher', 'projects.json'), [
        ...SAMPLE_PROJECTS,
        { ...prototype, name: 'Second Prototype', path: '/fixture/second-prototype' },
    ]);
    await writeJson(path.join(home, '.gd-launcher', 'project-tags.json'), { tags: [{ id: 'shared', name: 'Shared', colour: 0 }, { id: 'other', name: 'Other', colour: 2 }, { id: 'none', name: 'None', colour: 4 }], assignments: { [prototype.path]: ['shared', 'other'], '/fixture/second-prototype': ['other'] } });
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

/** Finds one project in any presentation.
 * @param name - Fixture project's display name.
 */
function row(name: string) { return page.locator('li[data-project-path]').filter({ hasText: name }); }
/** Selects the two prototype projects. */
async function selectTargets() {
    await page.getByRole('button', { name: 'Enable multi-select', exact: true }).click();
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    await page.getByRole('button', { name: 'Select New shown', exact: true }).click();
    await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
}
/** Opens the frozen-target tag editor. */
async function openTags() {
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    await page.getByRole('button', { name: 'Bulk edit tags', exact: true }).click();
    const popup = page.getByRole('dialog', { name: 'Bulk edit tags', exact: true });
    await expect(popup.getByRole('searchbox')).toBeFocused();
    return popup;
}
/** Reads persisted membership from the actual main-process store. */
async function stored() {
    return JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'project-tags.json'), 'utf8')) as { tags: { id: string; name: string; colour: number }[]; assignments: Record<string, string[]> };
}
/** Applies a project-tag filter independently of popover search.
 * @param name - Existing tag name to match.
 */
async function filter(name: string) {
    await page.getByTestId('btnFilterProjectTags').click();
    const popup = page.getByRole('dialog', { name: 'Tags', exact: true });
    await popup.getByRole('combobox').fill(name);
    await popup.getByRole('combobox').press('Enter');
    await popup.getByRole('combobox').press('Escape');
}
/** Mutates real saved state as an external project/tag change.
 * @param action - Whether to remove the second target or tag an outside project.
 */
async function external(action: 'remove' | 'tag-outside') {
    await app.evaluate(async ({ ipcMain, BrowserWindow }, action) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown> };
        const sender = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('http://localhost:5123'))!.webContents;
        const event = { sender, senderFrame: sender.mainFrame };
        const response = await ipc.selectionHandlers.get('projects.getProjectsDetails')!(event) as { data: { name: string; path: string }[] };
        if (action === 'remove') await ipc.selectionHandlers.get('projects.removeProject')!(event, response.data.find(project => project.name === 'Second Prototype'));
        else await ipc.selectionHandlers.get('projectTags.setProjectTags')!(event, response.data.find(project => project.name !== 'My Prototype' && project.name !== 'Second Prototype')!.path, [{ id: 'other' }]);
    }, action);
}

for (const [mode, theme] of [['tabProjectCards', 0], ['tabProjectList', 1], ['tabProjectDenseList', 0]] as const) {
    test(`saves tri-state tags and creation without changing untouched memberships in ${mode}`, async () => {
        await page.getByTestId(mode).click();
        await applyTheme(page, THEMES[theme]);
        await selectTargets();
        const popup = await openTags();
        const before = await stored();
        await expect(popup.getByRole('checkbox', { name: 'Shared', exact: true })).toHaveAttribute('aria-checked', 'mixed');
        await expect(popup.getByRole('checkbox', { name: 'Other', exact: true })).toBeChecked();
        await expect(popup.getByRole('checkbox', { name: 'None', exact: true })).not.toBeChecked();
        await expect(popup.getByText('1 of 2', { exact: true })).toBeVisible();
        await expect(popup.getByText('0 of 2', { exact: true })).toBeVisible();
        await popup.getByRole('checkbox', { name: 'Shared', exact: true }).click();
        await expect(popup.getByRole('checkbox', { name: 'Shared', exact: true })).toBeChecked();
        await expect(popup.getByRole('checkbox', { name: 'Shared', exact: true })).toBeEnabled();
        await popup.getByRole('checkbox', { name: 'None', exact: true }).focus();
        await popup.getByRole('checkbox', { name: 'None', exact: true }).press('Space');
        await expect(popup.getByRole('checkbox', { name: 'None', exact: true })).toBeChecked();
        await expect(popup.getByRole('checkbox', { name: 'None', exact: true })).toBeFocused();
        await popup.getByRole('checkbox', { name: 'Shared', exact: true }).click();
        await expect(popup.getByRole('checkbox', { name: 'Shared', exact: true })).not.toBeChecked();
        const input = popup.getByRole('searchbox');
        await input.fill('  Created  ');
        await expect(popup.getByRole('button', { name: 'Create "Created"', exact: true })).toBeVisible();
        await input.press('Enter');
        await expect(input).toHaveValue('');
        await expect(popup.getByRole('checkbox', { name: 'Created', exact: true })).toBeChecked();
        await expect(popup.getByRole('checkbox', { name: 'Created', exact: true })).toHaveJSProperty('indeterminate', false);
        const saved = await stored();
        const createdId = saved.tags.find(tag => tag.name === 'Created')!.id;
        expect(saved.tags.filter(tag => tag.name === 'Created')).toHaveLength(1);
        expect(saved.tags.filter(tag => tag.id !== createdId)).toEqual(before.tags);
        expect(Object.values(saved.assignments).map(ids => [...ids].sort())).toEqual([['other', 'none', createdId].sort(), ['other', 'none', createdId].sort()]);
        await expect(popup).toBeInViewport({ ratio: 1 });
        await page.screenshot({ path: test.info().outputPath(`bulk-tags-${mode}-${theme}.png`), animations: 'disabled' });
        await input.press('Escape');
        await expect(popup).toBeHidden();
        await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeFocused();
        await page.reload();
        await page.getByTestId('btnProjects').click();
        expect(await stored()).toEqual(saved);
    });
}

test('freezes hidden targets and denominator until close without selecting newly matching projects', async () => {
    await filter('Other');
    await selectTargets();
    const popup = await openTags();
    await popup.getByRole('checkbox', { name: 'Other', exact: true }).click();
    await expect(popup.getByRole('checkbox', { name: 'Other', exact: true })).not.toBeChecked();
    await expect(row('My Prototype')).toHaveCount(0);
    await expect(row('Second Prototype')).toHaveCount(0);
    await expect(popup.getByText('2 selected', { exact: true })).toBeVisible();
    await external('tag-outside');
    await expect(page.locator('li[data-project-path]')).toHaveCount(1);
    await popup.getByRole('searchbox').fill('None');
    await expect(popup.getByText('2 selected', { exact: true })).toBeVisible();
    await popup.getByRole('checkbox', { name: 'None', exact: true }).click();
    await expect(popup.getByRole('checkbox', { name: 'None', exact: true })).toBeChecked();
    await expect(popup.getByText('2 of 2', { exact: true })).toBeVisible();
    const state = await stored();
    const outside = Object.entries(state.assignments).find(([key]) => key !== '/fixture/second-prototype' && !key.endsWith('my-prototype'));
    expect(Object.values(state.assignments).filter(ids => ids.includes('none'))).toHaveLength(2);
    expect(Object.values(state.assignments).find(ids => ids.includes('other'))).toEqual(['other']);
    expect(outside).toBeDefined();
    await popup.getByRole('searchbox').press('Escape');
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
});

test('retries a partial removal only on failures with the original remove intent', async () => {
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown>; tagCalls: string[] };
        const original = ipc.selectionHandlers.get('projectTags.setProjectTags')!;
        ipc.tagCalls = [];
        ipcMain.removeHandler('projectTags.setProjectTags');
        ipcMain.handle('projectTags.setProjectTags', async (event, ...args) => {
            ipc.tagCalls.push(args[0] as string);
            if (ipc.tagCalls.length === 2) return { success: false, error: { type: 'Error', message: 'write-failed' } };
            return original(event, ...args);
        });
    });
    await selectTargets();
    const popup = await openTags();
    await popup.getByRole('checkbox', { name: 'Other', exact: true }).click();
    await expect(popup.getByRole('checkbox', { name: 'Other', exact: true })).toHaveAttribute('aria-checked', 'mixed');
    const result = popup.getByRole('alert');
    await expect(result).toContainText('Second Prototype: write-failed');
    await result.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(popup).toHaveAttribute('aria-busy', 'false');
    await expect(popup.getByRole('alert')).toHaveCount(0);
    await expect(popup.getByRole('checkbox', { name: 'Other', exact: true })).not.toBeChecked();
    const calls = await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { tagCalls: string[] }).tagCalls);
    expect(calls).toHaveLength(3);
    expect(calls[1]).toBe(calls[2]);
    expect(calls[0]).not.toBe(calls[2]);
    expect(Object.values((await stored()).assignments).some(ids => ids.includes('other'))).toBe(false);
    await expect(popup.getByRole('searchbox')).toBeFocused();
    await popup.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeFocused();
});

test('guards pending edits and reconciles hidden selection after closing during a save', async () => {
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown>; releaseTags: () => void; tagCalls: number };
        const original = ipc.selectionHandlers.get('projectTags.setProjectTags')!;
        ipc.tagCalls = 0;
        const wait = new Promise<void>(resolve => { ipc.releaseTags = resolve; });
        ipcMain.removeHandler('projectTags.setProjectTags');
        ipcMain.handle('projectTags.setProjectTags', async (...args) => { ipc.tagCalls++; const saved = await original(...args); await wait; return saved; });
    });
    await filter('Other');
    await selectTargets();
    const popup = await openTags();
    await popup.getByRole('checkbox', { name: 'Other', exact: true }).click();
    await expect(popup.getByRole('checkbox', { name: 'None', exact: true })).toBeDisabled();
    await popup.getByRole('checkbox', { name: 'None', exact: true }).evaluate((element: HTMLInputElement) => element.click());
    await expect(popup.getByRole('searchbox')).toHaveAttribute('readonly', '');
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
    await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeDisabled();
    await page.getByTestId('btnProjectViewOptions').click();
    const modal = page.getByRole('dialog', { name: 'View options', exact: true });
    const group = modal.getByRole('button', { name: 'Reorder New', exact: true });
    await group.press('Space'); await group.press('ArrowUp'); await group.press('Space');
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    const newer = page.getByRole('article', { name: 'Group order saved', exact: true });
    await expect(newer).toBeVisible();
    await newer.hover();
    await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { releaseTags: () => void }).releaseTags());
    await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeEnabled();
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
    expect(await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { tagCalls: number }).tagCalls)).toBe(2);
    await expect(newer).toBeVisible();
    await expect(page.getByRole('article', { name: 'Tags', exact: true })).toHaveCount(0);
});

test('reports a removed frozen target and manual project search clears the session', async () => {
    await selectTargets();
    const popup = await openTags();
    await external('remove');
    await expect(row('Second Prototype')).toHaveCount(0);
    await expect(popup.getByText('2 selected', { exact: true })).toBeVisible();
    await popup.getByRole('checkbox', { name: 'None', exact: true }).click();
    await expect(popup.getByRole('alert')).toContainText('Second Prototype: This project is no longer available.');
    expect(Object.values((await stored()).assignments).filter(ids => ids.includes('none'))).toHaveLength(1);
    await popup.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByTestId('inputProjectSearch').fill('Prototype');
    await expect(popup).toBeHidden();
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
});

test('changing the project tag filter closes the frozen popover and clears selection', async () => {
    await selectTargets();
    const popup = await openTags();
    await popup.getByRole('searchbox').fill('Shared');
    await expect(popup.getByText('2 selected', { exact: true })).toBeVisible();
    await popup.getByRole('button', { name: 'Close', exact: true }).click();
    await filter('Other');
    await expect(popup).toBeHidden();
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
    await expect(row('My Prototype')).toBeVisible();
    await expect(row('Second Prototype')).toBeVisible();
});

test('explains a deleted catalogue tag when retrying the original failed targets', async () => {
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown>; tagCalls: number };
        const original = ipc.selectionHandlers.get('projectTags.setProjectTags')!;
        ipc.tagCalls = 0;
        ipcMain.removeHandler('projectTags.setProjectTags');
        ipcMain.handle('projectTags.setProjectTags', async (...args) => {
            if (++ipc.tagCalls === 2) return { success: false, error: { type: 'Error', message: 'write-failed' } };
            return original(...args);
        });
    });
    await selectTargets();
    const popup = await openTags();
    await popup.getByRole('checkbox', { name: 'None', exact: true }).click();
    await expect(popup.getByRole('alert')).toContainText('Second Prototype: write-failed');
    await popup.getByRole('button', { name: 'Close', exact: true }).click();
    const result = page.getByRole('article', { name: 'Tags', exact: true });
    await app.evaluate(async ({ ipcMain, BrowserWindow }) => {
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> };
        const sender = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('http://localhost:5123'))!.webContents;
        await ipc._invokeHandlers.get('projectTags.deleteTag')!({ sender, senderFrame: sender.mainFrame }, 'none');
    });
    await result.hover();
    await result.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Tags', exact: true })).toContainText('Second Prototype: This tag is no longer available.');
    expect((await stored()).tags.some(tag => tag.id === 'none')).toBe(false);
    expect(await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { tagCalls: number }).tagCalls)).toBe(2);
});


test('backdrop blocks underlying controls and modal keyboard focus stays in the editor', async () => {
    await selectTargets();
    let popup = await openTags();
    await expect(popup.getByRole('heading', { name: 'Bulk edit tags', exact: true })).toBeVisible();
    for (let step = 0; step < 10; step++) {
        await page.keyboard.press('Tab');
        expect(await popup.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
    const projectSearch = page.getByTestId('inputProjectSearch');
    const searchBounds = await projectSearch.boundingBox();
    await page.mouse.click(searchBounds!.x + searchBounds!.width / 2, searchBounds!.y + searchBounds!.height / 2);
    await expect(popup).toBeHidden();
    await expect(projectSearch).not.toBeFocused();
    await expect(projectSearch).toHaveValue('');
    await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
    popup = await openTags();
    const installs = await page.getByTestId('btnInstalls').boundingBox();
    await page.mouse.click(installs!.x + installs!.width / 2, installs!.y + installs!.height / 2);
    await expect(popup).toBeHidden();
    await expect(projectSearch).toBeVisible();
    await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
});
