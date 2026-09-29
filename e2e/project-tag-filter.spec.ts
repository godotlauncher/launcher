import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { createFixtureHome, prepareAppWithStubbedData, setAppLanguage } from './support/e2e-fixture-runtime';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { getMainWindow } from './splashscreen/getMainWindow';

let app: ElectronApplication;
let page: Page;
let home: string;
const tags = [
    { id: 'red', name: 'Prototype', colour: 0 },
    { id: 'blue', name: 'Game Jam', colour: 7 },
    { id: 'unused', name: 'Unused', colour: 4 },
    { id: 'extra', name: 'Long project organisation tag', colour: 8 },
];
const assignments = { [SAMPLE_PROJECTS[0].path]: ['red'], [SAMPLE_PROJECTS[1].path]: ['blue'] };

/** Starts the real tag and preferences bridges behind isolated project fixtures. */
async function launch() {
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env: { ...env, GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home } });
    page = await getMainWindow(app);
    await setAppLanguage(page, 'English');
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown>; filterHandlers: Map<string, (...args: unknown[]) => unknown> };
        ipc.filterHandlers = new Map(['app.getUserPreferences', 'app.setUserPreferences'].map(channel => [channel, ipc._invokeHandlers.get(channel)!]));
    });
    await prepareAppWithStubbedData(page, app);
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { filterHandlers: Map<string, (...args: unknown[]) => unknown> };
        for (const [channel, handler] of ipc.filterHandlers) { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); }
    });
    await page.reload();
    await page.getByTestId('btnProjects').click();
    await page.setViewportSize({ width: 1024, height: 600 });
}

/** Opens the filter and returns its accessible dialog. */
async function openFilter() {
    await page.getByTestId('btnFilterProjectTags').click();
    const popup = page.getByRole('dialog', { name: 'Tags', exact: true });
    await expect(popup.getByRole('combobox')).toBeFocused();
    return popup;
}

test.beforeAll(async () => {
    home = await createFixtureHome();
    await fs.writeFile(path.join(home, '.gd-launcher', 'project-tags.json'), JSON.stringify({ tags, assignments }));
    await launch();
});
test.afterAll(async () => {
    await app?.close();
    if (home) await fs.rm(home, { recursive: true, force: true });
});

test('filters by any tag with search, persists and clears selections', async () => {
    test.setTimeout(120000);
    const rows = page.locator('[data-project-path]');
    await expect(rows).toHaveCount(3);
    let popup = await openFilter();
    await page.getByTestId('btnFilterProjectTags').click();
    await expect(popup).toBeHidden();
    popup = await openFilter();
    let input = popup.getByRole('combobox');
    await input.fill('not a tag');
    await expect(popup.getByRole('option')).toHaveCount(0);
    await expect(popup.getByText('No matching tags')).toBeVisible();
    await input.fill('proto');
    await input.press('Enter');
    await expect(popup.getByRole('button', { name: 'Remove Prototype', exact: true })).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    await expect(rows).toHaveCount(1);
    await expect(rows).toHaveAttribute('data-project-path', SAMPLE_PROJECTS[0].path);
    await expect(page.getByTestId('btnReorderPinnedProject')).toBeDisabled();
    await input.fill('Game');
    await input.press('Enter');
    await expect(rows).toHaveCount(2);
    await expect(input).toHaveValue('');
    for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
        await expect(popup).toBeInViewport({ ratio: 1 });
        await page.screenshot({ path: test.info().outputPath(`tag-filter-${theme}.png`) });
    }
    await input.press('Escape');
    await expect(popup).toBeHidden();
    await expect(page.getByTestId('btnFilterProjectTags')).toBeFocused();
    await expect(page.getByTestId('btnFilterProjectTags')).toContainText('2');
    await page.getByTestId('inputProjectSearch').fill('Other');
    await expect(rows).toHaveCount(1);
    await expect(rows).toHaveAttribute('data-project-path', SAMPLE_PROJECTS[1].path);
    await page.getByTestId('inputProjectSearch').fill('absent');
    await expect(rows).toHaveCount(0);
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(page.getByTestId('inputProjectSearch')).toHaveValue('');
    await expect(rows).toHaveCount(3);
    popup = await openFilter(); input = popup.getByRole('combobox');
    await input.fill('Unused'); await input.press('Enter');
    await expect(rows).toHaveCount(0);
    await popup.getByRole('button', { name: 'Clear tags', exact: true }).click();
    await expect(rows).toHaveCount(3);
    await input.fill('Prototype'); await input.press('Enter');
    await input.fill('Game Jam'); await input.press('Enter');
    await input.press('Escape');
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('btnProjects').click();
    await expect(rows).toHaveCount(2);
    await app.close(); await launch();
    await expect(page.locator('[data-project-path]')).toHaveCount(2);
    await page.getByTestId('tabProjectList').click();
    await expect(page.locator('[data-project-path]')).toHaveCount(2);
    popup = await openFilter(); input = popup.getByRole('combobox');
    await expect(popup.getByRole('button', { name: 'Remove Prototype', exact: true })).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Remove Game Jam', exact: true })).toBeVisible();
    // Catalogue updates remove only the deleted selection, leaving the other filter active.
    await app.evaluate(({ BrowserWindow }, snapshot) => {
        for (const window of BrowserWindow.getAllWindows()) window.webContents.send('project-tags-updated', snapshot);
    }, { tags: tags.filter(tag => tag.id !== 'red'), assignments });
    await expect(popup.getByRole('button', { name: 'Remove Prototype', exact: true })).toHaveCount(0);
    await expect(popup.getByRole('button', { name: 'Remove Game Jam', exact: true })).toBeVisible();
    await expect(page.locator('[data-project-path]')).toHaveCount(1);
    await popup.getByRole('button', { name: 'Remove Game Jam', exact: true }).click();
    await expect(page.locator('[data-project-path]')).toHaveCount(3);
    await expect(input).toBeFocused();
    await input.press('Escape');
});

