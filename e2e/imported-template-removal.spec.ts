import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ImportedTemplateBuild, ProjectDetails } from '@shared/contracts';
import { _electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { createFixtureHome } from './support/e2e-fixture-runtime';
import { getMainWindow } from './splashscreen/getMainWindow';

let home: string;
let app: ElectronApplication;
let page: Page;
let root: string;
let projectsFile: string;
let registryFile: string;
let env: Record<string, string>;
let original: ImportedTemplateBuild;
let replacement: ImportedTemplateBuild;
test.setTimeout(90_000);

/** Resolves the contents of an isolated imported fixture.
 * @param build - Build whose immutable contents are needed.
 */
function contents(build: ImportedTemplateBuild) {
    return path.join(home, '.gd-launcher', 'export-templates', 'imported', build.setId, build.directoryName);
}

/** Launches Electron against the isolated project and template stores. */
async function launch() {
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env });
    page = await getMainWindow(app);
    await page.getByTestId('btnExportTemplates').click();
}

/** Reads the saved choices independently of the renderer. */
async function projects(): Promise<ProjectDetails[]> {
    return JSON.parse(await fs.readFile(projectsFile, 'utf8'));
}

test.beforeEach(async () => {
    home = await createFixtureHome();
    root = path.join(home, '.gd-launcher', 'godot', 'export_templates');
    projectsFile = path.join(home, '.gd-launcher', 'projects.json');
    registryFile = path.join(home, '.gd-launcher', 'export-templates', 'imported-templates.json');
    const prefsFile = path.join(home, '.gd-launcher', 'prefs.json');
    const prefs = JSON.parse(await fs.readFile(prefsFile, 'utf8'));
    await fs.writeFile(prefsFile, JSON.stringify({ ...prefs, language: 'en', export_template_migration_offered: true }));
    const builds: ImportedTemplateBuild[] = [
        ['Original', '4.4.stable'],
        ['Compatible replacement', '4.4.stable'],
        ['Different version', '4.5.stable'],
        ['Different edition', '4.4.stable.mono'],
        ['Unavailable replacement', '4.4.stable'],
        ['Incomplete replacement', '4.4.stable'],
    ].map(([label, setId]) => ({ id: randomUUID(), revision: randomUUID(), label, directoryName: label, setId, importedAt: new Date().toISOString(), archiveName: 'fixture.tpz', files: label === 'Incomplete replacement' ? ['linux_release.x86_64', 'web_release.zip'] : ['linux_release.x86_64'], sizeBytes: 8 }));
    [original, replacement] = builds;
    for (const build of builds.filter((item) => item.label !== 'Unavailable replacement')) {
        await fs.mkdir(contents(build), { recursive: true });
        await fs.writeFile(path.join(contents(build), 'linux_release.x86_64'), build.label);
    }
    await fs.writeFile(registryFile, JSON.stringify({ schemaVersion: 1, builds }));
    await fs.mkdir(path.join(root, '4.5.stable'), { recursive: true });
    await fs.writeFile(path.join(root, '4.5.stable', 'linux_release.x86_64'), 'official newer');
    const saved = ['First project', 'Second project'].map((name, index) => ({
        ...SAMPLE_PROJECTS[0], name, path: path.join(home, `project-${index}`),
        launch_path: path.join(home, `editor-${index}`, 'Godot'),
        release: { ...SAMPLE_PROJECTS[0].release, version: '4.5-stable', source: 'official' as const, mono: false },
        exportTemplateMode: 'shared' as const,
        exportTemplateBuilds: { '4.4.stable': original.id, '4.6.stable': 'official' },
    }));
    for (const project of saved) {
        await fs.mkdir(project.path, { recursive: true });
        await fs.writeFile(path.join(project.path, 'project.godot'), '[application]\nconfig/name="Deletion fixture"\n');
        const data = path.join(path.dirname(project.launch_path), 'editor_data');
        await fs.mkdir(data, { recursive: true });
        await fs.writeFile(project.launch_path, 'fixture editor');
        await fs.symlink(root, path.join(data, 'export_templates'), process.platform === 'win32' ? 'junction' : 'dir');
    }
    await fs.writeFile(projectsFile, JSON.stringify(saved));
    const variables: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home,
        APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
        XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local', 'share'),
        GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home };
    delete variables.ELECTRON_RUN_AS_NODE;
    env = Object.fromEntries(Object.entries(variables).filter((entry): entry is [string, string] => entry[1] !== undefined));
    await launch();
});

test.afterEach(async () => {
    await app?.close();
    if (home) await fs.rm(home, { recursive: true, force: true });
});

