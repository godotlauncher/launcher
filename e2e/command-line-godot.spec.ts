import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';
import { CommandLinePathAdapter } from '../main/src/editor-installs/command-line-path.adapter';
import { createGodotWrapper } from '../main/src/editor-installs/command-line-godot.util';
import { getMainWindow } from './splashscreen/getMainWindow';
import { SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM } from './support/e2e-fixture-data';
import { createFixtureHome, setAppLanguage, writeJson } from './support/e2e-fixture-runtime';

let app: ElectronApplication;
let page: Page;
let home: string;
let executable: string;
let appClosed = false;
let wrapper: string;
let firstRow: ReturnType<Page['getByTestId']>;
let secondRow: ReturnType<Page['getByTestId']>;
test.describe.configure({ mode: 'serial' });
test.skip(os.platform() === 'win32', 'Native Windows wrapper execution is checked on a Windows host separately.');

test.beforeAll(async () => {
    home = await fs.realpath(await createFixtureHome());
    const first = path.join(home, "Editors with spaces and 'quotes'", 'first');
    const second = path.join(home, 'Editors', 'second');
    const releases = [];
    for (const [index, directory] of [first, second].entries()) {
        const editorPath = os.platform() === 'darwin' ? `${directory}.app` : directory;
        const target = os.platform() === 'darwin' ? path.join(editorPath, 'Contents', 'MacOS', 'Godot') : editorPath;
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, '#!/bin/sh\nprintf "%s\\n" "$PWD" "$@"\nprintf "%s\\n" "editor stderr" >&2\nexit 23\n', { mode: 0o755 });
        if (index === 0) executable = target;
        releases.push({ ...SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM[index], ...(index === 1 ? { source: 'custom' as const, managed_by_launcher: false, name: 'Test Custom Editor' } : {}), editor_path: editorPath, install_path: os.platform() === 'darwin' ? editorPath : path.dirname(editorPath), console_path: undefined, valid: true });
    }
    await writeJson(path.join(home, '.gd-launcher', 'installed-releases.json'), releases);
    await writeJson(path.join(home, '.gd-launcher', 'projects.json'), []);
    const env = { ...process.env, GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env });
    page = await getMainWindow(app);
    await setAppLanguage(page, 'English');
    await page.getByTestId('btnInstalls').click();
    firstRow = page.getByTestId(`installedReleaseRow_${releases[0].version}_${releases[0].mono ? 'mono' : 'standard'}`);
    secondRow = page.getByTestId(`installedReleaseRow_${releases[1].version}_${releases[1].mono ? 'mono' : 'standard'}`);
    wrapper = os.platform() === 'darwin' ? path.join(home, 'Library', 'Application Support', 'GodotLauncher', 'bin', 'godot') : path.join(home, '.local', 'share', 'godot-launcher', 'bin', 'godot');
});

test.afterAll(async () => {
    if (!appClosed) await app?.close();
    if (home) await fs.rm(home, { recursive: true, force: true });
});

