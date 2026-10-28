import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { InstalledRelease, RegisterCustomEngineResult } from '@shared/contracts';
import { _electron, type ElectronApplication, expect, type Page, test } from './support/electron.fixture';
import { THEMES } from './support/e2e-fixture-theme';
import { applyTheme, createFixtureHome, writeJson } from './support/e2e-fixture-runtime';
import { getMainWindow } from './splashscreen/getMainWindow';

let app: ElectronApplication;
let page: Page;
let home: string;
let prefsPath: string;
let bin: string;
const choiceName = 'Automatically create named aliases';
const choice = () => page.getByRole('checkbox', { name: choiceName, exact: true });
test.describe.configure({ mode: 'serial' });
test.skip(os.platform() === 'win32', 'Native wrapper invocation requires a Windows host.');

test.beforeAll(async () => {
    home = await fs.realpath(await createFixtureHome());
    prefsPath = path.join(home, '.gd-launcher', 'prefs.json');
    const prefs = JSON.parse(await fs.readFile(prefsPath, 'utf8'));
    delete prefs.auto_create_editor_aliases;
    await writeJson(prefsPath, { ...prefs, first_run: true, language: 'en', auto_start: false, start_in_tray: false });
    await writeJson(path.join(home, '.gd-launcher', 'installed-releases.json'), []);
    await writeJson(path.join(home, '.gd-launcher', 'projects.json'), []);
    const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), PATH: '/usr/bin:/bin', GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env });
    page = await getMainWindow(app);
    await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('app.setAutoStart');
        ipcMain.handle('app.setAutoStart', () => ({ success: true, data: { success: true } }));
    });
    await page.evaluate(() => localStorage.setItem('godot-launcher.onboarding.step', 'preferences'));
    await page.reload();
    bin = os.platform() === 'darwin' ? path.join(home, 'Library', 'Application Support', 'GodotLauncher', 'bin') : path.join(home, '.local', 'share', 'godot-launcher', 'bin');
});

test.afterAll(async () => {
    await app?.close();
    if (home) await fs.rm(home, { recursive: true, force: true });
});

/**
 * Calls the real preload-facing main handler and unwraps its transport response.
 * @param manifest - Fixture-owned custom manifest.
 * @param replaceExisting - Whether this registration explicitly replaces its identity.
 */
async function register(manifest: string, replaceExisting = false): Promise<RegisterCustomEngineResult> {
    return app.evaluate(async ({ ipcMain, BrowserWindow }, data) => {
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> };
        const sender = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('http://localhost:5123'))!.webContents;
        const response = await ipc._invokeHandlers.get('editorInstalls.registerCustomEditor')!({ sender, senderFrame: sender.mainFrame }, data.manifest, { replaceExisting: data.replaceExisting }) as { data: RegisterCustomEngineResult };
        return response.data;
    }, { manifest, replaceExisting });
}

/**
 * Creates a real disposable editor and manifest for automatic alias setup.
 * @param version - Portable custom identity and suggestion source.
 * @param suffix - Directory distinguishing replacement fixtures.
 */
async function manifestFor(version: string, suffix = '') {
    const directory = path.join(home, `editor-${version}${suffix}`);
    const editor = os.platform() === 'darwin' ? path.join(directory, 'Godot.app') : path.join(directory, 'Godot');
    const executable = os.platform() === 'darwin' ? path.join(editor, 'Contents', 'MacOS', 'Godot') : editor;
    await fs.mkdir(path.dirname(executable), { recursive: true });
    await fs.writeFile(executable, '#!/bin/sh\nprintf "automatic alias fixture\\n"\n', { mode: 0o755 });
    const manifest = path.join(directory, 'manifest.json');
    await writeJson(manifest, { schema_version: 1, version, name: `Custom ${version}`, base_version: '4.8', flavor: 'gdscript', config_version: 5, platforms: [{ platform: os.platform() === 'darwin' ? 'macos' : 'linux', arch: os.arch(), paths: { editor } }] });
    return { manifest, editor, executable };
}

