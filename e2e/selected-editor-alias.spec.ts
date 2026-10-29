import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { InstalledRelease } from '@shared/contracts';
import { _electron, type ElectronApplication, expect, type Page, test } from './support/electron.fixture';
import { getMainWindow } from './splashscreen/getMainWindow';
import { SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM } from './support/e2e-fixture-data';
import { applyTheme, createFixtureHome, setAppLanguage, writeJson } from './support/e2e-fixture-runtime';

import { THEMES } from './support/e2e-fixture-theme';

let app: ElectronApplication;
let page: Page;
let home: string;
let bin: string;
let editors: InstalledRelease[];
let preferenceBefore: string;

test.describe.configure({ mode: 'serial' });
test.skip(os.platform() === 'win32', 'POSIX fixture executables require native Windows coverage separately.');

test.beforeAll(async () => {
    home = await fs.realpath(await createFixtureHome());
    editors = [];
    for (const [index, release] of SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM.entries()) {
        const editorPath = path.join(home, 'Editors', `editor-${index}${os.platform() === 'darwin' ? '.app' : ''}`);
        const executable = os.platform() === 'darwin' ? path.join(editorPath, 'Contents', 'MacOS', 'Godot') : path.join(editorPath, 'Godot');
        await fs.mkdir(path.dirname(executable), { recursive: true });
        await fs.writeFile(executable, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
        editors.push({ ...release, install_path: editorPath, editor_path: os.platform() === 'darwin' ? editorPath : executable, console_path: undefined, valid: true });
    }
    await writeJson(path.join(home, '.gd-launcher', 'installed-releases.json'), editors);
    await writeJson(path.join(home, '.gd-launcher', 'projects.json'), []);
    const env = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), PATH: '/usr/bin:/bin', GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env });
    page = await getMainWindow(app);
    await setAppLanguage(page, 'English');
    await page.evaluate(async (installed) => {
        const bridge = window.__di_electron__;
        if (!bridge) throw new Error('Missing bridge');
        for (const response of [await bridge.invoke('editorInstalls.setCommandLineGodot', installed[0]), await bridge.invoke('editorInstalls.setCommandLineAlias', installed[2], 'studio')])
            if (!response.success) throw new Error(response.error.message);
    }, editors);
    bin = os.platform() === 'darwin' ? path.join(home, 'Library', 'Application Support', 'GodotLauncher', 'bin') : path.join(home, '.local', 'share', 'godot-launcher', 'bin');
    preferenceBefore = await fs.readFile(path.join(home, '.gd-launcher', 'prefs.json'), 'utf8');
    await page.getByTestId('btnInstalls').click();
    await page.getByRole('button', { name: 'Enable multi-select' }).click();
});

test.afterAll(async () => {
    await app?.close();
    if (home) await fs.rm(home, { recursive: true, force: true });
});

/** Opens a selected action from the shared toolbar.
 * @param name - Exact visible menu action.
 */
async function action(name: string) {
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    await page.getByRole('button', { name, exact: true }).click();
}

/** Returns the checkbox belonging to one fixture row.
 * @param index - Registered fixture editor position.
 */
function row(index: number) {
    const release = editors[index];
    return page.getByTestId(`installedReleaseRow_${release.version}_${release.mono ? 'mono' : 'standard'}`);
}

test('cancels and creates a selected manual alias without changing other commands', async () => {
    await row(0).getByRole('checkbox').check();
    const viewport = page.viewportSize();
    try {
        await page.setViewportSize({ width: 900, height: 600 });
        await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
        for (const theme of THEMES) {
            await applyTheme(page, theme);
            await page.getByTestId('btnInstalls').click();
            await page.getByRole('button', { name: 'Enable multi-select' }).click();
            await row(0).getByRole('checkbox').check();
            await action('Create missing aliases (1)');
            const dialog = page.getByRole('dialog', { name: 'Create named aliases?', exact: true });
            await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
            await expect(dialog.getByRole('button', { name: 'Create missing aliases (1)', exact: true })).toBeInViewport();
            expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
            await page.keyboard.press('Escape');
            await expect(dialog).toBeHidden();
        }
    } finally {
        await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
        if (viewport) await page.setViewportSize(viewport);
    }
    preferenceBefore = await fs.readFile(path.join(home, '.gd-launcher', 'prefs.json'), 'utf8');
    await action('Create missing aliases (1)');
    const modal = page.getByRole('dialog', { name: 'Create named aliases?', exact: true });
    await expect(modal.getByText('Named aliases to create: 1. Existing aliases will be kept.')).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(fs.access(path.join(bin, 'godot47'))).rejects.toThrow();
    await action('Create missing aliases (1)');
    await app.evaluate(({ ipcMain }) => {
        const handlers = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> };
        const original = handlers._invokeHandlers.get('editorInstalls.commitSelectedAliasChange');
        if (!original) throw new Error('Missing selected command handler');
        ipcMain.removeHandler('editorInstalls.commitSelectedAliasChange');
        ipcMain.handle('editorInstalls.commitSelectedAliasChange', async (...args) => {
            await new Promise((resolve) => setTimeout(resolve, 400));
            return original(...args);
        });
    });
    await modal.getByRole('button', { name: 'Create missing aliases (1)', exact: true }).click();
    await expect(modal.getByText('Applying...', { exact: true })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(modal).toBeVisible();
    await expect(modal).toBeHidden();
    await expect(row(0).getByRole('img', { name: 'Named alias: godot47', exact: true })).toBeVisible();
    await expect(fs.access(path.join(bin, 'godot451'))).rejects.toThrow();
    const state = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'command-line-aliases.json'), 'utf8'));
    expect(state.find((entry: { binding: { name: string } }) => entry.binding.name === 'godot47').binding.management).toBe('manual');
    await expect(fs.access(path.join(bin, 'godot'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(bin, 'studio'))).resolves.toBeUndefined();
});

