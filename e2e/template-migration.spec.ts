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
    await expect(modal.getByText('3 projects still need a decision.')).toBeVisible();
    await page.screenshot({
        path: test.info().outputPath('migration-first-run-offer.png'),
    });
    await expect(modal.getByRole('checkbox')).toHaveCount(0);
    await modal.getByRole('button', { name: 'Review projects', exact: true }).click();
    await expect(modal.getByRole('heading', { name: 'Migrate export templates', exact: true })).toBeFocused();
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
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
    await expect(page.getByRole('button', { name: 'Migrate projects (3)' })).toBeVisible();
    await expect(page.getByTestId('templateMigrationModal')).toBeHidden();
});

test('keeps a project separate and reviews an empty project before connecting it', async () => {
    await page.getByRole('button', { name: 'Migrate projects (3)' }).click();
    const modal = page.getByTestId('templateMigrationModal');
    await modal.getByRole('button', { name: /Private templates/ }).click();
    await expect(modal.getByRole('radio', { name: /Keep this project's templates separate/ })).toBeChecked();
    await page.screenshot({
        path: test.info().outputPath('migration-project-options.png'),
    });
    const previousViewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    await page.setViewportSize({ width: 720, height: 600 });
    await page.screenshot({ path: test.info().outputPath('migration-compact.png') });
    const bounds = await modal.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(720);
    await page.setViewportSize(previousViewport);
    await modal.getByRole('radio', { name: /Keep this project's templates separate/ }).check();
    await modal.getByRole('button', { name: 'Keep separate', exact: true }).click();
    await expect(modal.getByText('Kept separate', { exact: true }).first()).toBeVisible();
    expect((await fs.lstat(local(0))).isSymbolicLink()).toBe(false);
    await modal.getByRole('button', { name: /Empty templates/ }).click();
    await modal.getByRole('radio', { name: /Use the shared templates/ }).check();
    await modal.getByRole('button', { name: 'Review changes', exact: true }).click();
    await expect(modal.getByRole('region', { name: 'Review template changes' })).toBeVisible();
    expect(await fs.lstat(local(1)).catch(() => null)).toBeNull();
    await page.screenshot({ path: test.info().outputPath('migration-review.png') });
    await modal.getByRole('button', { name: 'Apply changes', exact: true }).click();
    await expect.poll(async () => (await fs.lstat(local(1)).catch(() => null))?.isSymbolicLink()).toBe(true);
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Migrate projects (1)' })).toBeVisible();
});

test('reopens queued review and requires explicit decisions for unverified additions and conflicts', async () => {
    await page.getByRole('button', { name: 'Migrate projects (1)' }).click();
    const modal = page.getByTestId('templateMigrationModal');
    await modal.getByRole('button', { name: /Files to share/ }).click();
    await modal.getByText('Other options', { exact: true }).click();
    await modal.getByRole('radio', { name: /Share this project's templates/ }).check();
    await modal.getByRole('button', { name: 'Review changes', exact: true }).click();
    const review = modal.getByRole('region', { name: 'Review template changes' });
    await expect(review).toBeVisible();
    await expect(review.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
    await page.screenshot({
        path: test.info().outputPath('migration-file-review.png'),
    });
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnExportTemplates').click();
    await page.getByRole('button', { name: 'Migrate projects (1)' }).click();
    await modal.getByRole('button', { name: /Files to share/ }).click();
    await expect(review).toBeVisible();
    await expect(review.getByRole('combobox')).toHaveCount(2);
    await review.getByRole('combobox').nth(0).selectOption('shared');
    await expect(review.getByRole('button', { name: 'Apply changes' })).toBeDisabled();
    await review.getByRole('combobox').nth(1).selectOption('incoming');
    await review.getByRole('button', { name: 'Apply changes' }).click();
    await expect.poll(async () => (await fs.lstat(local(2))).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(path.join(root, '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('shared template');
    expect(await fs.readFile(path.join(root, '4.4.stable', 'web_release.zip'), 'utf8')).toBe('project web template');
    expect(await fs.readFile(path.join(local(0), '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('private build 0');
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retained originals', exact: true })).toBeVisible();
});

test('restores retained originals after restart and refuses overwriting later shared changes', async () => {
    await app.close();
    await launch();
    await page.getByTestId('btnExportTemplates').click();
    await page.getByRole('button', { name: 'Retained originals', exact: true }).click();
    const modal = page.getByTestId('templateMigrationModal');
    await modal.getByText('Retained originals (1)', { exact: true }).click();
    await modal.getByRole('button', { name: 'Restore previous templates', exact: true }).click();
    const changedFile = path.join(root, '4.4.stable', 'web_release.zip');
    await fs.writeFile(changedFile, 'later user change');
    await modal.getByRole('button', { name: 'Restore previous templates', exact: true }).click();
    await expect(modal.getByRole('alert')).toBeVisible();
    expect((await fs.lstat(local(2))).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(changedFile, 'utf8')).toBe('later user change');
    await fs.writeFile(changedFile, 'project web template');
    await modal.getByRole('button', { name: 'Restore previous templates', exact: true }).click();
    await expect.poll(async () => (await fs.lstat(local(2))).isSymbolicLink()).toBe(false);
    expect(await fs.readFile(path.join(local(2), '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('private build 2');
    expect(await fs.readFile(path.join(local(2), '4.4.stable', 'web_release.zip'), 'utf8')).toBe('project web template');
    expect(await fs.readFile(path.join(root, '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('shared template');
    expect(await fs.stat(changedFile).catch(() => null)).toBeNull();
    const projects = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'projects.json'), 'utf8'));
    expect(projects[2].exportTemplateMode).toBe('separate');
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
});

test('requires explicit confirmation before removing retained originals', async () => {
    await app.close();
    const projectFile = path.join(home, '.gd-launcher', 'projects.json');
    const projects = JSON.parse(await fs.readFile(projectFile, 'utf8'));
    delete projects[2].exportTemplateMode;
    await fs.writeFile(projectFile, JSON.stringify(projects));
    await launch();
    await page.getByTestId('btnExportTemplates').click();
    await page.getByRole('button', { name: 'Migrate projects (1)', exact: true }).click();
    const modal = page.getByTestId('templateMigrationModal');
    await modal.getByRole('button', { name: /Files to share/ }).click();
    await modal.getByRole('radio', { name: /Use the shared templates/ }).check();
    await modal.getByRole('button', { name: 'Review changes', exact: true }).click();
    await modal.getByRole('button', { name: 'Apply changes', exact: true }).click();
    await expect.poll(async () => (await fs.lstat(local(2))).isSymbolicLink()).toBe(true);
    await modal.getByText('Retained originals (1)', { exact: true }).click();
    await modal.getByRole('button', { name: 'Remove retained originals', exact: true }).click();
    const parent = path.dirname(local(2));
    const backup = (await fs.readdir(parent)).find(name => name.startsWith('export_templates.launcher-'));
    expect(backup).toBeTruthy();
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await fs.stat(path.join(parent, backup!))).toBeTruthy();
    await modal.getByRole('button', { name: 'Remove retained originals', exact: true }).click();
    await expect(modal.getByText(/Permanently remove these original templates/)).toBeVisible();
    await modal.getByRole('button', { name: 'Remove retained originals', exact: true }).click();
    await expect.poll(async () => fs.stat(path.join(parent, backup!)).catch(() => null)).toBeNull();
    expect((await fs.lstat(local(2))).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(path.join(root, '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('shared template');
});