test('distinguishes remembered choices and offers only matching available replacements before deletion', async () => {
    const card = page.getByRole('article', { name: 'Original', exact: true });
    await expect(card).toContainText('Projects using this build: 0.');
    await expect(card).toContainText('Projects with a remembered choice: 2.');
    await card.getByRole('button', { name: 'Delete imported build', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Delete imported build', exact: true });
    await expect(modal.getByText('Remembered choice for 4.4.stable - Standard', { exact: true })).toHaveCount(2);
    await expect(modal.getByText('Using now', { exact: true })).toHaveCount(0);
    await expect(modal.getByText('Official templates for this version are not installed. Download them before exporting.', { exact: true })).toBeVisible();
    await modal.getByRole('button', { name: /^Replacement build:/ }).click();
    await expect(page.getByRole('option')).toHaveText(['Official - 4.4.stable - Standard', 'Compatible replacement - 4.4.stable - Standard']);
    await page.getByRole('option', { name: 'Compatible replacement - 4.4.stable - Standard', exact: true }).click();
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await projects()).every((project) => project.exportTemplateBuilds?.['4.4.stable'] === original.id)).toBe(true);
    expect(await fs.readFile(path.join(contents(original), 'linux_release.x86_64'), 'utf8')).toBe('Original');
    await card.getByRole('button', { name: 'Delete imported build', exact: true }).click();
    await expect(modal.getByRole('button', { name: 'Switch and delete', exact: true })).toBeEnabled();
    await expect(modal.getByRole('button', { name: 'Switch and delete', exact: true })).toBeInViewport();
    await expect(modal.getByText('Official templates for this version are not installed. Download them before exporting.', { exact: true })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: test.info().outputPath('remembered-build-deletion.png'), animations: 'disabled' });
    await modal.getByRole('button', { name: 'Switch and delete', exact: true }).click();
    await expect(modal).toBeHidden();
    await expect(card).toHaveCount(0);
    for (const project of await projects()) {
        expect(project.exportTemplateBuilds).toEqual({ '4.4.stable': 'official', '4.6.stable': 'official' });
        expect(project.release.version).toBe('4.5-stable');
        expect(await fs.realpath(path.join(path.dirname(project.launch_path), 'editor_data', 'export_templates'))).toBe(await fs.realpath(root));
    }
    expect(await fs.stat(contents(original)).catch(() => null)).toBeNull();
    expect(await fs.readFile(path.join(root, '4.5.stable', 'linux_release.x86_64'), 'utf8')).toBe('official newer');
});

test('preserves an active build if switching fails, then switches and deletes in the modal', async () => {
    await app.close();
    const saved = await projects();
    saved[0].release.version = '4.4-stable';
    await fs.writeFile(projectsFile, JSON.stringify(saved));
    await launch();
    const card = page.getByRole('article', { name: 'Original', exact: true });
    await expect(card).toContainText('Projects using this build: 1.');
    await expect(card).toContainText('Projects with a remembered choice: 1.');
    await card.getByRole('button', { name: 'Delete imported build', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Delete imported build', exact: true });
    await expect(modal.getByText('Using now', { exact: true })).toHaveCount(1);
    await modal.getByRole('button', { name: /^Replacement build:/ }).click();
    await page.getByRole('option', { name: 'Compatible replacement - 4.4.stable - Standard', exact: true }).click();
    await app.evaluate(() => {
        const fs = process.getBuiltinModule('node:fs');
        const rename = fs.promises.rename;
        fs.promises.rename = async (source, destination) => {
            if (String(source).endsWith('.export_templates.launcher-next')) {
                fs.promises.rename = rename;
                throw new Error('fixture replacement failure');
            }
            return rename(source, destination);
        };
    });
    await modal.getByRole('button', { name: 'Switch and delete', exact: true }).click();
    await expect(modal.getByRole('alert')).toBeVisible();
    expect((await projects()).every((project) => project.exportTemplateBuilds?.['4.4.stable'] === original.id)).toBe(true);
    expect(JSON.parse(await fs.readFile(registryFile, 'utf8')).builds.some((item: ImportedTemplateBuild) => item.id === original.id)).toBe(true);
    expect(await fs.readFile(path.join(contents(original), 'linux_release.x86_64'), 'utf8')).toBe('Original');
    await modal.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(modal.getByRole('alert')).toHaveCount(0);
    await modal.getByRole('button', { name: /^Replacement build:/ }).click();
    await page.getByRole('option', { name: 'Compatible replacement - 4.4.stable - Standard', exact: true }).click();
    await expect(page.getByRole('option')).toHaveCount(0);
    await page.setViewportSize({ width: 900, height: 650 });
    await expect(modal.getByRole('button', { name: 'Switch and delete', exact: true })).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath('active-build-replacement.png'), animations: 'disabled' });
    await modal.getByRole('button', { name: 'Switch and delete', exact: true }).click();
    await expect(modal).toBeHidden();
    await expect(card).toHaveCount(0);
    expect((await projects()).every((project) => project.exportTemplateBuilds?.['4.4.stable'] === replacement.id)).toBe(true);
    const active = path.join(path.dirname(saved[0].launch_path), 'editor_data', 'export_templates', '4.4.stable');
    expect(await fs.readFile(path.join(active, 'linux_release.x86_64'), 'utf8')).toBe('Compatible replacement');
    expect(await fs.stat(contents(original)).catch(() => null)).toBeNull();
    await app.close();
    await launch();
    expect(await fs.realpath(active)).toBe(await fs.realpath(contents(replacement)));
});
