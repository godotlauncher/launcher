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
    const prototype = SAMPLE_PROJECTS.find(project => project.name === 'My Prototype')!;
    const projects = ['Alpha', 'Beta', 'Gamma'].map((name, index) => ({
        ...prototype, name, path: path.join(home, 'projects', name), launch_path: '',
        added_at: new Date(index + 1), pinned: name === 'Beta', pinned_order: name === 'Beta' ? 0 : undefined,
        is_new: name === 'Alpha', last_opened: name === 'Alpha' ? null : new Date('2026-10-20T10:00:00Z'),
    }));
    for (const project of projects) {
        await fs.mkdir(project.path, { recursive: true });
        await fs.writeFile(path.join(project.path, 'project.godot'), `; ${project.name} project\n`);
        await fs.writeFile(path.join(project.path, 'keep.txt'), `Keep ${project.name}`);
    }
    await writeJson(path.join(home, '.gd-launcher', 'projects.json'), projects);
    await writeJson(path.join(home, '.gd-launcher', 'project-tags.json'), { tags: [{ id: 'test-tag', name: 'Test', colour: 0 }], assignments: Object.fromEntries(projects.map(project => [project.path, ['test-tag']])) });
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env: { ...env, GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home } });
    page = await getMainWindow(app);
    await app.evaluate(({ ipcMain }, names) => {
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown>; selectionHandlers: Map<string, (...args: unknown[]) => unknown> };
        ipc.selectionHandlers = new Map(names.map((name) => [name, ipc._invokeHandlers.get(name)!]));
    }, channels);
    await prepareAppWithStubbedData(page, app, { preferences: { ...SAMPLE_PREFS, language: 'en', confirm_project_remove: !test.info().title.includes('disabled') } });
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown>; confirmationPreferences: boolean[] };
        const original = ipc._invokeHandlers.get('app.setUserPreferences')!;
        ipc.confirmationPreferences = [];
        ipcMain.removeHandler('app.setUserPreferences');
        ipcMain.handle('app.setUserPreferences', async (event, next: { confirm_project_remove: boolean }) => {
            ipc.confirmationPreferences.push(next.confirm_project_remove);
            return original(event, next);
        });
    });
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
 * @param name - Fixture project name.
 */
function row(name: string) { return page.locator('li[data-project-path]').filter({ hasText: name }); }
/** Opens the selected-project Actions menu. */
async function actions() {
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    return page.getByRole('dialog', { name: 'Actions', exact: true });
}
/** Selects shown projects through the supported toolbar. */
async function selectAll() {
    await page.getByRole('button', { name: 'Enable multi-select', exact: true }).click();
    await (await actions()).getByRole('button', { name: 'Select all shown', exact: true }).click();
}
/** Opens the fixed removal confirmation.
 * @param count - Expected current selection count.
 */
async function openRemoval(count: number) {
    await (await actions()).getByRole('button', { name: `Remove from list (${count})`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove projects from list', exact: true });
    await expect(dialog).toContainText(`Projects selected for removal: ${count}.`);
    await expect(dialog.getByRole('listitem')).toHaveCount(count);
    return dialog;
}
/** Reads the actual saved registrations. */
async function stored() {
    return JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'projects.json'), 'utf8')) as { name: string; path: string }[];
}
/** Checks all original directories and files, including removed projects. */
async function expectFilesKept() {
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
        expect(await fs.readFile(path.join(home, 'projects', name, 'keep.txt'), 'utf8')).toBe(`Keep ${name}`);
        expect(await fs.readFile(path.join(home, 'projects', name, 'project.godot'), 'utf8')).toContain(name);
    }
}
/** Waits for aggregate feedback and usable selection controls.
 * @param message - Expected result text.
 */
async function result(message: string) {
    const notification = page.getByRole('article', { name: 'Projects', exact: true });
    await expect(notification).toContainText(message);
    await expect(page.getByRole('button', { name: 'Actions', exact: true })).toBeEnabled();
    await notification.hover();
    return notification;
}
/** Installs one failure or delay around the existing removal handler.
 * @param mode - Requested injection behaviour.
 */
async function inject(mode: 'fail' | 'delay' | 'delay-fail') {
    await app.evaluate(({ ipcMain }, mode) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown>; removeCalls: string[]; releaseRemove: () => void; undoCalls: number };
        const original = ipc.selectionHandlers.get('projects.removeProject')!;
        const wait = new Promise<void>(resolve => { ipc.releaseRemove = resolve; });
        ipc.removeCalls = [];
        ipc.undoCalls = 0;
        const undo = ipc.selectionHandlers.get('projects.undoClearProjectNewStatus')!;
        ipcMain.removeHandler('projects.undoClearProjectNewStatus');
        ipcMain.handle('projects.undoClearProjectNewStatus', async (...args) => { ipc.undoCalls++; return undo(...args); });
        let failed = false;
        ipcMain.removeHandler('projects.removeProject');
        ipcMain.handle('projects.removeProject', async (event, ...args) => {
            const project = args[0] as { name: string };
            ipc.removeCalls.push(project.name);
            if (mode.includes('fail') && !failed && project.name === 'Beta') {
                failed = true;
                return { success: false, error: { type: 'Error', message: 'write-failed' } };
            }
            const saved = await original(event, ...args);
            if (mode.includes('delay')) await wait;
            return saved;
        });
    }, mode);
}
/** Reads submitted removals rather than inferred UI changes. */
async function calls() {
    return app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { removeCalls: string[] }).removeCalls);
}
/** Removes a project elsewhere through the original main-owned API.
 * @param name - Project to remove outside the reviewed operation.
 */
