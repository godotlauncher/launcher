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

/** Removes a tag through the management drawer.
 * @param name - Existing catalogue tag name.
 */
async function deleteTag(name: string) {
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabProjects').click();
    await page.getByRole('button', { name: 'Manage tags', exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Manage tags', exact: true });
    const row = drawer.getByRole('form', { name, exact: true });
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: `Delete "${name}"?`, exact: true });
    await expect(confirm.getByText('Projects: 1', { exact: true })).toBeVisible();
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(row).toBeHidden();
    await drawer.getByRole('button', { name: 'Close drawer', exact: true }).click();
    await page.getByTestId('btnProjects').click();
}

test('deletion reconciles saved filters and preserves search across catalogue changes', async () => {
    test.setTimeout(90000);
    let popup = await openFilter();
    for (const name of ['Prototype', 'Game Jam']) {
        await popup.getByRole('combobox').fill(name);
        await popup.getByRole('combobox').press('Enter');
        await expect(popup.getByRole('button', { name: `Remove ${name}`, exact: true })).toBeVisible();
    }
    await popup.getByRole('combobox').press('Escape');
    await expect(page.locator('[data-project-path]')).toHaveCount(2);
    await deleteTag('Prototype');
    await expect(page.locator('[data-project-path]')).toHaveCount(1);
    popup = await openFilter();
    await expect(popup.getByRole('button', { name: 'Remove Prototype', exact: true })).toHaveCount(0);
    await expect(popup.getByRole('button', { name: 'Remove Game Jam', exact: true })).toBeVisible();
    await popup.getByRole('combobox').press('Escape');
    await app.close(); await launch();
    await expect(page.locator('[data-project-path]')).toHaveCount(1);
    await page.getByTestId('inputProjectSearch').fill('no matching project');
    await expect(page.locator('[data-project-path]')).toHaveCount(0);
    const deleted = await page.evaluate(async () => {
        const bridge = (window as unknown as { __di_electron__: { invoke: (channel: string, ...args: unknown[]) => Promise<{ success: boolean }> } }).__di_electron__;
        return bridge.invoke('projectTags.deleteTag', 'blue');
    });
    expect(deleted.success).toBe(true);
    await expect(page.getByTestId('inputProjectSearch')).toHaveValue('no matching project');
    await expect(page.locator('[data-project-path]')).toHaveCount(0);
    await page.getByTestId('inputProjectSearch').fill('');
    await expect(page.locator('[data-project-path]')).toHaveCount(3);
    popup = await openFilter();
    await expect(popup.getByRole('button', { name: /^Remove / })).toHaveCount(0);
    await popup.getByRole('combobox').press('Escape');
    await app.close(); await launch();
    await expect(page.locator('[data-project-path]')).toHaveCount(3);
});

test('an open settings draft drops a deleted tag and retains other pending edits', async () => {
    await page.getByTestId('btnProjectSettings').first().click();
    const drawer = page.getByRole('dialog').filter({ has: page.getByTestId('btnProjectTagsField') });
    await drawer.getByTestId('btnProjectTagsField').click();
    const picker = drawer.getByRole('dialog', { name: 'Tags', exact: true });
    const input = picker.getByRole('combobox');
    await input.fill('Unused');
    await input.press('Enter');
    await expect(picker.getByRole('button', { name: 'Remove Unused', exact: true })).toBeVisible();
    await input.fill('Draft kept');
    await input.press('Enter');
    await expect(picker.getByRole('button', { name: 'Remove Draft kept', exact: true })).toBeVisible();
    // Simulate a catalogue change arriving while this drawer has pending edits.
    const result = await page.evaluate(async () => {
        const bridge = (window as unknown as { __di_electron__: { invoke: (channel: string, ...args: unknown[]) => Promise<{ success: boolean }> } }).__di_electron__;
        return bridge.invoke('projectTags.deleteTag', 'unused');
    });
    expect(result.success).toBe(true);
    await expect(picker.getByRole('button', { name: 'Remove Unused', exact: true })).toHaveCount(0);
    await expect(picker.getByRole('button', { name: 'Remove Draft kept', exact: true })).toBeVisible();
    await input.press('Escape');
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).toBeHidden();
    const saved = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'project-tags.json'), 'utf8'));
    expect(saved.tags.some((tag: { id: string }) => tag.id === 'unused')).toBe(false);
    expect(saved.tags.some((tag: { name: string }) => tag.name === 'Draft kept')).toBe(true);
    await expect(page.getByTestId('btnProjectTags').first()).toHaveAccessibleName('Tags: Draft kept');
});
