import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';
import { createFixtureHome, prepareAppWithStubbedData, setAppLanguage } from './support/e2e-fixture-runtime';
import { getMainWindow } from './splashscreen/getMainWindow';

let app: ElectronApplication;
let page: Page;
let fixtureHome: string;
let projectFile: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    projectFile = path.join(fixtureHome, 'import', 'project.godot');
    await fs.mkdir(path.dirname(projectFile), { recursive: true });
    await fs.writeFile(projectFile, 'config_version=5\n[application]\nconfig/name="Original"\nconfig/features=PackedStringArray("4.5", "GL Compatibility")\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
    const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: fixtureHome };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`], env });
    page = await getMainWindow(app);
    await setAppLanguage(page, 'English');
    await prepareAppWithStubbedData(page, app, { projects: [], installedReleases: [] });
    await app.evaluate(({ ipcMain }, file) => {
        const state = globalThis as typeof globalThis & { importCalls?: unknown[] };
        state.importCalls = [];
        ipcMain.removeHandler('app.openFileDialog');
        ipcMain.handle('app.openFileDialog', () => ({ success: true, data: { canceled: false, filePaths: [file] } }));
        ipcMain.removeHandler('projects.addProject');
        ipcMain.handle('projects.addProject', (_event, filePath, options) => {
            state.importCalls?.push({ filePath, options });
            return { success: true, data: { success: true, projects: [] } };
        });
    }, projectFile);
});

test.afterAll(async () => {
    await app?.close();
    await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('reviews editor requirements without name conflicts and restores a saved Launcher name', async () => {
    await page.getByTestId('btnProjects').click();
    await page.getByRole('button', { name: 'From this computer', exact: true }).click();
    await page.getByRole('dialog', { name: 'Review project imports' }).locator('button[aria-haspopup="listbox"]').click();
    await page.getByRole('option', { name: 'Add With Missing Editor', exact: true }).click();
    await page.getByRole('dialog', { name: 'Review project imports' }).getByRole('button', { name: 'Add projects', exact: true }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { importCalls: unknown[] }).importCalls)).toEqual([{ filePath: projectFile, options: { resolution: 'add_missing', name: 'Original' } }]);
    await expect(page.getByRole('dialog', { name: 'Review project imports' })).not.toBeVisible();
    const metadata = path.join(path.dirname(projectFile), '.godotlauncher');
    await fs.writeFile(metadata, '[config]\nversion=1\n[launcher]\nversion=1.11.1\nproject_name="Saved alias"\n[editor]\nchannel=official\nflavor=gdscript\nbase_version=4.5\nversion=4.5-stable\n');
    await page.getByRole('button', { name: 'From this computer', exact: true }).click();
    await page.getByRole('dialog', { name: 'Review project imports' }).locator('button[aria-haspopup="listbox"]').click();
    await page.getByRole('option', { name: 'Add With Missing Editor', exact: true }).click();
    await page.getByRole('dialog', { name: 'Review project imports' }).getByRole('button', { name: 'Add projects', exact: true }).click();
    await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { importCalls: unknown[] }).importCalls)).toEqual([
        { filePath: projectFile, options: { resolution: 'add_missing', name: 'Original' } },
        { filePath: projectFile, options: { resolution: 'add_missing', name: 'Saved alias' } },
    ]);
    await expect(page.getByRole('dialog', { name: 'Review project imports' })).not.toBeVisible();
    await fs.rm(metadata);
    expect(await fs.readFile(projectFile, 'utf8')).toContain('config/name="Original"');
});

test('uses compact conflict items for dropped files with inline editing, skipping and cancellation', async () => {
    await app.evaluate(({ ipcMain }) => {
        (globalThis as typeof globalThis & { importCalls: unknown[] }).importCalls = [];
        ipcMain.removeHandler('projects.inspectProjectImports');
        ipcMain.handle('projects.inspectProjectImports', (_event, paths: string[]) => ({ success: true, data: paths.map((projectFilePath) => ({
            projectFilePath, name: 'Original',
            editorRequest: { kind: 'stable-base', channel: 'official', flavor: 'gdscript', base_version: '4.8' },
            editorResolution: {
                requested: { kind: 'stable-base', channel: 'official', flavor: 'gdscript', base_version: '4.8' },
                choices: [{ id: 'installed:official:4.8-beta2:standard', version: '4.8-beta2', source: 'official', flavor: 'gdscript', prerelease: true, installed: true, recommended: true }],
            },
        })) }));
    });
    const second = path.join(fixtureHome, 'second', 'project.godot');
    await fs.mkdir(path.dirname(second), { recursive: true });
    await fs.copyFile(projectFile, second);
    const cdp = await page.context().newCDPSession(page);
    const third = path.join(fixtureHome, 'third', 'project.godot');
    const fourth = path.join(fixtureHome, 'fourth', 'project.godot');
    for (const file of [third, fourth]) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.copyFile(projectFile, file); }
    const data = { items: [], files: [projectFile, second, third, fourth], dragOperationsMask: 1 };
    await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 400, y: 300, data });
    await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: 400, y: 300, data });
    const dialog = page.getByRole('dialog', { name: 'Review project imports' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toBeFocused();
    await expect(dialog.getByRole('heading')).toHaveCSS('outline-style', 'none');
    await expect(dialog.getByText('addProject.conflicts.badges.ready', { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('listitem')).toHaveCount(4);
    await expect(dialog.getByRole('button', { name: 'Copy path', exact: true })).toHaveCount(4);
    await expect(dialog.getByRole('img', { name: 'Name conflict', exact: true })).toHaveCount(3);
    await expect(dialog.getByRole('button', { name: 'Add projects', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    expect(await app.evaluate(() => (globalThis as typeof globalThis & { importCalls: unknown[] }).importCalls)).toEqual([]);
    await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 400, y: 300, data });
    await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: 400, y: 300, data });
    await expect(dialog.getByText('Requested: 4.8', { exact: true })).toHaveCount(4);
    await expect(dialog.locator('button[aria-haspopup="listbox"]').first()).toHaveText('4.8-beta2');
    const help = dialog.getByRole('button', { name: 'Editor requirement details: Original', exact: true }).first();
    await help.focus();
    await expect(page.getByRole('tooltip')).toContainText('official');
    await expect(page.getByRole('tooltip')).toContainText('gdscript');
    await dialog.getByRole('heading').click();
    await dialog.screenshot({ path: path.resolve('.internal-docs/import-conflicts/combined-review.png') });
    await dialog.getByRole('checkbox').nth(3).uncheck();
    await dialog.getByRole('checkbox').nth(2).uncheck();
    await dialog.locator('button[aria-haspopup="listbox"]').nth(1).click();
    await dialog.screenshot({ path: path.resolve('.internal-docs/import-conflicts/resolution-menu.png') });
    await page.getByRole('option', { name: 'Add With Missing Editor', exact: true }).click();
    await expect(dialog.getByText('Requested: 4.8', { exact: true })).toHaveCount(4);
    await dialog.locator('button[aria-haspopup="listbox"]').nth(1).click();
    await page.getByRole('option', { name: /Use 4.8-beta2/ }).click();

    await dialog.getByRole('button', { name: 'Edit name: Original', exact: true }).nth(1).click();
    const name = dialog.getByLabel('Launcher name', { exact: true });
    await expect(name).toBeFocused();
    await name.fill('Cancelled edit');
    await name.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(name).not.toBeVisible();
    await dialog.getByRole('button', { name: 'Edit name: Original', exact: true }).nth(1).click();
    await name.fill(' ');
    await name.press('Enter');
    await expect(dialog.getByRole('button', { name: 'Add projects', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Edit name:', exact: true }).click();
    await name.fill('Launcher copy');
    await dialog.screenshot({ path: path.resolve('.internal-docs/import-conflicts/compact-edit.png') });
    await name.press('Enter');
    await app.evaluate(({ ipcMain }) => {
        const state = globalThis as typeof globalThis & { importCalls: unknown[]; continueImport?: () => void };
        ipcMain.removeHandler('projects.addProject');
        ipcMain.handle('projects.addProject', async (_event, filePath, options) => {
            state.importCalls.push({ filePath, options });
            if (state.importCalls.length === 2) await new Promise<void>((resolve) => { state.continueImport = resolve; });
            return { success: true, data: { success: true, projects: [] } };
        });
    });
    await expect(dialog.getByRole('button', { name: 'Add projects', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Add projects', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Editor version required' })).not.toBeVisible();
    await expect(page.getByText('Adding projects: 1/2', { exact: true })).toBeVisible();
    await app.evaluate(() => { (globalThis as typeof globalThis & { continueImport?: () => void }).continueImport?.(); });
    await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { importCalls: unknown[] }).importCalls)).toEqual([{ filePath: projectFile, options: { name: 'Original', resolution: 'use_selected', editorChoiceId: 'installed:official:4.8-beta2:standard' } }, { filePath: second, options: { name: 'Launcher copy', resolution: 'use_selected', editorChoiceId: 'installed:official:4.8-beta2:standard' } }]);
    await cdp.detach();
});

test('keeps remote name choices and successful imports when retrying a stale conflict', async () => {
    await prepareAppWithStubbedData(page, app);
    await app.evaluate(({ ipcMain }, root) => {
        const state = globalThis as typeof globalThis & { remoteImportCalls?: { filePath: string; options: { name: string } }[] };
        state.remoteImportCalls = [];
        const handlers: Record<string, (...args: unknown[]) => unknown> = {
            'projects.inspectPublicGitSource': () => ({ ok: true, canonicalUrl: 'https://example.invalid/repo.git', suggestedDirectoryName: 'repo' }),
            'projects.importRemoteProject': () => ({ ok: true, jobId: 'fixture-clone', repositoryPath: root, hasSubmodules: false, projects: [
                { name: 'Same', relativePath: 'one/project.godot', projectFilePath: `${root}/one/project.godot`, detectedEditor: null },
                { name: 'Same', relativePath: 'two/project.godot', projectFilePath: `${root}/two/project.godot`, detectedEditor: null },
            ] }),
            'git.getIdentitySettings': () => ({ globalIdentity: { name: 'Fixture', email: 'fixture@example.invalid' }, projectPreset: null }),
            'projects.resolveRemoteProjectClone': () => ({ ok: true }),
            'projects.addProject': (filePath, options) => {
                state.remoteImportCalls?.push({ filePath: filePath as string, options: options as { name: string } });
                return state.remoteImportCalls?.length === 2 ? { success: false, importConflict: 'name', error: 'Name changed during registration' } : { success: true, projects: [] };
            },
        };
        for (const [channel, handler] of Object.entries(handlers)) {
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, (_event, ...args) => ({ success: true, data: handler(...args) }));
        }
    }, fixtureHome);
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectAdd').click();
    await page.getByTestId('btnAddProjectPublicGit').click();
    await page.getByTestId('inputPublicGitRepositoryUrl').fill('https://example.invalid/repo.git');
    await page.getByTestId('btnContinueRemoteProjectImport').click();
    await page.getByTestId('btnCloneRemoteProjectRepository').click();
    const names = page.getByLabel('Launcher name', { exact: true });
    await expect(names).toHaveCount(2);
    await expect(page.getByTestId('btnAddDiscoveredProjects')).toBeDisabled();
    await names.nth(0).fill('Remote copy one');
    await names.nth(1).fill('Remote copy two');
    await page.screenshot({ path: path.resolve('.internal-docs/import-conflicts/remote-review.png') });
    await page.getByTestId('btnAddDiscoveredProjects').click();
    await page.getByRole('button', { name: 'Review and retry', exact: true }).click();
    await expect(names.nth(1)).toHaveValue('Remote copy two');
    await names.nth(1).fill('Remote retry');
    await page.getByTestId('btnAddDiscoveredProjects').click();
    await expect.poll(async () => app.evaluate(() => (globalThis as typeof globalThis & { remoteImportCalls: unknown[] }).remoteImportCalls)).toEqual([
        { filePath: `${fixtureHome}/one/project.godot`, options: { name: 'Remote copy one' } },
        { filePath: `${fixtureHome}/two/project.godot`, options: { name: 'Remote copy two' } },
        { filePath: `${fixtureHome}/two/project.godot`, options: { name: 'Remote retry' } },
    ]);
    await expect(page.getByText('Remote copy one', { exact: true })).toBeVisible();
    await page.getByTestId('btnCompleteRemoteProjectImport').click();
});