test('removes only selected named aliases and keeps the default and preference', async () => {
    await row(0).getByRole('checkbox').check();
    await action('Remove named aliases (1)');
    const modal = page.getByRole('dialog', { name: 'Remove named aliases?', exact: true });
    await expect(modal.getByRole('button', { name: 'Remove named aliases (1)', exact: true })).toBeEnabled();
    await fs.chmod(bin, 0o500);
    try {
        await modal.getByRole('button', { name: 'Remove named aliases (1)', exact: true }).click();
        await expect(modal.getByText('Failed: 1. Skipped: 0.', { exact: true })).toBeVisible();
    } finally { await fs.chmod(bin, 0o700); }
    await modal.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(modal).toBeHidden();
    await expect(fs.access(path.join(bin, 'godot47'))).rejects.toThrow();
    await expect(fs.access(path.join(bin, 'studio'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(bin, 'godot'))).resolves.toBeUndefined();
    expect(await fs.readFile(path.join(home, '.gd-launcher', 'prefs.json'), 'utf8')).toBe(preferenceBefore);
});

test('preserves existing names and foreign files and reports only problems', async () => {
    await fs.writeFile(path.join(bin, 'godot451'), 'foreign');
    await action('Select all');
    await action('Create missing aliases (1)');
    const modal = page.getByRole('dialog', { name: 'Create named aliases?', exact: true });
    await expect(modal.getByText('Named aliases to create: 1. Existing aliases will be kept.')).toBeVisible();
    await modal.getByRole('button', { name: 'Create missing aliases (1)', exact: true }).click();
    await expect(modal.getByText('Failed: 0. Skipped: 1.', { exact: true })).toBeVisible();
    await expect(modal.getByText('View details')).toBeVisible();
    expect(await fs.readFile(path.join(bin, 'godot451'), 'utf8')).toBe('foreign');
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(fs.access(path.join(bin, 'studio'))).resolves.toBeUndefined();
    await row(1).getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Create missing aliases (0)', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await fs.unlink(path.join(bin, 'godot451'));
    await action('Create missing aliases (1)');
    await modal.getByRole('button', { name: 'Create missing aliases (1)', exact: true }).click();
    await expect(modal).toBeHidden();
});

test('bulk editor removal clears its default and aliases, keeps custom files and unselected commands', async () => {
    await row(0).getByRole('checkbox').check();
    await row(2).getByRole('checkbox').check();
    await action('Remove selected (2)');
    const modal = page.getByRole('dialog', { name: /Remove \d+ editors?\?/ });
    await expect(modal.getByText('2 named commands will be removed.', { exact: true })).toBeVisible();
    await expect(modal.getByText(/No replacement will be selected/)).toBeVisible();
    await expect(modal.getByText('studio', { exact: true })).toBeVisible();
    await expect(modal.locator('details, summary')).toHaveCount(0);
    await expect(modal.getByText('Registration removed. Original files kept.', { exact: true })).toBeVisible();
    await expect(modal.getByText(/Removing this editor will also remove its named command/)).toHaveCount(0);
    await expect(modal.getByText(/This editor is your default command-line Godot/)).toHaveCount(0);
    await expect(modal.getByRole('heading', { name: new RegExp(editors[2].name!) })).toBeVisible();
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(fs.access(path.join(bin, 'godot'))).resolves.toBeUndefined();
    await action('Remove selected (2)');
    await modal.getByRole('button', { name: 'Remove selected (2)', exact: true }).click();
    await expect(modal).toBeHidden();
    await expect(fs.access(path.join(bin, 'godot'))).rejects.toThrow();
    await expect(fs.access(path.join(bin, 'godot47'))).rejects.toThrow();
    await expect(fs.access(path.join(bin, 'studio'))).rejects.toThrow();
    await expect(fs.access(editors[0].install_path)).rejects.toThrow();
    await expect(fs.access(editors[2].editor_path)).resolves.toBeUndefined();
    await expect(fs.access(path.join(bin, 'godot451'))).resolves.toBeUndefined();
    expect(await fs.readFile(path.join(home, '.gd-launcher', 'prefs.json'), 'utf8')).toBe(preferenceBefore);
});
