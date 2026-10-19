import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, expect, test } from '@playwright/test';
import { getMainWindow } from './splashscreen/getMainWindow';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { createFixtureHome, setAppLanguage } from './support/e2e-fixture-runtime';

test('opens project tools in every view, persists automatic opening choices and displays tray editor failures', async () => {
    test.setTimeout(90000);
    const fixtureHome = await createFixtureHome();
    expect(JSON.parse(await fs.readFile(path.join(fixtureHome, '.gd-launcher', 'prefs.json'), 'utf8')).auto_open_code_editor).toBeUndefined();
    const projects = ['vscode', 'vscodium', null].map((codeEditorId, index) => ({
        ...SAMPLE_PROJECTS[0], name: `Editor Project ${index}`, path: path.join(fixtureHome, `project-${index}`), codeEditorId, pinned: true, pinned_order: index,
    }));
    for (const project of projects) {
        await fs.mkdir(project.path);
        await fs.writeFile(path.join(project.path, 'project.godot'), 'config_version=5\n[application]\nconfig/name="Editor Test"\n');
    }
    await fs.writeFile(path.join(fixtureHome, '.gd-launcher', 'projects.json'), JSON.stringify(projects));
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`], env: { ...env, GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: fixtureHome } });
    try {
        const page = await getMainWindow(app);
        await setAppLanguage(page, 'English');
        // Keep real Electron IPC, controller and stored-project resolution; replace only external dispatch.
        await app.evaluate(async (_, root) => {
            const requireModule = process.getBuiltinModule('module').createRequire(pathJoin(root, 'main.js'));
            const { CodeEditorIntegrationService } = requireModule(pathJoin(root, 'codeEditorIntegration/codeEditorIntegration.service.js'));
            const { TerminalService } = requireModule(pathJoin(root, 'tool-integration/integrations/terminal/terminal.service.js'));
            const { TerminalAdapterService } = requireModule(pathJoin(root, 'tool-integration/integrations/terminal/terminal-adapter.service.js'));
            const state = globalThis as unknown as { editorCalls: string[][]; terminalCalls: string[]; terminalAvailable: boolean };
            state.editorCalls = []; state.terminalCalls = []; state.terminalAvailable = true;
            TerminalAdapterService.prototype.discover = async () => state.terminalAvailable ? [{ id: process.platform === 'win32' ? 'command-prompt' : process.platform === 'darwin' ? 'macos-terminal' : 'gnome-terminal', displayName: 'Test Terminal', executablePath: process.execPath }] : [];
            TerminalAdapterService.prototype.isAvailable = async () => state.terminalAvailable;
            CodeEditorIntegrationService.prototype.openProjectFolder = async (id: string, folder: string) => { state.editorCalls.push([id, folder]); return { success: true }; };
            TerminalService.prototype.openProject = async (folder: string) => { state.terminalCalls.push(folder); return { success: true }; };
            function pathJoin(base: string, suffix: string) { return `${base}/${suffix}`; }
        }, path.resolve('dist-electron'));
        await page.getByTestId('btnSettings').click();
        await page.getByTestId('tabTools').click();
        await page.getByRole('button', { name: 'Rescan Terminal', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Rescan Terminal', exact: true })).toBeEnabled();
        await page.getByTestId('btnProjects').click();
        for (const view of ['tabProjectCards', 'tabProjectList', 'tabProjectDenseList']) {
            await page.getByTestId(view).click();
            const first = page.locator('[data-project-path]').filter({ has: page.getByText('Editor Project 0', { exact: true }) });
            const none = page.locator('[data-project-path]').filter({ has: page.getByText('Editor Project 2', { exact: true }) });
            await expect(none.getByTestId('btnProjectOpenTools')).toHaveCount(0);
            await first.getByTestId('btnProjectTerminal').click();
            const arrow = first.getByTestId('btnProjectOpenTools');
            await arrow.focus(); await page.keyboard.press('Enter');
            await expect(page.getByRole('dialog').getByRole('button', { name: 'Open Terminal Here' })).toBeVisible();
            await expect(page.getByRole('dialog').getByRole('button', { name: 'Open Terminal Here' })).toBeFocused();
            if (view === 'tabProjectCards') await page.screenshot({ path: '/tmp/launcher-project-tools.png', animations: 'disabled' });
            await page.keyboard.press('Escape');
            await expect(arrow).toBeFocused();
            await arrow.click();
            await page.getByRole('dialog').getByRole('button', { name: 'Open in Visual Studio Code' }).click();
        }
        const codium = page.locator('[data-project-path]').filter({ has: page.getByText('Editor Project 1', { exact: true }) });
        await codium.getByTestId('btnProjectOpenTools').click();
        const codiumAction = page.getByRole('dialog').getByRole('button', { name: 'Open in VSCodium' });
        await expect(codiumAction.locator('img')).toBeVisible();
        await codiumAction.click();
        const calls = await app.evaluate(() => {
            const state = globalThis as unknown as { editorCalls: string[][]; terminalCalls: string[] };
            return { editor: state.editorCalls, terminal: state.terminalCalls };
        });
        expect(calls.editor).toEqual([['vscode', projects[0].path], ['vscode', projects[0].path], ['vscode', projects[0].path], ['vscodium', projects[1].path]]);
        expect(calls.terminal).toEqual(Array(3).fill(projects[0].path));
        const storedProjects = JSON.parse(await fs.readFile(path.join(fixtureHome, '.gd-launcher', 'projects.json'), 'utf8'));
        expect(storedProjects[0].last_opened).toEqual(JSON.parse(JSON.stringify(projects[0].last_opened)));
        await page.getByTestId('btnSettings').click();
        await page.getByTestId('tabTools').click();
        await page.getByRole('button', { name: 'Edit Terminal', exact: true }).click();
        const terminalEnabled = page.getByLabel('Enable terminal for project folders');
        await expect(terminalEnabled).toBeChecked();
        await terminalEnabled.click();
        await expect(terminalEnabled).not.toBeChecked();
        await expect(terminalEnabled).toBeEnabled();
        await page.getByRole('dialog', { name: 'Terminal settings' }).getByRole('button', { name: 'Close drawer', exact: true }).click();
        await page.getByTestId('btnProjects').click();
        for (const view of ['tabProjectCards', 'tabProjectList', 'tabProjectDenseList']) {
            await page.getByTestId(view).click();
            const first = page.locator('[data-project-path]').filter({ has: page.getByText('Editor Project 0', { exact: true }) });
            const editor = first.getByRole('button', { name: 'Open in Visual Studio Code', exact: true });
            await expect(editor.locator('img')).toBeVisible();
            await expect(first.getByTestId('btnProjectOpenTools')).toHaveCount(0);
            await expect(first.getByTestId('btnProjectTerminal')).toHaveCount(0);
            await editor.click();
        }
        const noEditor = page.locator('[data-project-path]').filter({ has: page.getByText('Editor Project 2', { exact: true }) });
        await expect(noEditor.getByTestId('btnProjectTerminal')).toBeVisible();
        await codium.getByRole('button', { name: 'Open in VSCodium', exact: true }).click();
        await page.screenshot({ path: test.info().outputPath('editor-only-actions.png'), animations: 'disabled' });
        await page.getByTestId('btnSettings').click();
        await page.getByTestId('tabTools').click();
        await page.getByRole('button', { name: 'Edit Terminal', exact: true }).click();
        await terminalEnabled.click();
        await expect(terminalEnabled).toBeChecked();
        await expect(terminalEnabled).toBeEnabled();
        await page.getByRole('dialog', { name: 'Terminal settings' }).getByRole('button', { name: 'Close drawer', exact: true }).click();
        await page.getByTestId('btnProjects').click();
        await expect(page.getByTestId('btnProjectOpenTools')).toHaveCount(2);
        await expect(page.getByTestId('btnProjectTerminal')).toHaveCount(3);
        await app.evaluate(() => { (globalThis as unknown as { terminalAvailable: boolean }).terminalAvailable = false; });
        await page.getByTestId('btnSettings').click();
        await page.getByTestId('tabTools').click();
        await page.getByRole('button', { name: 'Rescan Terminal', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Rescan Terminal', exact: true })).toBeEnabled();
        await page.getByTestId('btnProjects').click();
        await expect(page.getByTestId('btnProjectCodeEditor')).toHaveCount(2);
        await expect(page.getByTestId('btnProjectOpenTools')).toHaveCount(0);
        await page.getByTestId('btnProjectCodeEditor').first().click();
        const fallbackCalls = await app.evaluate(() => {
            const state = globalThis as unknown as { editorCalls: string[][]; terminalCalls: string[] };
            return { editor: state.editorCalls.slice(4), terminal: state.terminalCalls };
        });
        expect(fallbackCalls.editor).toEqual([['vscode', projects[0].path], ['vscode', projects[0].path], ['vscode', projects[0].path], ['vscodium', projects[1].path], ['vscode', projects[0].path]]);
        expect(fallbackCalls.terminal).toEqual(Array(3).fill(projects[0].path));
        await page.getByTestId('btnSettings').click();
        await page.getByTestId('tabBehavior').click();
        const autoOpen = page.getByTestId('chkAutoOpenCodeEditor');
        await expect(autoOpen).toBeChecked();
        await autoOpen.click();
        await expect(autoOpen).not.toBeChecked();
        await expect.poll(async () => JSON.parse(await fs.readFile(path.join(fixtureHome, '.gd-launcher', 'prefs.json'), 'utf8')).auto_open_code_editor).toBe(false);
        await page.reload();
        await expect(page.getByTestId('chkAutoOpenCodeEditor')).not.toBeChecked();
        await page.getByTestId('chkAutoOpenCodeEditor').click();
        await expect(page.getByTestId('chkAutoOpenCodeEditor')).toBeChecked();
        await expect.poll(async () => JSON.parse(await fs.readFile(path.join(fixtureHome, '.gd-launcher', 'prefs.json'), 'utf8')).auto_open_code_editor).toBe(true);
        await page.reload();
        await expect(page.getByTestId('chkAutoOpenCodeEditor')).toBeChecked();
        await page.getByTestId('btnProjects').click();
        // Exercise the native tray callback and renderer failure event with a deterministic launch result.
        await app.evaluate(async ({ BrowserWindow }, root) => {
            const requireModule = process.getBuiltinModule('module').createRequire(`${root}/main.js`);
            const { ProjectsService } = requireModule(`${root}/projects/projects.service.js`);
            ProjectsService.prototype.launchProject = async () => ({ launched: true, codeEditorWarning: { success: false, reason: 'launch-failed', editor: 'Visual Studio Code' } });
            const window = BrowserWindow.getAllWindows().find(candidate => candidate.webContents.getURL().startsWith('http://localhost:5123'));
            window?.hide();
            const { updateMenu } = requireModule(`${root}/helpers/tray.helper.js`);
            const menu = await updateMenu(undefined, window);
            const item = menu.items.find((candidate: Electron.MenuItem) => candidate.label === 'Editor Project 0');
            item.click();
        }, path.resolve('dist-electron'));
        await expect(page.getByText('Could not open code editor', { exact: true })).toBeVisible();
        expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some(window => window.isVisible() && window.webContents.getURL().startsWith('http://localhost:5123')))).toBe(true);
        await page.getByRole('button', { name: 'Open settings', exact: true }).click();
        await expect(page.getByTestId('tabCodeEditors')).toHaveAttribute('aria-selected', 'true');
    } finally {
        await app.close();
        await fs.rm(fixtureHome, { recursive: true, force: true });
    }
});