test('onboarding defaults off and saves the same choice shown in Settings', async () => {
    await expect(page.getByTestId('onboarding-step-heading')).toHaveText('Choose your preferences');
    await expect(choice()).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByTestId('onboarding-step-heading')).toHaveText('Command line');
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(page.getByRole('checkbox')).toHaveCount(1);
    const cliPreview = page.getByRole('region', { name: 'Godot Launcher CLI', exact: true });
    await expect(cliPreview).toContainText('Coming soon');
    await expect(cliPreview).toContainText('Use Godot Launcher from your terminal.');
    await expect(cliPreview.locator('button, input, a, [tabindex]')).toHaveCount(0);
    await expect(choice()).not.toBeChecked();
    await choice().check();
    await page.screenshot({ path: path.join(os.tmpdir(), 'automatic-alias-onboarding.png'), animations: 'disabled' });
    // This remains a draft until the existing Finish action persists onboarding.
    expect(JSON.parse(await fs.readFile(prefsPath, 'utf8')).auto_create_editor_aliases).not.toBe(true);
    await page.getByRole('button', { name: 'Finish and view projects', exact: true }).click();
    await expect(page.getByTestId('btnSettings')).toBeVisible();
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabInstalls').click();
    await expect(choice()).toHaveCount(0);
    await page.getByTestId('tabCommandLine').click();
    await expect(page).toHaveURL(/#\/settings\/commandLine$/);
    await expect(choice()).toBeChecked();
    await expect(choice()).toHaveAccessibleDescription(/Godot 4\.7\.2 becomes godot472/);
    await page.screenshot({ path: path.join(os.tmpdir(), 'automatic-alias-settings.png'), animations: 'disabled' });
    expect(JSON.parse(await fs.readFile(prefsPath, 'utf8')).auto_create_editor_aliases).toBe(true);
    await page.reload();
    await expect(choice()).toBeChecked();
});

test('keeps the static Coming soon badge readable and noninteractive across themes and scaled layouts', async () => {
    const originalViewport = page.viewportSize();
    const previousFont = await page.evaluate(() => document.documentElement.style.fontSize);
    try {
        for (const theme of THEMES) {
            await applyTheme(page, theme);
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabInstalls').focus();
            await page.keyboard.press('ArrowDown');
            await expect(page.getByTestId('tabCommandLine')).toBeFocused();
            await expect(page.getByTestId('tabCommandLine')).toHaveAttribute('aria-selected', 'true');
            const preview = page.getByRole('region', { name: 'Godot Launcher CLI', exact: true });
            await expect(preview).toContainText('Coming soon');
            await expect(preview.locator('button, input, a, [tabindex]')).toHaveCount(0);
            await page.screenshot({ path: path.join(os.tmpdir(), `launcher-cli-preview-${theme.name}.png`), animations: 'disabled' });
            await page.setViewportSize({ width: 1024, height: 760 });
            await page.evaluate(() => { document.documentElement.style.fontSize = '125%'; });
            await expect(preview.getByText('Coming soon', { exact: true })).toBeInViewport();
            expect(await preview.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
            await page.evaluate(value => { document.documentElement.style.fontSize = value; }, previousFont);
            if (originalViewport) await page.setViewportSize(originalViewport);
        }
    } finally {
        await page.evaluate(value => { document.documentElement.style.fontSize = value; }, previousFont);
        if (originalViewport) await page.setViewportSize(originalViewport);
    }
});

test('Settings off creates no command; turning it on does not backfill existing editors', async () => {
    await choice().click();
    await expect(choice()).not.toBeChecked();
    await expect(choice()).toBeEnabled();
    const editor = await manifestFor('4.7.2-custom');
    const result = await register(editor.manifest);
    expect(result.success).toBe(true);
    expect(result.commandLineAlias).toBeUndefined();
    await expect(fs.access(path.join(bin, 'godot472'))).rejects.toThrow();
    await choice().click();
    await expect(choice()).toBeChecked();
    await expect(choice()).toBeEnabled();
    await expect(fs.access(path.join(bin, 'godot472'))).rejects.toThrow();
});

test('automatically creates a real command and keeps it when the setting is turned off', async () => {
    const editor = await manifestFor('4.8-custom');
    const result = await register(editor.manifest);
    expect(result).toMatchObject({ success: true, commandLineAlias: { name: 'godot48', pathChanged: true } });
    const content = await fs.readFile(path.join(bin, 'godot48'), 'utf8');
    expect(content).toContain(editor.executable);
    const output = await new Promise<string>((resolve, reject) => execFile(path.join(bin, 'godot48'), [], (error, stdout) => error ? reject(error) : resolve(stdout)));
    expect(output).toBe('automatic alias fixture\n');
    await expect(fs.access(path.join(bin, 'godot'))).rejects.toThrow();
    await page.reload();
    await choice().click();
    await expect(choice()).not.toBeChecked();
    await expect(choice()).toBeEnabled();
    expect(await fs.readFile(path.join(bin, 'godot48'), 'utf8')).toBe(content);
    await choice().click();
    await expect(choice()).toBeChecked();
    await expect(choice()).toBeEnabled();
    const replacement = await manifestFor('4.8-custom', '-replacement');
    expect(await register(replacement.manifest, true)).toMatchObject({ success: true });
    expect(await fs.readFile(path.join(bin, 'godot48'), 'utf8')).toContain(replacement.executable);
});

test('a collision keeps the new editor registered and leaves existing commands untouched', async () => {
    const original = await fs.readFile(path.join(bin, 'godot48'), 'utf8');
    const editor = await manifestFor('4.8-another');
    const result = await register(editor.manifest);
    expect(result).toMatchObject({ success: true, commandLineAlias: { name: 'godot48', pathChanged: false } });
    expect(result.commandLineAlias?.error).toContain('Already used by');
    expect(await fs.readFile(path.join(bin, 'godot48'), 'utf8')).toBe(original);
    const installed = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'installed-releases.json'), 'utf8')) as InstalledRelease[];
    expect(installed.some(release => release.version === '4.8-another')).toBe(true);
    await expect(fs.access(editor.executable)).resolves.toBeUndefined();
});

