import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { createFixtureHome, prepareAppWithStubbedData, setAppLanguage } from './support/e2e-fixture-runtime';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
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

/** Opens a fixture project with the list search cleared.
 * @param index - Visible fixture project to inspect.
 */
async function openSettings(index = 0) {
    await page.getByTestId('inputProjectSearch').fill('');
    await page.getByTestId('btnProjectSettings').nth(index).click();
    const drawer = page.getByRole('dialog').filter({ has: page.getByRole('combobox', { name: 'Tags', exact: true }) });
    await expect(drawer.getByRole('combobox', { name: 'Tags', exact: true })).toBeEnabled();
    return drawer;
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

test('stages tags, supports keyboard selection and discard, and persists through restart', async () => {
    test.setTimeout(90000);
    let drawer = await openSettings();
    let input = drawer.getByRole('combobox', { name: 'Tags', exact: true });
    await input.fill('  Prototype  ');
    await expect(drawer.getByRole('option', { name: 'Create "Prototype"' })).toBeVisible();
    await input.press('Enter');
    await expect(drawer.getByRole('button', { name: 'Remove Prototype', exact: true })).toBeVisible();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await expect(drawer).toBeVisible();
    await input.press('Escape');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).toBeHidden();
    let stored = await readTags();
    expect(stored.tags.map(tag => tag.name)).toEqual(['Prototype']);
    expect(Object.values(stored.assignments)).toEqual([[stored.tags[0].id]]);

    drawer = await openSettings();
    input = drawer.getByRole('combobox', { name: 'Tags', exact: true });
    await input.fill('prototype');
    await expect(drawer.getByRole('option')).toHaveCount(0);
    await expect(drawer.getByText('This tag is already selected.')).toBeVisible();
    await input.fill('Discarded tag');
    await input.press('Enter');
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(drawer).toBeHidden();
    expect((await readTags()).tags).toHaveLength(1);

    drawer = await openSettings();
    input = drawer.getByRole('combobox', { name: 'Tags', exact: true });
    await drawer.getByRole('button', { name: 'Remove Prototype', exact: true }).click();
    await input.fill('PROTOTYPE');
    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(drawer.getByRole('button', { name: 'Remove Prototype', exact: true })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Update', exact: true })).toBeDisabled();
    await input.fill('Game Jam');
    await input.press('Enter');
    // Save failure leaves the draft available to retry through the same preload bridge.
    await electronApp.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown>; savedTagHandler?: (...args: unknown[]) => unknown };
        ipc.savedTagHandler = ipc._invokeHandlers.get('projectTags.setProjectTags');
        ipcMain.removeHandler('projectTags.setProjectTags');
        ipcMain.handle('projectTags.setProjectTags', () => ({ success: false, error: { type: 'Error', message: 'write-failed' } }));
    });
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer.getByRole('alert')).toContainText('Could not save tags.');
    await expect(drawer.getByRole('button', { name: 'Remove Game Jam', exact: true })).toBeVisible();
    await electronApp.evaluate(({ ipcMain }) => {
        const ipc = ipcMain as typeof ipcMain & { savedTagHandler: (...args: unknown[]) => unknown };
        ipcMain.removeHandler('projectTags.setProjectTags');
        ipcMain.handle('projectTags.setProjectTags', ipc.savedTagHandler);
    });
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).toBeHidden();
    stored = await readTags();
    expect(stored.tags.map(tag => tag.name)).toEqual(['Prototype', 'Game Jam']);
    await electronApp.close();
    await launch();
    drawer = await openSettings();
    await expect(drawer.getByRole('button', { name: 'Remove Prototype', exact: true })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Remove Game Jam', exact: true })).toBeVisible();
    await drawer.getByRole('button', { name: 'Remove Prototype', exact: true }).click();
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).toBeHidden();
    stored = await readTags();
    expect(stored.tags).toHaveLength(2);
    expect(Object.values(stored.assignments)).toEqual([[stored.tags[1].id]]);
    // The existing Launcher project records carry no tag writes.
    const projects = JSON.parse(await fs.readFile(path.join(fixtureHome, '.gd-launcher', 'projects.json'), 'utf8'));
    expect(projects.map((project: { path: string }) => project.path).sort()).toEqual(SAMPLE_PROJECTS.map(project => project.path).sort());
    expect(projects.every((project: object) => !('tags' in project) && !('tagIds' in project))).toBe(true);
    // A larger shared catalogue must remain usable at the minimum window height.
    drawer = await openSettings(1);
    input = drawer.getByRole('combobox', { name: 'Tags', exact: true });
    for (let index = 1; index <= 8; index += 1) {
        await input.fill(`Long project organisation tag ${index}`);
        await input.press('Enter');
    }
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).toBeHidden();
    drawer = await openSettings();
    input = drawer.getByRole('combobox', { name: 'Tags', exact: true });
    for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
        await page.setViewportSize({ width: 1024, height: 600 });
        await input.click();
        await input.press('ArrowUp');
        const active = drawer.getByRole('option', { selected: true });
        await expect(active).toBeInViewport();
        await expect.poll(() => active.evaluate(element => {
            const rect = element.getBoundingClientRect();
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            return hit !== null && element.contains(hit);
        })).toBe(true);
        await page.screenshot({ path: test.info().outputPath(`tag-picker-${theme}.png`) });
        expect(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        await input.press('Escape');
    }
    await input.click();
    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(drawer.getByRole('button', { name: /Remove Long project organisation tag/ })).toBeVisible();
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).toBeHidden();
    expect((await readTags()).tags).toHaveLength(10);

});

