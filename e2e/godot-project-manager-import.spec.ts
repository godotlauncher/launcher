import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Page, test } from './support/electron.fixture';
import { getMainWindow } from './splashscreen/getMainWindow';
import { createFixtureHome, prepareAppWithStubbedData, setAppLanguage } from './support/e2e-fixture-runtime';

test.setTimeout(60_000);
test.describe('Godot Project Manager import through Electron', () => {
    let app: ElectronApplication;
    let page: Page;
    let home: string;
    let source: string;
    let portable: string;
    let original: string;
    let game: string;
    let old: string;
    test.beforeAll(async () => {
        home = await createFixtureHome();
        const data = process.platform === 'darwin' ? path.join(home, 'Library/Application Support/Godot') : process.platform === 'win32' ? path.join(home, 'AppData/Roaming/Godot') : path.join(home, '.local/share/godot');
        source = path.join(data, 'projects.cfg');
        portable = path.join(home, 'portable', 'editor_data', 'projects.cfg');
        game = path.join(home, 'games', 'Registered Game');
        old = path.join(home, 'games', 'Older Game');
        await fs.mkdir(data, { recursive: true });
        await fs.mkdir(path.dirname(portable), { recursive: true });
        await fs.mkdir(game, { recursive: true });
        await fs.mkdir(old, { recursive: true });
        original = 'config_version=5\n[application]\nconfig/name="Manager Import Game"\nconfig/features=PackedStringArray("4.4")\n';
        await fs.writeFile(path.join(game, 'project.godot'), original);
        await fs.writeFile(path.join(old, 'project.godot'), 'config_version=4\n[application]\nconfig/name="Older Game"\n');
        const text = `[${game.replace(/\]/g, '\\]')}]\nfavorite=true\n[${old}]\nfavorite=false\n[${path.join(home, 'games', 'Unavailable Game')}]\nfavorite=false\n`;
        await fs.writeFile(source, text);
        await fs.writeFile(portable, text);
        const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
        delete env.ELECTRON_RUN_AS_NODE;
        app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env: { ...env, GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home } });
        page = await getMainWindow(app);
        await setAppLanguage(page, 'English');
        await prepareAppWithStubbedData(page, app, { projects: [] });
    });
    test.afterAll(async () => { await app?.close(); await fs.rm(home, { recursive: true, force: true }); });

    /** Opens the Godot source through the welcome tile or populated-view Add menu. */
    async function open() {
        if (await page.getByTestId('projectsWelcome').isVisible()) {
            await page.getByTestId('btnWelcomeAddFromGodotProjectManager').click();
        } else {
            await page.getByTestId('btnProjectAdd').click();
            await page.getByTestId('btnAddProjectGodotProjectManager').click();
        }
        return page.getByTestId('godotProjectManagerImportDialog');
    }
    /** Supplies only the native file picker result while preserving the real source reader.
     * @param file - Explicit selected file, or null for native cancellation.
     */
    async function picker(file: string | null) {
        await app.evaluate(({ ipcMain }, file) => {
            ipcMain.removeHandler('app.openFileDialog');
            ipcMain.handle('app.openFileDialog', () => ({ success: true, data: { canceled: file === null, filePaths: file ? [file] : [] } }));
        }, file);
    }

    test('discovers the normal list and previews available, older and missing registrations without writes', async () => {
        const before = await fs.readFile(source, 'utf8');
        const modal = await open();
        await expect(modal.getByRole('heading', { name: 'Choose projects to add' })).toBeVisible();
        await expect(modal.getByRole('checkbox', { name: 'Include project: Manager Import Game', exact: true })).toBeChecked();
        await expect(modal.getByText('Older Game', { exact: true }).first()).toBeVisible();
        await expect(modal.getByText('Unavailable Game', { exact: true }).first()).toBeVisible();
        await expect(modal.getByRole('region', { name: 'Unable to add', exact: true })).toBeVisible();
        await expect(modal.getByRole('checkbox', { name: /Include project:/ })).toHaveCount(1);
        await page.screenshot({ path: test.info().outputPath('manager-preview.png'), animations: 'disabled' });
        await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
        expect(await fs.readFile(source, 'utf8')).toBe(before);
        expect(await fs.readFile(path.join(game, 'project.godot'), 'utf8')).toBe(original);
        await expect(fs.stat(path.join(game, '.godotlauncher'))).rejects.toThrow();
    });

    test('selects a portable list, handles picker cancellation and registers once using the real import service', async () => {
        const before = await fs.readFile(portable, 'utf8');
        let modal = await open();
        await modal.getByRole('button', { name: 'Choose another project list' }).click();
        const chooser = page.getByTestId('godotProjectManagerSourceDialog');
        await picker(null);
        await chooser.getByRole('button', { name: 'Choose project list', exact: true }).click();
        await expect(chooser).toBeVisible();
        await picker(portable);
        await chooser.getByRole('button', { name: 'Choose project list', exact: true }).click();
        modal = page.getByTestId('godotProjectManagerImportDialog');
        await expect(modal.getByRole('heading', { name: 'Choose projects to add' })).toBeVisible();
        await modal.getByRole('button', { name: /^Godot Editor: Manager Import Game:/ }).click();
        await page.getByRole('option', { name: 'Add With Missing Editor', exact: true }).click();
        await modal.getByRole('button', { name: 'Add selected projects (1)', exact: true }).click();
        await expect(modal.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
        await expect(modal.getByText('Manager Import Game', { exact: true }).first()).toBeVisible();
        expect(await fs.readFile(portable, 'utf8')).toBe(before);
        expect(await fs.readFile(path.join(game, 'project.godot'), 'utf8')).toBe(original);
        const saved = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'projects.json'), 'utf8'));
        expect(saved.filter((project: { path: string }) => project.path === game)).toHaveLength(1);
        await modal.getByRole('button', { name: 'Done', exact: true }).click();
        modal = await open();
        await expect(modal.getByRole('region', { name: 'Already added', exact: true })).toBeVisible();
        await expect(modal.getByRole('checkbox', { name: /Include project:/ })).toHaveCount(0);
        await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    });

    test('offers manual selection with no normal source and explains malformed lists', async () => {
        await fs.rm(source);
        await open();
        const chooser = page.getByTestId('godotProjectManagerSourceDialog');
        await expect(chooser.getByText('No Godot project list was found in the usual locations.')).toBeVisible();
        const invalid = path.join(home, 'broken.cfg');
        await fs.writeFile(invalid, 'not a project list');
        await picker(invalid);
        await chooser.getByRole('button', { name: 'Choose project list', exact: true }).click();
        const modal = page.getByTestId('godotProjectManagerImportDialog');
        await expect(modal.getByRole('alert')).toContainText('The project list could not be read.');
        await expect(modal.getByRole('button', { name: /Add selected projects/ })).toHaveCount(0);
        await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
        expect(await fs.readFile(invalid, 'utf8')).toBe('not a project list');
    });
});