test('retains filters on save failure and blocks unfiltered results on load failure', async () => {
    test.setTimeout(90000);
    await app.close(); await launch();
    let popup = await openFilter();
    let input = popup.getByRole('combobox');
    await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('app.setUserPreferences');
        ipcMain.handle('app.setUserPreferences', () => ({ success: false, error: { type: 'Error', message: 'write-failed' } }));
    });
    await input.fill('Prototype'); await input.press('Enter');
    await expect(page.getByText('Could not save tag filters.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ok', exact: true }).click();
    await expect(page.locator('[data-project-path]')).toHaveCount(3);
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { filterHandlers: Map<string, (...args: unknown[]) => unknown> };
        ipcMain.removeHandler('app.setUserPreferences');
        ipcMain.handle('app.setUserPreferences', ipc.filterHandlers.get('app.setUserPreferences')!);
    });
    if (!await popup.isVisible()) popup = await openFilter();
    input = popup.getByRole('combobox');
    await input.fill('Prototype'); await input.press('Enter');
    await expect(page.locator('[data-project-path]')).toHaveCount(1);
    await input.press('Escape');
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown>; savedTagSnapshot: (...args: unknown[]) => unknown };
        ipc.savedTagSnapshot = ipc._invokeHandlers.get('projectTags.getSnapshot')!;
        ipcMain.removeHandler('projectTags.getSnapshot');
        ipcMain.handle('projectTags.getSnapshot', () => ({ success: false, error: { type: 'Error', message: 'read-failed' } }));
    });
    await page.reload();
    await page.getByTestId('btnProjects').click();
    await expect(page.getByRole('alert')).toContainText('Could not load tags.');
    await expect(page.locator('[data-project-path]')).toHaveCount(0);
    await app.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { savedTagSnapshot: (...args: unknown[]) => unknown };
        ipcMain.removeHandler('projectTags.getSnapshot');
        ipcMain.handle('projectTags.getSnapshot', ipc.savedTagSnapshot);
    });
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.locator('[data-project-path]')).toHaveCount(1);
    popup = await openFilter();
    await expect(popup.getByRole('button', { name: 'Remove Prototype', exact: true })).toBeVisible();
    await popup.getByRole('button', { name: 'Clear tags', exact: true }).click();
    await expect(page.locator('[data-project-path]')).toHaveCount(3);
    await popup.getByRole('combobox').press('Escape');
});

test('shows OS shortcut badges and routes focus without interrupting settings', async () => {
    test.setTimeout(120000);
    for (const platform of ['darwin', 'win32', 'linux']) {
        await app.evaluate(({ ipcMain }, platform) => {
            ipcMain.removeHandler('app.getPlatform');
            ipcMain.handle('app.getPlatform', () => ({ success: true, data: platform }));
        }, platform);
        await page.reload();
        await page.getByTestId('btnProjects').click();
        const modifier = platform === 'darwin' ? 'Meta' : 'Control';
        const label = platform === 'darwin' ? '⌘' : 'Ctrl';
        const search = page.getByTestId('inputProjectSearch');
        const tagTrigger = page.getByTestId('btnFilterProjectTags');
        const searchBadge = page.locator('kbd').filter({ hasText: `${label} K` });
        const tagBadge = tagTrigger.locator('kbd');
        await page.getByTestId('tabProjectCards').focus();
        await expect(searchBadge).toBeVisible();
        await expect(tagBadge).toHaveText(`${label} T`);
        await expect(tagBadge).toBeVisible();
        await page.keyboard.press(`${modifier}+k`);
        await expect(search).toBeFocused();
        await expect(searchBadge).toBeHidden();
        await search.fill('Game');
        await page.keyboard.press(`${modifier}+k`);
        expect(await search.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd])).toEqual([0, 4]);
        await page.keyboard.press(`${modifier}+t`);
        const popup = page.getByRole('dialog', { name: 'Tags', exact: true });
        await expect(popup.getByRole('combobox')).toBeFocused();
        await expect(tagBadge).toBeHidden();
        await expect(searchBadge).toBeVisible();
        await page.keyboard.press(`${modifier}+t`);
        await expect(popup.getByRole('combobox')).toBeFocused();
        await page.keyboard.press(`${modifier}+k`);
        await expect(popup).toBeHidden();
        await expect(search).toBeFocused();
        await expect(tagBadge).toBeVisible();
        await search.fill('');
        await page.getByTestId('btnProjectSettings').first().click();
        const drawer = page.getByRole('dialog').filter({ has: page.getByTestId('btnProjectTagsField') });
        const name = drawer.locator('#projectEditName');
        const originalName = await name.inputValue();
        await name.focus();
        await page.keyboard.press(`${modifier}+t`);
        await expect(popup).toBeHidden();
        await expect(name).toBeFocused();
        await page.keyboard.press(`${modifier}+k`);
        await expect(name).toBeFocused();
        // macOS text-editing shortcuts can still act when simulating Control on other platforms.
        await name.fill(originalName);
        await drawer.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(drawer).toBeHidden();
        await page.getByTestId('tabProjectCards').focus();
        await page.screenshot({ path: test.info().outputPath(`project-shortcuts-${platform}.png`) });
    }
});