async function removeElsewhere(name: string) {
    await app.evaluate(async ({ ipcMain, BrowserWindow }, name) => {
        const ipc = ipcMain as typeof ipcMain & { selectionHandlers: Map<string, (...args: unknown[]) => unknown> };
        const sender = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('http://localhost:5123'))!.webContents;
        const event = { sender, senderFrame: sender.mainFrame };
        const response = await ipc.selectionHandlers.get('projects.getProjectsDetails')!(event) as { data: { name: string }[] };
        await ipc.selectionHandlers.get('projects.removeProject')!(event, response.data.find(project => project.name === name));
    }, name);
}

for (const [mode, theme] of [['tabProjectCards', 0], ['tabProjectList', 1], ['tabProjectDenseList', 0]] as const) {
    for (const preference of ['enabled', 'disabled']) {
        test(`always confirms and preserves folders in ${mode} with individual confirmation ${preference}`, async () => {
            await page.getByTestId(mode).click();
            await applyTheme(page, THEMES[theme]);
            await selectAll();
            let dialog = await openRemoval(3);
            await expect(dialog.getByRole('listitem')).toHaveText(['Beta', 'Alpha', 'Gamma']);
            await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
            await expect(dialog.getByRole('checkbox')).toHaveCount(0);
            await page.screenshot({ path: test.info().outputPath(`bulk-remove-${mode}-${preference}.png`), animations: 'disabled' });
            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
            expect(await stored()).toHaveLength(3);
            dialog = await openRemoval(3);
            await page.keyboard.press('Escape');
            await expect(dialog).toHaveCount(0);
            expect(await stored()).toHaveLength(3);
            dialog = await openRemoval(3);
            await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
            await result('Projects removed from list: 3.');
            expect(await stored()).toEqual([]);
            await expect(page.getByRole('button', { name: 'Disable multi-select', exact: true })).toBeVisible();
            await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
            await expect((await actions()).getByRole('button', { name: 'Remove from list (0)', exact: true })).toBeDisabled();
            await page.keyboard.press('Escape');
            await expectFilesKept();
            const preferenceWrites = await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { confirmationPreferences: boolean[] }).confirmationPreferences);
            expect(preferenceWrites.every(value => value === (preference === 'enabled'))).toBe(true);
            const tags = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'project-tags.json'), 'utf8'));
            expect(Object.keys(tags.assignments)).toEqual([]);
            await page.reload(); await page.getByTestId('btnProjects').click();
            await expect(page.locator('li[data-project-path]')).toHaveCount(0);
        });
    }
}

