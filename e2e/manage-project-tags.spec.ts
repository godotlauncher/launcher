import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { createFixtureHome, prepareAppWithStubbedData, setAppLanguage } from './support/e2e-fixture-runtime';
import { getMainWindow } from './splashscreen/getMainWindow';

let electronApp: ElectronApplication;
let page: Page;
let fixtureHome: string;

/** Launches Electron against isolated data with the actual project tag handlers. */
async function launch() {
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    delete env.ELECTRON_RUN_AS_NODE;
    electronApp = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`],
        env: { ...env, GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: fixtureHome },
    });
    page = await getMainWindow(electronApp);
    await setAppLanguage(page, 'English');
    await prepareAppWithStubbedData(page, electronApp);
    await page.getByTestId('btnProjects').click();
}

/** Reads real tag state saved by the main process. */
async function readTags() {
    return JSON.parse(await fs.readFile(path.join(fixtureHome, '.gd-launcher', 'project-tags.json'), 'utf8')) as { tags: { id: string; name: string; colour: number }[]; assignments: Record<string, string[]> };
}

test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    await launch();
});
test.afterAll(async () => {
    await electronApp?.close();
    if (fixtureHome) await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('manages catalogue tags without changing project membership', async () => {
    test.setTimeout(90000);
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabProjects').click();
    await expect(page.getByText('Organise and filter your projects with tags.')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('tag-settings-section.png') });
    await page.getByRole('button', { name: 'Manage tags', exact: true }).click();
    let drawer = page.getByRole('dialog', { name: 'Manage tags', exact: true });
    await expect(drawer.getByText('No tags', { exact: true })).toBeVisible();
    const create = drawer.getByRole('form', { name: 'New tag', exact: true });
    await create.getByRole('textbox', { name: 'Tag name' }).fill('  Prototype  ');
    await create.getByRole('button', { name: 'Add', exact: true }).click();
    let row = drawer.getByRole('form', { name: 'Prototype', exact: true });
    await expect(row.getByLabel('Projects: 0')).toBeVisible();
    const original = await readTags();
    expect(original.assignments).toEqual({});
    await create.getByRole('textbox').fill('prototype');
    await expect(create.getByRole('alert')).toHaveText('A tag with this name already exists.');
    await expect(create.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
    await create.getByRole('textbox').fill('Release');
    await create.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(drawer.getByRole('form', { name: 'Release', exact: true })).toBeVisible();
    await drawer.getByRole('button', { name: 'Close drawer', exact: true }).click();
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectTags').first().click();
    const picker = page.getByRole('dialog', { name: 'Tags', exact: true });
    await picker.getByRole('option', { name: 'Prototype', exact: true }).click();
    await picker.getByRole('combobox').press('Escape');
    await expect(page.getByTestId('btnProjectTags').first()).toHaveAccessibleName('Tags: Prototype');
    const assigned = await readTags();
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabProjects').click();
    await page.getByRole('button', { name: 'Manage tags', exact: true }).click();
    row = drawer.getByRole('form', { name: 'Prototype', exact: true });
    await expect(row.getByLabel('Projects: 1')).toBeVisible();
    await row.getByRole('button', { name: 'Edit name', exact: true }).click();
    await row.getByRole('textbox').fill('Cancelled');
    await row.getByRole('textbox').press('Escape');
    await expect(row.getByText('Prototype', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Edit name', exact: true }).click();
    await row.getByRole('textbox').fill('release');
    await expect(row.getByRole('alert')).toHaveText('A tag with this name already exists.');
    await row.getByRole('textbox').fill('In progress');
    await row.getByRole('button', { name: 'Colour for In progress', exact: true }).click();
    await page.getByRole('option', { name: 'Blue', exact: true }).click();
    await expect.poll(async () => (await readTags()).tags[0].colour).toBe(7);
    await expect(row.getByRole('textbox')).toHaveValue('In progress');
    await row.getByRole('button', { name: 'Save', exact: true }).click();
    row = drawer.getByRole('form', { name: 'In progress', exact: true });
    await expect(row.getByRole('button', { name: 'Edit name', exact: true })).toBeVisible();
    const renamed = await readTags();
    expect(renamed.tags[0]).toEqual({ id: original.tags[0].id, name: 'In progress', colour: 7 });
    expect(renamed.assignments).toEqual(assigned.assignments);
    await electronApp.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: any[]) => any>; savedManageHandler?: (...args: any[]) => any };
        ipc.savedManageHandler = ipc._invokeHandlers.get('projectTags.saveTag');
        ipcMain.removeHandler('projectTags.saveTag');
        ipcMain.handle('projectTags.saveTag', () => ({ success: false, error: { type: 'Error', message: 'write-failed' } }));
    });
    await row.getByRole('button', { name: 'Edit name', exact: true }).click();
    await row.getByRole('textbox').fill('Retry name');
    await row.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(row.getByRole('alert')).toHaveText('Could not save tags. Try again.');
    await expect(row.getByRole('textbox')).toHaveValue('Retry name');
    expect(await readTags()).toEqual(renamed);
    await electronApp.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { savedManageHandler: (...args: any[]) => any };
        ipcMain.removeHandler('projectTags.saveTag');
        ipcMain.handle('projectTags.saveTag', ipc.savedManageHandler);
    });
    await row.getByRole('textbox').press('Escape');
    for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
        await page.screenshot({ path: test.info().outputPath(`manage-tags-${theme}.png`) });
    }
    await drawer.getByRole('button', { name: 'Close drawer', exact: true }).click();
    await page.getByTestId('btnProjects').click();
    await expect(page.getByTestId('btnProjectTags').first()).toHaveAccessibleName('Tags: In progress');
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabProjects').click();
    await page.getByRole('button', { name: 'Manage tags', exact: true }).click();
    row = drawer.getByRole('form', { name: 'In progress', exact: true });
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete "In progress"?', exact: true });
    await expect(confirm.getByText('This tag will be removed from all projects.')).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await readTags()).toEqual(renamed);
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(row).toBeHidden();
    const deleted = await readTags();
    expect(deleted.tags.map(tag => tag.name)).toEqual(['Release']);
    expect(deleted.assignments).toEqual({});
    await drawer.getByRole('button', { name: 'Close drawer', exact: true }).click();
    await page.getByTestId('btnProjects').click();
    await expect(page.getByTestId('btnProjectTags').first()).toHaveAccessibleName('Tags');
    await electronApp.close();
    await launch();
    expect(await readTags()).toEqual(deleted);
    await expect(page.getByTestId('btnProjectTags').first()).toHaveAccessibleName('Tags');
});