test('stages named colours, discards changes, and shares saved colours across projects', async () => {
    test.setTimeout(90000);
    let drawer = await openSettings();
    const input = drawer.getByRole('combobox', { name: 'Tags', exact: true });
    await input.fill('Colour review');
    await input.press('Enter');
    let swatch = drawer.getByRole('button', { name: 'Colour for Colour review', exact: true });
    await swatch.click();
    let palette = page.getByRole('dialog', { name: 'Colour for Colour review', exact: true });
    await expect(palette.getByRole('option')).toHaveCount(30);
    await palette.getByText('Colour for Colour review', { exact: true }).click();
    await expect(palette).toBeVisible();
    await palette.getByRole('option', { name: 'Blue', exact: true }).click();
    await expect(palette).toBeHidden();
    await expect(swatch).toBeFocused();
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await swatch.click();
    await expect(palette.getByRole('option', { name: 'Blue', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(palette.getByRole('option', { name: 'Blue', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(palette.getByRole('option', { name: 'Violet', exact: true })).toBeFocused();
    await expect(palette.getByRole('option', { name: 'Blue', exact: true })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(palette).toBeHidden();
    const beforeSave = await readTags().catch(() => ({ tags: [], assignments: {} }));
    expect(beforeSave.tags.find(tag => tag.name === 'Colour review')).toBeUndefined();
    for (const theme of ['dark', 'light']) {
        await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
        await page.setViewportSize({ width: 1024, height: 600 });
        await swatch.click();
        await expect(palette.getByRole('option', { name: 'Violet', exact: true })).toHaveAttribute('aria-selected', 'true');
        await expect(palette).toBeInViewport({ ratio: 1 });
        await page.screenshot({ path: test.info().outputPath(`tag-colours-${theme}.png`) });
        await page.keyboard.press('Escape');
        await expect(palette).toBeHidden();
        await expect(drawer).toBeVisible();
        await expect(swatch).toBeFocused();
    }
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).toBeHidden();
    let stored = await readTags();
    const tag = stored.tags.find(tag => tag.name === 'Colour review');
    expect(tag?.colour).toBe(8);

    drawer = await openSettings(1);
    const otherInput = drawer.getByRole('combobox', { name: 'Tags', exact: true });
    await otherInput.fill('Colour review');
    await otherInput.press('Enter');
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).toBeHidden();
    stored = await readTags();
    const assignmentPaths = Object.entries(stored.assignments).filter(([, ids]) => ids.includes(tag!.id)).map(([projectPath]) => projectPath).sort();
    expect(assignmentPaths).toHaveLength(2);

    drawer = await openSettings();
    swatch = drawer.getByRole('button', { name: 'Colour for Colour review', exact: true });
    await swatch.click();
    palette = page.getByRole('dialog', { name: 'Colour for Colour review', exact: true });
    // Moving focus and dismissing the palette does not edit the colour.
    await page.keyboard.press('Home');
    await expect(palette.getByRole('option', { name: 'Red', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer.getByRole('button', { name: 'Update', exact: true })).toBeDisabled();
    await swatch.click();
    await page.keyboard.press('Tab');
    await expect(palette).toBeHidden();
    await expect(drawer.getByRole('button', { name: 'Remove Colour review', exact: true })).toBeFocused();
    await swatch.click();
    await palette.getByRole('option', { name: 'Red', exact: true }).click();
    await expect(drawer.getByRole('button', { name: 'Update', exact: true })).toBeEnabled();
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(drawer).toBeHidden();
    expect((await readTags()).tags.find(candidate => candidate.id === tag!.id)?.colour).toBe(8);

    drawer = await openSettings();
    swatch = drawer.getByRole('button', { name: 'Colour for Colour review', exact: true });
    await swatch.click();
    await palette.getByRole('option', { name: 'Green', exact: true }).click();
    await swatch.click();
    await palette.getByRole('option', { name: 'Violet', exact: true }).click();
    await expect(drawer.getByRole('button', { name: 'Update', exact: true })).toBeDisabled();
    await swatch.click();
    await palette.getByRole('option', { name: 'Green', exact: true }).click();
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).toBeHidden();
    stored = await readTags();
    expect(stored.tags.find(candidate => candidate.id === tag!.id)?.colour).toBe(4);
    expect(Object.entries(stored.assignments).filter(([, ids]) => ids.includes(tag!.id)).map(([projectPath]) => projectPath).sort()).toEqual(assignmentPaths);
    await electronApp.close();
    await launch();
    palette = page.getByRole('dialog', { name: 'Colour for Colour review', exact: true });
    for (const projectIndex of [0, 1]) {
        drawer = await openSettings(projectIndex);
        swatch = drawer.getByRole('button', { name: 'Colour for Colour review', exact: true });
        await swatch.click();
        await expect(palette.getByRole('option', { name: 'Green', exact: true })).toHaveAttribute('aria-selected', 'true');
        await page.keyboard.press('Escape');
        await drawer.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(drawer).toBeHidden();
    }
});