test('selects through Electron, explains preferences and forwards terminal IO, directory, arguments and status', async () => {
    await holdCommandLineSetup();
    await firstRow.getByRole('button', { name: 'Default command-line Godot', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Use as default command-line Godot', exact: true });
    await expect(confirmation.getByText(/Typing godot uses this editor/)).toBeVisible();
    const ok = confirmation.getByRole('button', { name: 'Ok', exact: true });
    try {
        await ok.click();
        await expect(ok).toBeDisabled();
        await expect(ok).toHaveAttribute('aria-busy', 'true');
        await expect(ok.locator('span[aria-hidden="true"]')).toBeVisible();
        await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
        await ok.evaluate(button => { for (let i = 0; i < 100; i++) (button as HTMLButtonElement).click(); });
        await page.keyboard.press('Escape');
        await expect(confirmation).toBeVisible();
        expect(await app.evaluate(() => (globalThis as typeof globalThis & { commandLineCalls: number }).commandLineCalls)).toBe(1);
        if (process.env.GODOT_LAUNCHER_PREVIEW_DIR) {
            await fs.mkdir(process.env.GODOT_LAUNCHER_PREVIEW_DIR, { recursive: true });
            await page.screenshot({ path: path.join(process.env.GODOT_LAUNCHER_PREVIEW_DIR, 'command-line-godot-busy.png') });
        }
    } finally {
        await releaseCommandLineSetup();
    }
    await expect(confirmation).toBeHidden();
    await expect(page.getByText(/Restart your terminal to use the command/)).toBeVisible();
    await page.getByRole('button', { name: 'Ok', exact: true }).click();
    await expect(firstRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(firstRow.getByRole('img', { name: 'Default command-line Godot', exact: true })).toBeVisible();
    const result = await run(wrapper, ['--headless', 'value with spaces', '$(echo literal)', "a'b", ''], home);
    expect(result.code).toBe(23);
    expect(result.stdout.split('\n')).toEqual([home, '--headless', 'value with spaces', '$(echo literal)', "a'b", '', '']);
    expect(result.stderr).toBe('editor stderr\n');
    const shellResult = await run('/bin/bash', ['-ic', 'godot --version'], home);
    expect(shellResult.code).toBe(23);
    expect(shellResult.stdout).toContain('--version');
    if (process.env.GODOT_LAUNCHER_PREVIEW_DIR) {
        await fs.mkdir(process.env.GODOT_LAUNCHER_PREVIEW_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.GODOT_LAUNCHER_PREVIEW_DIR, 'command-line-godot.png') });
    }
});

test('retains the default on external disappearance and reports a missing target without fallback', async () => {
    await fs.rename(executable, `${executable}.away`);
    const result = await run(wrapper, ['--version'], home);
    expect(result.code).toBe(127);
    expect(result.stderr).toContain('selected Godot editor is unavailable');
    await expect(firstRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await fs.rename(`${executable}.away`, executable);
});

test('shows the target button as busy during a failed switch and keeps the previous default', async () => {
    await holdCommandLineSetup(true);
    try {
        await secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true }).click();
        const pending = secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true });
        await expect(pending).toBeVisible();
        await expect(pending).toHaveAttribute('aria-busy', 'true');
        await expect(firstRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toHaveAttribute('aria-pressed', 'false');
        await expect(firstRow.getByRole('img', { name: 'Default command-line Godot', exact: true })).toBeVisible();
        await expect(secondRow.getByRole('img', { name: 'Default command-line Godot', exact: true })).toHaveCount(0);
        await expect(secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toBeDisabled();
    } finally {
        await releaseCommandLineSetup();
    }
    const error = page.getByRole('dialog', { name: 'Error', exact: true });
    await expect(error).toContainText('Simulated command-line setup failure');
    await error.getByRole('button', { name: 'Ok', exact: true }).click();
    await expect(secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toHaveAttribute('aria-busy', 'false');
    await expect(secondRow).toHaveAttribute('aria-busy', 'false');
    await expect(firstRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toBeEnabled();
});

test('warns about an existing command without repeating the restart reminder', async () => {
    const profile = path.join(home, '.bashrc');
    const original = await fs.readFile(profile, 'utf8');
    try {
        await fs.writeFile(profile, `${original}\nfunction godot() { echo another-editor; }\n`);
        await secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true }).click();
        const warning = page.getByRole('dialog', { name: 'Default command-line Godot', exact: true });
        await expect(warning).toContainText('Another godot command takes precedence');
        await expect(warning).not.toContainText('Restart your terminal');
        await warning.getByRole('button', { name: 'Ok', exact: true }).click();
    } finally {
        await fs.writeFile(profile, original);
    }
    await firstRow.getByRole('button', { name: 'Default command-line Godot', exact: true }).click();
    await expect(firstRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('shows the restart reminder again when a switch repairs PATH setup', async () => {
    await fs.writeFile(path.join(home, '.profile'), '# PATH configuration removed\n');
    await secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true }).click();
    const reminder = page.getByRole('dialog', { name: 'Default command-line Godot', exact: true });
    await expect(reminder).toContainText('Restart your terminal');
    await reminder.getByRole('button', { name: 'Ok', exact: true }).click();
    await firstRow.getByRole('button', { name: 'Default command-line Godot', exact: true }).click();
    await expect(firstRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('switches and clears the default while keeping PATH setup for reuse', async () => {
    const originalProfile = await fs.readFile(path.join(home, '.bashrc'), 'utf8');
    await holdCommandLineSetup();
    try {
        await secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true }).click();
        const pending = secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true });
        await expect(pending).toBeVisible();
        await expect(pending).toHaveAttribute('aria-busy', 'true');
        await expect(pending.locator('span[aria-hidden="true"]')).toBeVisible();
        await expect(firstRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toHaveAttribute('aria-pressed', 'true');
        if (process.env.GODOT_LAUNCHER_PREVIEW_DIR) {
            await fs.mkdir(process.env.GODOT_LAUNCHER_PREVIEW_DIR, { recursive: true });
            await page.screenshot({ path: path.join(process.env.GODOT_LAUNCHER_PREVIEW_DIR, 'command-line-godot-switch-busy.png') });
        }
    } finally {
        await releaseCommandLineSetup();
    }
    await expect(secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(firstRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(secondRow.getByRole('img', { name: 'Default command-line Godot', exact: true })).toBeVisible();
    await expect(firstRow.getByRole('img', { name: 'Default command-line Godot', exact: true })).toHaveCount(0);
    await holdCommandLineSetup();
    try {
        await secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true }).click();
        await expect(secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toHaveAttribute('aria-busy', 'true');
        await expect(secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toHaveAttribute('aria-pressed', 'true');
    } finally {
        await releaseCommandLineSetup();
    }
    await page.getByRole('button', { name: 'Ok', exact: true }).click();
    await expect(secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(fs.stat(wrapper)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(secondRow.getByRole('img', { name: 'Default command-line Godot', exact: true })).toHaveCount(0);
    expect(await fs.readFile(path.join(home, '.bashrc'), 'utf8')).toBe(originalProfile);
    expect((await fs.stat(path.dirname(wrapper))).isDirectory()).toBe(true);
});

test('warns on single and bulk removal and clears only the wrapper on confirmed removal', async () => {
    await secondRow.getByRole('button', { name: 'Default command-line Godot', exact: true }).click();
    await page.getByRole('dialog', { name: 'Use as default command-line Godot', exact: true }).getByRole('button', { name: 'Ok', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await secondRow.getByRole('button', { name: /Remove|Delete/ }).click();
    const warning = 'This editor is your default command-line Godot. Removing it will also remove the godot command created by Godot Launcher.';
    await expect(page.getByText(warning, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Enable multi-select' }).click();
    await secondRow.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    await page.getByRole('button', { name: 'Remove selected (1)', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Remove selected editors', exact: true });
    await expect(dialog.getByText(warning, { exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Remove selected (1)', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(fs.stat(wrapper)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await fs.readFile(path.join(home, '.bashrc'), 'utf8')).toContain('Godot Launcher PATH');
});

test('respects ZDOTDIR from .zshenv and detects login-profile conflicts', async () => {
    test.skip(!await fs.access('/bin/zsh').then(() => true, () => false), 'Zsh is unavailable on this host.');
    const shellHome = path.join(home, 'zsh home');
    const config = path.join(shellHome, 'custom-zsh');
    await fs.mkdir(config, { recursive: true });
    await fs.writeFile(path.join(shellHome, '.zshenv'), 'export ZDOTDIR="$HOME/custom-zsh"\n');
    const env = { HOME: shellHome, PATH: '/usr/bin:/bin', ZDOTDIR: undefined };
    const adapter = new CommandLinePathAdapter({ platform: os.platform(), home: shellHome, env, shell: '/bin/zsh' });
    await fs.mkdir(adapter.binDirectory, { recursive: true });
    await fs.writeFile(adapter.wrapperPath, createGodotWrapper(executable, os.platform()), { mode: 0o755 });
    expect(await adapter.register()).toEqual({ conflict: null, pathChanged: true });
    expect(await fs.readFile(path.join(config, '.zshrc'), 'utf8')).toContain(adapter.binDirectory);
    await expect(fs.stat(path.join(shellHome, '.zshrc'))).rejects.toMatchObject({ code: 'ENOENT' });
    const resolved = await new Promise<string>((resolve, reject) => execFile('/bin/zsh', ['-ic', 'command -v godot'], { env }, (error, stdout) => error ? reject(error) : resolve(stdout.trim())));
    expect(resolved).toBe(adapter.wrapperPath);
    const existing = path.join(shellHome, 'existing-bin');
    await fs.mkdir(existing);
    await fs.writeFile(path.join(existing, 'godot'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    await fs.writeFile(path.join(config, '.zprofile'), 'export PATH="$HOME/existing-bin:$PATH"\n');
    expect(await adapter.register()).toEqual({ conflict: path.join(existing, 'godot'), pathChanged: false });
});

test('runs the selected editor with Godot Launcher closed', async () => {
    await page.getByRole('button', { name: 'Disable multi-select' }).click();
    await firstRow.getByRole('button', { name: 'Default command-line Godot', exact: true }).click();
    await page.getByRole('dialog', { name: 'Use as default command-line Godot', exact: true }).getByRole('button', { name: 'Ok', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await app.close();
    appClosed = true;
    const result = await run(wrapper, ['--version'], home);
    expect(result.code).toBe(23);
    expect(result.stdout).toContain('--version');
});

/**
 * Holds the real preload request so busy UI can be inspected without timing guesses.
 * @param fail - Whether the held request should fail before calling the real handler.
 */
async function holdCommandLineSetup(fail = false) {
    await app.evaluate(({ ipcMain }, shouldFail) => {
        const channel = 'editorInstalls.setCommandLineGodot';
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> };
        const handler = ipc._invokeHandlers.get(channel)!;
        const gate = globalThis as typeof globalThis & { commandLineCalls: number; releaseCommandLineSetup: () => void; restoreCommandLineSetup: () => void };
        gate.commandLineCalls = 0;
        const pending = new Promise<void>(resolve => { gate.releaseCommandLineSetup = resolve; });
        gate.restoreCommandLineSetup = () => { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); };
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, async (...args) => {
            gate.commandLineCalls++;
            await pending;
            if (shouldFail) throw new Error('Simulated command-line setup failure');
            return handler(...args);
        });
    }, fail);
}

/** Releases the held request and restores the production handler. */
async function releaseCommandLineSetup() {
    await app.evaluate(() => {
        const gate = globalThis as typeof globalThis & { releaseCommandLineSetup: () => void; restoreCommandLineSetup: () => void };
        gate.releaseCommandLineSetup();
        gate.restoreCommandLineSetup();
    });
}

/**
 * Runs a real generated wrapper or fresh interactive shell with an isolated home.
 * @param command - Wrapper or shell executable.
 * @param args - Literal process arguments.
 * @param cwd - Working directory shared with the fixture home.
 */
function run(command: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => execFile(command, args, { cwd, env: { HOME: home, PATH: '/usr/bin:/bin', ZDOTDIR: home }, encoding: 'utf8' }, (error, stdout, stderr) => resolve({ code: typeof error?.code === 'number' ? error.code : error ? -1 : 0, stdout, stderr })));
}
