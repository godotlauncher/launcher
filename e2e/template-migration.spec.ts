import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { createFixtureHome } from './support/e2e-fixture-runtime';
import { getMainWindow } from './splashscreen/getMainWindow';

let home: string;
let app: ElectronApplication;
let page: Page;
let env: Record<string, string>;
let root: string;
const names = ['Private templates', 'Empty templates', 'Files to share'];
test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

/** Launches the real Electron application against the same isolated preference store. */
async function launch() {
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env });
    const output: string[] = [];
    app.process().stdout?.on('data', chunk => output.push(String(chunk)));
    app.process().stderr?.on('data', chunk => output.push(String(chunk)));
    try {
        page = await getMainWindow(app);
    } catch (error) {
        await test.info().attach('electron-startup', { body: output.join('') + '\nWindows: ' + app.windows().map(window => window.url()).join(', '), contentType: 'text/plain' });
        throw error;
    }
}
/** Resolves one fixture's local collection.
 * @param index - Fixture project number.
 */
function local(index: number) { return path.join(home, `editor-${index}`, 'editor_data', 'export_templates'); }

test.beforeAll(async () => {
    home = await createFixtureHome();
    const prefsPath = path.join(home, '.gd-launcher', 'prefs.json');
    const prefs = JSON.parse(await fs.readFile(prefsPath, 'utf8'));
    delete prefs.export_template_migration_offered;
    prefs.language = 'en';
    await fs.writeFile(prefsPath, JSON.stringify(prefs));
    const projects = names.map((name, index) => ({ ...SAMPLE_PROJECTS[0], name,
        path: path.join(home, `project-${index}`), launch_path: path.join(home, `editor-${index}`, 'Godot'),
        release: { ...SAMPLE_PROJECTS[0].release, version: '4.4-stable', source: 'official', mono: false },
    }));
    for (const project of projects) {
        await fs.mkdir(project.path, { recursive: true });
        await fs.writeFile(path.join(project.path, 'project.godot'), '[application]\nconfig/name="Migration fixture"\n');
        await fs.mkdir(path.dirname(project.launch_path), { recursive: true });
        await fs.writeFile(project.launch_path, 'fixture editor');
    }
    await fs.writeFile(path.join(home, '.gd-launcher', 'projects.json'), JSON.stringify(projects));
    root = path.join(home, '.gd-launcher', 'godot', 'export_templates');
    await fs.mkdir(path.join(root, '4.4.stable'), { recursive: true });
    await fs.writeFile(path.join(root, '4.4.stable', 'linux_release.x86_64'), 'shared template');
    for (const index of [0, 2]) {
        await fs.mkdir(path.join(local(index), '4.4.stable'), { recursive: true });
        await fs.writeFile(path.join(local(index), '4.4.stable', 'linux_release.x86_64'), `private build ${index}`);
    }
    await fs.writeFile(path.join(local(2), '4.4.stable', 'web_release.zip'), 'project web template');
    const variables: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home,
        APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
        XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local', 'share'),
        GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home };
    delete variables.ELECTRON_RUN_AS_NODE;
    env = Object.fromEntries(Object.entries(variables).filter((entry): entry is [string, string] => entry[1] !== undefined));
    await launch();
});
test.afterAll(async () => { await app?.close(); if (home) await fs.rm(home, { recursive: true, force: true }); });

test('postpones the upgrade offer without changing projects and remembers it across restart', async () => {
    const modal = page.getByTestId('templateMigrationModal');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('2 projects still need a decision.')).toBeVisible();
    await page.screenshot({
        path: test.info().outputPath('migration-first-run-offer.png'),
    });
    await expect(modal.getByRole('checkbox')).toHaveCount(0);
    await modal.getByRole('button', { name: 'Review projects', exact: true }).click();
    await expect(modal.getByRole('heading', { name: 'Migrate export templates', exact: true })).toBeFocused();
    await modal.getByRole('button', { name: 'Finish later', exact: true }).click();
    await page.evaluate(async () => {
        const bridge = window.__di_electron__!;
        const result = await bridge.invoke('app.getUserPreferences') as { data: Record<string, unknown> };
        await bridge.invoke('app.setUserPreferences', { ...result.data, export_template_migration_offered: false });
    });
    await page.reload();
    // Closed version-picker popovers on this route must not suppress the offer.
    await page.getByTestId('btnExportTemplates').click();
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Later', exact: true }).click();
    await expect(modal).toBeHidden();
    expect(await fs.readFile(path.join(local(0), '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('private build 0');
    const projects = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'projects.json'), 'utf8'));
    expect(projects.every((project: { exportTemplateMode?: string }) => !project.exportTemplateMode)).toBe(true);
    await app.close();
    await launch();
    await page.getByTestId('btnExportTemplates').click();
    await expect(page.getByRole('button', { name: 'Migrate projects (2)' })).toBeVisible();
    await expect(page.getByTestId('templateMigrationModal')).toBeHidden();
});