test('reports collision feedback through the normal custom registration UI', async () => {
    const editor = await manifestFor('4.8-third');
    await app.evaluate(({ ipcMain }, manifest) => {
        const channel = 'app.openFileDialog';
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> };
        const original = ipc._invokeHandlers.get(channel)!;
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, () => {
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, original);
            return { success: true, data: { canceled: false, filePaths: [manifest] } };
        });
    }, editor.manifest);
    await page.getByTestId('btnInstalls').click();
    await page.getByTestId('btnAddCustomEngineMenu').click();
    await page.getByTestId('btnAddCustomEngine').click();
    const success = page.getByRole('dialog', { name: 'Success', exact: true });
    await expect(success).toContainText('4.8-third');
    await success.getByRole('button', { name: 'Ok', exact: true }).click();
    const warning = page.getByRole('article', { name: 'Could not finish setting up godot48', exact: true });
    await expect(warning).toContainText('Already used by');
    await expect(page.getByTestId('installedReleaseRow_4.8-third_standard')).toBeVisible();
    await warning.getByRole('button', { name: /Dismiss/ }).click();
});

test('reports completed official setup with terminal restart guidance on the shared progress channel', async () => {
    const installed = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'installed-releases.json'), 'utf8')) as InstalledRelease[];
    await app.evaluate(({ BrowserWindow }, release) => {
        const progress = { id: 'automatic-alias-complete-fixture', version: release.version, mono: release.mono, prerelease: false, published_at: null, stage: 'complete', canCancel: false, percent: 100, release, commandLineAlias: { name: 'godot48', pathChanged: true } };
        for (const window of BrowserWindow.getAllWindows()) window.webContents.send('release-install-progress', progress);
    }, installed[0]);
    const notice = page.getByRole('article', { name: 'Command godot48 created', exact: true });
    await expect(notice).toContainText('Restart your terminal');
    await expect(notice).toHaveCount(1);
    await notice.getByRole('button', { name: /Dismiss/ }).click();
});

test('keeps the confirmed choice when saving fails and allows an explicit retry', async () => {
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabCommandLine').click();
    await expect(choice()).toBeChecked();
    await app.evaluate(({ ipcMain }) => {
        const channel = 'app.setUserPreferences';
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> };
        const original = ipc._invokeHandlers.get(channel)!;
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, () => {
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, original);
            throw new Error('Simulated preference write failure');
        });
    });
    await choice().click();
    await expect(page.getByRole('alert')).toContainText('Simulated preference write failure');
    await expect(choice()).toBeChecked();
    await expect(choice()).toBeEnabled();
    await choice().click();
    await expect(choice()).not.toBeChecked();
    await expect(page.getByRole('alert')).toHaveCount(0);
});