test('retains failed selection and reconfirms only failures without repeating successes', async () => {
    await inject('fail');
    await selectAll();
    await (await openRemoval(3)).getByRole('button', { name: 'Remove', exact: true }).click();
    let notification = await result('Beta: write-failed');
    await expect(notification).toContainText('Projects removed from list: 2.');
    await expect(page.getByRole('checkbox', { name: 'Select Beta', exact: true })).toBeChecked();
    await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
    expect((await stored()).map(project => project.name)).toEqual(['Beta']);
    await notification.getByRole('button', { name: 'Retry', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Remove projects from list', exact: true });
    await expect(dialog.getByRole('listitem')).toHaveText(['Beta']);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await calls()).toEqual(['Beta', 'Alpha', 'Gamma']);
    notification = await result('Beta: write-failed');
    await notification.getByRole('button', { name: 'Retry', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Remove projects from list', exact: true });
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
    await result('Projects removed from list: 3.');
    expect(await calls()).toEqual(['Beta', 'Alpha', 'Gamma', 'Beta']);
    expect(await stored()).toEqual([]);
    await expectFilesKept();
});

test('keeps reviewed names fixed when a target disappears and never substitutes another project', async () => {
    await inject('fail');
    await selectAll();
    await page.getByRole('checkbox', { name: 'Select Gamma', exact: true }).uncheck();
    const dialog = await openRemoval(2);
    await removeElsewhere('Beta');
    await expect(dialog.getByRole('listitem')).toHaveText(['Beta', 'Alpha']);
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
    let notification = await result('Beta: This project is no longer available.');
    await expect(notification).toContainText('Projects removed from list: 1.');
    expect((await stored()).map(project => project.name)).toEqual(['Gamma']);
    await notification.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('dialog', { name: 'Remove projects from list', exact: true }).getByRole('button', { name: 'Remove', exact: true }).click();
    notification = await result('Beta: This project is no longer available.');
    expect(await calls()).toEqual(['Alpha']);
    await expect(row('Gamma')).toBeVisible();
    await expectFilesKept();
});

test('ignores pending confirmation repeats and Escape and guards controls across navigation', async () => {
    await inject('delay');
    await selectAll();
    const dialog = await openRemoval(3);
    const remove = dialog.getByRole('button', { name: 'Remove', exact: true });
    await remove.click();
    await expect(remove).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await remove.evaluate((button: HTMLButtonElement) => button.click());
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect.poll(calls).toEqual(['Beta']);
    await page.getByTestId('btnInstalls').evaluate((button: HTMLButtonElement) => button.click());
    await page.getByTestId('btnProjects').click();
    await expect(page.getByRole('button', { name: 'Enable multi-select', exact: true })).toBeDisabled();
    await expect(row('Alpha').getByTestId('btnToggleProjectPinned').click({ trial: true, timeout: 500 })).rejects.toThrow();
    await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { releaseRemove: () => void }).releaseRemove());
    await expect.poll(stored).toEqual([]);
    await expect(page.getByRole('button', { name: 'Enable multi-select', exact: true })).toHaveCount(0);
    expect(await calls()).toEqual(['Beta', 'Alpha', 'Gamma']);
    await expectFilesKept();
});

test('preserves failed-only recovery and selection after navigating away during removal', async () => {
    await inject('delay-fail');
    await selectAll();
    await (await openRemoval(3)).getByRole('button', { name: 'Remove', exact: true }).click();
    await expect.poll(calls).toEqual(['Beta', 'Alpha']);
    await page.getByTestId('btnInstalls').evaluate((button: HTMLButtonElement) => button.click());
    await page.getByTestId('btnProjects').click();
    await expect(page.getByRole('button', { name: 'Enable multi-select', exact: true })).toBeDisabled();
    await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { releaseRemove: () => void }).releaseRemove());
    let notification = await result('Beta: write-failed');
    await expect(notification).toContainText('Projects removed from list: 2.');
    await expect(page.getByRole('checkbox', { name: 'Select Beta', exact: true })).toBeChecked();
    await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
    await page.getByTestId('btnInstalls').click();
    await expect(page.getByRole('article', { name: 'Projects', exact: true })).toHaveCount(0);
    await page.getByTestId('btnProjects').click();
    notification = await result('Beta: write-failed');
    await notification.getByRole('button', { name: 'Retry', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove projects from list', exact: true });
    await expect(dialog.getByRole('listitem')).toHaveText(['Beta']);
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
    await result('Projects removed from list: 3.');
    expect(await calls()).toEqual(['Beta', 'Alpha', 'Gamma', 'Beta']);
    await expectFilesKept();
});

test('keeps dismissed removal feedback and selection cleared after navigation', async () => {
    await inject('fail');
    await selectAll();
    await (await openRemoval(3)).getByRole('button', { name: 'Remove', exact: true }).click();
    const notification = await result('Beta: write-failed');
    await notification.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
    await page.getByRole('button', { name: 'Disable multi-select', exact: true }).click();
    await page.getByTestId('btnInstalls').click();
    await page.getByTestId('btnProjects').click();
    await expect(page.getByRole('article', { name: 'Projects', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Enable multi-select', exact: true })).toBeEnabled();
    expect((await stored()).map(project => project.name)).toEqual(['Beta']);
});

test('blocks an older New Undo during removal confirmation and saving', async () => {
    await selectAll();
    await (await actions()).getByRole('button', { name: 'Select New shown', exact: true }).click();
    await (await actions()).getByRole('button', { name: 'Mark as not new (1)', exact: true }).click();
    const older = await result('New status cleared: 1.');
    await (await actions()).getByRole('button', { name: 'Select all shown', exact: true }).click();
    await inject('delay');
    const dialog = await openRemoval(3);
    await older.getByRole('button', { name: 'Undo', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    expect(await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { undoCalls: number }).undoCalls)).toBe(0);
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Remove', exact: true })).toBeDisabled();
    await older.getByRole('button', { name: 'Undo', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
    expect(await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { undoCalls: number }).undoCalls)).toBe(0);
    await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { releaseRemove: () => void }).releaseRemove());
    await result('Projects removed from list: 3.');
});

test('a delayed removal reply cannot restore a newer removal event', async () => {
    await inject('delay');
    await selectAll();
    await page.getByRole('checkbox', { name: 'Select Beta', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Select Gamma', exact: true }).uncheck();
    await (await openRemoval(1)).getByRole('button', { name: 'Remove', exact: true }).click();
    await expect.poll(async () => (await stored()).map(project => project.name)).toEqual(['Beta', 'Gamma']);
    await removeElsewhere('Beta');
    await app.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { releaseRemove: () => void }).releaseRemove());
    await result('Projects removed from list: 1.');
    await expect(row('Beta')).toHaveCount(0);
    await expect(row('Gamma')).toBeVisible();
    expect((await stored()).map(project => project.name)).toEqual(['Gamma']);
});