test('automatically connects an empty project and lists only unresolved projects with independent dropdown choices', async () => {
    expect((await fs.lstat(local(1))).isSymbolicLink()).toBe(true);
    await page.getByRole('button', { name: 'Migrate projects (2)' }).click();
    const modal = page.getByTestId('templateMigrationModal');
    const privateRow = modal.getByRole('listitem', { name: 'Private templates', exact: true });
    await expect(modal.getByRole('combobox')).toHaveCount(2);
    await expect(modal.getByRole('listitem', { name: 'Empty templates', exact: true })).toHaveCount(0);
    await expect(privateRow.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
    await modal.getByRole('combobox', { name: 'Files to share: Choose an option', exact: true }).selectOption('share-project');
    await page.screenshot({ path: test.info().outputPath('migration-project-options.png') });
    const previousViewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    await page.setViewportSize({ width: 720, height: 600 });
    await expect.poll(() => modal.locator('section').first().evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('migration-compact.png') });
    await page.setViewportSize(previousViewport);
    await privateRow.getByRole('combobox').selectOption('separate');
    await privateRow.getByRole('button', { name: 'Apply changes', exact: true }).click();
    await expect(privateRow).toHaveCount(0);
    await expect(modal.getByRole('combobox', { name: 'Files to share: Choose an option', exact: true })).toHaveValue('share-project');
    expect((await fs.lstat(local(0))).isSymbolicLink()).toBe(false);
    await modal.getByRole('button', { name: 'Finish later', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Migrate projects (1)' })).toBeVisible();
});

test('adds missing files while preserving existing shared files without a conflict review', async () => {
    await page.getByRole('button', { name: 'Migrate projects (1)' }).click();
    const modal = page.getByTestId('templateMigrationModal');
    await modal.getByRole('combobox', { name: 'Files to share: Choose an option', exact: true }).selectOption('share-project');
    await expect(modal.getByRole('combobox')).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath('migration-add-to-shared.png') });
    await modal.getByRole('button', { name: 'Apply changes', exact: true }).click();
    await expect.poll(async () => (await fs.lstat(local(2))).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(path.join(root, '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('shared template');
    expect(await fs.readFile(path.join(root, '4.4.stable', 'web_release.zip'), 'utf8')).toBe('project web template');
    expect(await fs.readFile(path.join(local(0), '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('private build 0');
    await expect(modal.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Refresh', exact: true })).toHaveCount(0);
    await modal.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retained originals', exact: true })).toHaveCount(0);
    const entries = await fs.readdir(path.dirname(local(2)));
    expect(entries.some(name => name.startsWith('export_templates.launcher-'))).toBe(false);
    await app.close();
    await launch();
    expect((await fs.lstat(local(2))).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(path.join(root, '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('shared template');
});

 test('keeps the connection when the shared version has no templates', async () => {
    await fs.rm(path.join(root, '4.4.stable'), { recursive: true });
    await app.close();
    await launch();
    expect((await fs.lstat(local(1))).isSymbolicLink()).toBe(true);
    expect(await fs.stat(path.join(local(1), '4.4.stable')).catch(() => null)).toBeNull();
    expect(await fs.readdir(root)).toEqual([]);
});

for (const sharedExists of [true, false]) {
    test(`deletes local export templates and connects without merging (shared installed: ${sharedExists})`, async () => {
        await app.close();
        await fs.unlink(local(2));
        await fs.mkdir(path.join(local(2), '4.4.stable'), { recursive: true });
        await fs.writeFile(path.join(local(2), '4.4.stable', 'web_release.zip'), 'discarded local web');
        await fs.writeFile(path.join(local(2), '4.4.stable', 'linux_release.x86_64'), 'discarded local linux');
        const sharedSet = path.join(root, '4.4.stable');
        await fs.rm(sharedSet, { recursive: true, force: true });
        if (sharedExists) {
            await fs.mkdir(sharedSet);
            await fs.writeFile(path.join(sharedSet, 'web_release.zip'), 'existing shared web');
        }
        await launch();
        await page.getByTestId('btnExportTemplates').click();
        await page.getByRole('button', { name: 'Migrate projects (1)' }).click();
        const modal = page.getByTestId('templateMigrationModal');
        await modal.getByRole('combobox', { name: 'Files to share: Choose an option', exact: true }).selectOption('use-shared');
        await expect(modal.getByText(/Delete this project's local export templates without adding/)).toBeVisible();
        await modal.getByRole('button', { name: 'Apply changes', exact: true }).click();
        await expect.poll(async () => page.evaluate(async () => {
            const result = await window.__di_electron__!.invoke('exportTemplates.getJobs') as { data: { stage: string }[] };
            return result.data.at(-1)?.stage;
        })).toBe('complete');
        expect((await fs.lstat(local(2))).isSymbolicLink()).toBe(true);
        expect((await fs.readdir(path.dirname(local(2)))).some(name => name.startsWith('export_templates.launcher-'))).toBe(false);
        if (sharedExists) {
            expect(await fs.readdir(sharedSet)).toEqual(['web_release.zip']);
            expect(await fs.readFile(path.join(sharedSet, 'web_release.zip'), 'utf8')).toBe('existing shared web');
        } else expect(await fs.stat(sharedSet).catch(() => null)).toBeNull();
        expect(await fs.readFile(path.join(local(0), '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('private build 0');
    });
}
