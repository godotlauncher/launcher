import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createGodotWrapper } from '../main/src/editor-installs/command-line-godot.util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Page, test } from './support/electron.fixture';
import { getMainWindow } from './splashscreen/getMainWindow';
import { THEMES } from './support/e2e-fixture-theme';
import { SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM } from './support/e2e-fixture-data';
import { applyTheme, createFixtureHome, setAppLanguage, writeJson } from './support/e2e-fixture-runtime';

let app: ElectronApplication;
let page: Page;
let home: string;

let appClosed = false;
let wrapper: string;
let firstRowId: string;
let secondRowId: string;
let firstRow: ReturnType<Page['getByTestId']>;
let secondRow: ReturnType<Page['getByTestId']>;
test.describe.configure({ mode: 'serial' });
test.skip(os.platform() === 'win32', 'POSIX fixture wrapper; Windows execution requires a native host.');

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

        releases.push({ ...SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM[index], ...(index === 1 ? { source: 'custom' as const, managed_by_launcher: false, name: 'Test Custom Editor' } : {}), editor_path: editorPath, install_path: os.platform() === 'darwin' ? editorPath : path.dirname(editorPath), console_path: undefined, valid: true });
    }
    await writeJson(path.join(home, '.gd-launcher', 'installed-releases.json'), releases);
    await writeJson(path.join(home, '.gd-launcher', 'projects.json'), []);
    const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), PATH: '/usr/bin:/bin', GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env });
    page = await getMainWindow(app);
    await setAppLanguage(page, 'English');
    await page.getByTestId('btnInstalls').click();
    firstRowId = `installedReleaseRow_${releases[0].version}_${releases[0].mono ? 'mono' : 'standard'}`;
    secondRowId = `installedReleaseRow_${releases[1].version}_${releases[1].mono ? 'mono' : 'standard'}`;
    firstRow = page.getByTestId(firstRowId);
    secondRow = page.getByTestId(secondRowId);
    wrapper = os.platform() === 'darwin' ? path.join(home, 'Library', 'Application Support', 'GodotLauncher', 'bin', 'godot') : path.join(home, '.local', 'share', 'godot-launcher', 'bin', 'godot');
});

test.afterAll(async () => {
    if (!appClosed) await app?.close();
    if (home) await fs.rm(home, { recursive: true, force: true });
});


const drawer = () => page.getByTestId('installSettingsDrawer');
const toggle = () => drawer().getByRole('checkbox', { name: 'Named alias', exact: true });
const field = () => drawer().getByRole('textbox', { name: 'Command name', exact: true });
const apply = () => drawer().getByRole('button', { name: 'Apply', exact: true });
const aliasFile = (name: string) => path.join(path.dirname(wrapper), name);

/** Closes transient setup feedback without altering the drawer. */
async function dismissAlert() {
    const ok = page.getByRole('button', { name: 'Ok', exact: true });
    await expect(ok).toBeVisible();
    await ok.click();
}

/**
 * Checks compact feedback and exposes the full reason through keyboard focus.
 * @param reason - Expected validation or collision explanation.
 */
async function expectUnavailable(reason: RegExp) {
    const status = drawer().getByRole('button', { name: 'Unavailable', exact: true });
    await expect(status).toBeVisible();
    await expect(status).toHaveText('Unavailable');
    await expect(field()).toHaveAccessibleDescription(reason);
    await expect(apply()).toBeDisabled();
    await field().focus();
    await page.keyboard.press('Tab');
    await expect(status).toBeFocused();
    await expect(page.getByRole('tooltip')).toContainText(reason);
    await field().focus();
    await expect(page.getByRole('tooltip')).toBeHidden();
}

test('keeps the compact alias row usable in both themes and with enlarged text', async () => {
    const originalViewport = page.viewportSize();
    const previousFont = await page.evaluate(() => document.documentElement.style.fontSize);
    try {
        for (const theme of THEMES) {
            await applyTheme(page, theme);
            await page.getByTestId('btnInstalls').click();
            await firstRow.getByRole('button', { name: 'Settings', exact: true }).click();
            await toggle().click();
            await expect(drawer().getByText('Available', { exact: true })).toBeVisible();
            const inputBounds = await field().boundingBox();
            const applyBounds = await apply().boundingBox();
            expect(inputBounds).not.toBeNull(); expect(applyBounds).not.toBeNull();
            expect(inputBounds!.width).toBeLessThan(260);
            expect(applyBounds!.x).toBeGreaterThan(inputBounds!.x + inputBounds!.width);
            if (process.env.GODOT_LAUNCHER_PREVIEW_DIR) {
                await fs.mkdir(process.env.GODOT_LAUNCHER_PREVIEW_DIR, { recursive: true });
                await page.screenshot({ path: path.join(process.env.GODOT_LAUNCHER_PREVIEW_DIR, `alias-compact-${theme.name}.png`) });
            }
            await page.setViewportSize({ width: 1024, height: 760 });
            await page.evaluate(() => { document.documentElement.style.fontSize = '125%'; });
            await expect(field()).toBeInViewport(); await expect(apply()).toBeInViewport();
            expect(await drawer().evaluate(panel => panel.scrollWidth <= panel.clientWidth)).toBe(true);
            await field().fill('Godot48');
            await expectUnavailable(/Use 1-48 lowercase/);
            await expect(apply()).toBeDisabled();
            expect(await drawer().evaluate(panel => panel.scrollWidth <= panel.clientWidth)).toBe(true);
            if (process.env.GODOT_LAUNCHER_PREVIEW_DIR) await page.screenshot({ path: path.join(process.env.GODOT_LAUNCHER_PREVIEW_DIR, `alias-compact-invalid-${theme.name}.png`) });
            await toggle().click();
            await drawer().getByRole('button', { name: 'Close', exact: true }).last().click();
            await page.evaluate(previous => { document.documentElement.style.fontSize = previous; }, previousFont);
            if (originalViewport) await page.setViewportSize(originalViewport);
        }
    } finally {
        await page.evaluate(previous => { document.documentElement.style.fontSize = previous; }, previousFont);
        if (originalViewport) await page.setViewportSize(originalViewport);
    }
});

test('stages the version suggestion, validates names and cancels setup without writing', async () => {
    await firstRow.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(toggle()).not.toBeChecked();
    await drawer().getByText('Named alias', { exact: true }).click();
    await expect(toggle()).not.toBeChecked();
    await toggle().click();
    await expect(field()).toHaveValue(/^godot\d+$/);
    await expect(drawer().getByText('Available', { exact: true })).toBeVisible();
    const suggestion = await field().inputValue();
    await expect(fs.access(aliasFile(suggestion))).rejects.toThrow();
    await field().fill('godot');
    await expectUnavailable(/This command name is reserved/);
    await expect(apply()).toBeDisabled();
    await field().fill('Godot48');
    await expectUnavailable(/Use 1-48 lowercase/);
    await app.evaluate(({ ipcMain }) => {
        const channel = 'editorInstalls.checkCommandLineAlias';
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> };
        const handler = ipc._invokeHandlers.get(channel)!;
        const gate = globalThis as typeof globalThis & { slowAliasStarted: boolean; slowAliasDone: boolean; releaseCheck: () => void };
        const pending = new Promise<void>(resolve => { gate.releaseCheck = () => { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); resolve(); }; });
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, async (...args) => {
            if (args.at(-1) === 'slow-alias') { gate.slowAliasStarted = true; await pending; const result = await handler(...args); gate.slowAliasDone = true; return result; }
            return handler(...args);
        });
    });
    await field().fill('slow-alias');
    await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { slowAliasStarted: boolean }).slowAliasStarted)).toBe(true);
    await field().fill('godot');
    await expectUnavailable(/This command name is reserved/);
    await app.evaluate(() => (globalThis as typeof globalThis & { releaseCheck: () => void }).releaseCheck());
    await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { slowAliasDone: boolean }).slowAliasDone)).toBe(true);
    await expectUnavailable(/This command name is reserved/);
    await expect(apply()).toBeDisabled();
    await field().fill('godot-studio');
    await expect(drawer().getByText('Available', { exact: true })).toBeVisible();
    await apply().click();
    const dialog = page.getByRole('dialog', { name: 'Add named command?', exact: true });
    await expect(dialog.locator('code')).toHaveText('godot-studio');
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(fs.access(aliasFile('godot-studio'))).rejects.toThrow();
    await expect(apply()).toBeFocused();
});

test('returns a failed initial Apply to the editable drawer with its error visible', async () => {
    await apply().click();
    const confirmation = page.getByRole('dialog', { name: 'Add named command?', exact: true });
    await app.evaluate(({ ipcMain }) => {
        const channel = 'editorInstalls.setCommandLineAlias';
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> };
        const handler = ipc._invokeHandlers.get(channel)!;
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, () => { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); throw new Error('Simulated alias apply failure'); });
    });
    await confirmation.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(confirmation).toBeHidden();
    await expect(drawer().getByRole('alert')).toContainText('Simulated alias apply failure');
    await expect(field()).toHaveValue('godot-studio');
    await expect(field()).toBeFocused();
    await expect(fs.access(aliasFile('godot-studio'))).rejects.toThrow();
});

test('protects dirty close and discards only the unapplied alias draft', async () => {
    await drawer().getByRole('button', { name: 'Close', exact: true }).last().click();
    const dialog = page.getByRole('dialog', { name: 'Discard alias changes?', exact: true });
    await expect(dialog.getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(field()).toHaveValue('godot-studio');
    await drawer().getByRole('button', { name: 'Close', exact: true }).last().click();
    await dialog.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(drawer()).toBeHidden();
    await firstRow.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(toggle()).not.toBeChecked();
    await toggle().click();
    await field().fill('godot-studio');
});

test('blocks unmanaged destinations, then applies a named wrapper without setting the default', async () => {
    await fs.mkdir(path.dirname(wrapper), { recursive: true });
    await fs.writeFile(aliasFile('foreign-alias'), 'foreign');
    await field().fill('foreign-alias');
    await expectUnavailable(/already used by another command or file/);
    await expect(apply()).toBeDisabled();
    await field().fill('godot-studio');
    await expect(drawer().getByText('Available', { exact: true })).toBeVisible();
    await apply().click();
    await page.getByRole('dialog', { name: 'Add named command?', exact: true }).getByRole('button', { name: 'Apply', exact: true }).click();
    await dismissAlert();
    await expect(drawer().locator('code').filter({ hasText: 'godot-studio' })).toBeVisible();
    await expect(field()).toHaveCount(0);
    await expect(firstRow.getByRole('img', { name: 'Named alias: godot-studio', exact: true })).toBeVisible();
    await expect(secondRow.getByRole('img', { name: 'Named alias: godot-studio', exact: true })).toHaveCount(0);
    await expect(drawer().getByRole('checkbox', { name: 'Default terminal editor', exact: true })).not.toBeChecked();
    await expect(fs.access(wrapper)).rejects.toThrow();
    const execution = await new Promise<{ code: number; stdout: string; stderr: string }>(resolve => {
        execFile(aliasFile('godot-studio'), ['--path', 'a project', "quote's $value"], { cwd: home }, (error, stdout, stderr) => resolve({ code: Number((error as NodeJS.ErrnoException & { code?: number })?.code ?? 0), stdout, stderr }));
    });
    expect(execution.code).toBe(23); expect(execution.stdout).toContain(home); expect(execution.stdout).toContain("quote's $value"); expect(execution.stderr).toContain('editor stderr');
    await page.screenshot({ path: path.join(os.tmpdir(), 'story2-alias-drawer.png') });
});

test('preserves a saved alias across restart and blocks the same name on another installation', async () => {
    await app.close(); appClosed = true;
    const registryPath = path.join(home, '.gd-launcher', 'command-line-aliases.json');
    const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
    registry[0].operation = { kind: 'create' };
    await fs.unlink(aliasFile('godot-studio'));
    await writeJson(registryPath, registry);
    const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), PATH: '/usr/bin:/bin', GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env }); appClosed = false;
    page = await getMainWindow(app); await page.getByTestId('btnInstalls').click();
    firstRow = page.getByTestId(firstRowId); secondRow = page.getByTestId(secondRowId);
    await expect(firstRow.getByRole('img', { name: 'Named alias: godot-studio', exact: true })).toBeVisible();
    if (process.env.GODOT_LAUNCHER_PREVIEW_DIR) await page.screenshot({ path: path.join(process.env.GODOT_LAUNCHER_PREVIEW_DIR, 'install-alias-badge.png'), animations: 'disabled' });
    await firstRow.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(toggle()).toBeChecked();
    await expect(drawer().getByText('godot-studio', { exact: true })).toBeVisible();
    await drawer().getByRole('button', { name: 'Close', exact: true }).last().click();
    await secondRow.getByRole('button', { name: 'Settings', exact: true }).click();
    await toggle().click(); await field().fill('godot-studio');
    await expectUnavailable(/Already used by/); await expect(apply()).toBeDisabled();
    await drawer().getByRole('button', { name: 'Unavailable', exact: true }).hover();
    await expect(page.getByRole('tooltip')).toContainText('Already used by');
    if (process.env.GODOT_LAUNCHER_PREVIEW_DIR) await page.screenshot({ path: path.join(process.env.GODOT_LAUNCHER_PREVIEW_DIR, 'alias-unavailable-tooltip.png'), animations: 'disabled' });
    await field().hover();

    await toggle().click();
    await drawer().getByRole('button', { name: 'Close', exact: true }).last().click();
});

test('edits a saved alias without writing on unchanged, cancelled or discarded drafts', async () => {
    await firstRow.getByRole('button', { name: 'Settings', exact: true }).click();
    const edit = drawer().getByRole('button', { name: 'Rename alias', exact: true });
    await edit.click();
    await expect(field()).toHaveValue('godot-studio');
    await expect(drawer().getByText('Available', { exact: true })).toBeVisible();
    await expect(apply()).toBeDisabled();
    await field().fill('godot'); await expectUnavailable(/reserved/);
    await field().fill('godot-work');
    await expect(drawer().getByText('Available', { exact: true })).toBeVisible();
    await field().blur();
    await expect(fs.access(aliasFile('godot-work'))).rejects.toThrow();
    await expect(fs.access(aliasFile('godot-studio'))).resolves.toBeUndefined();
    await drawer().getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(field()).toHaveCount(0); await expect(edit).toBeFocused();
    await edit.click(); await field().fill('godot-work'); await page.keyboard.press('Escape');
    await expect(field()).toHaveCount(0); await expect(edit).toBeFocused();
    await edit.click(); await field().fill('godot-work');
    await drawer().getByRole('button', { name: 'Close', exact: true }).last().click();
    const discard = page.getByRole('dialog', { name: 'Discard alias changes?', exact: true });
    await expect(discard.getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(field()).toHaveValue('godot-work');
    await drawer().getByRole('button', { name: 'Close', exact: true }).last().click();
    await discard.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await firstRow.getByRole('button', { name: 'Settings', exact: true }).click();
    await edit.click(); await expect(field()).toHaveValue('godot-studio');
    await field().fill('godot-work');
    await expect(drawer().getByText('Available', { exact: true })).toBeVisible();
    if (process.env.GODOT_LAUNCHER_PREVIEW_DIR) await page.screenshot({ path: path.join(process.env.GODOT_LAUNCHER_PREVIEW_DIR, 'alias-rename-draft.png'), animations: 'disabled' });
});

test('retains a failed pending rename draft through close and reopen, then applies it safely', async () => {
    await expect(drawer().getByText('Available', { exact: true })).toBeVisible();
    await app.evaluate(({ ipcMain }) => {
        const channel = 'editorInstalls.setCommandLineAlias';
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> };
        const handler = ipc._invokeHandlers.get(channel)!;
        const gate = globalThis as typeof globalThis & { releaseRename: () => void; renameCalls: number };
        gate.renameCalls = 0;
        const pending = new Promise<void>(resolve => { gate.releaseRename = () => { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); resolve(); }; });
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, async () => { gate.renameCalls++; await pending; throw new Error('Simulated rename failure'); });
    });
    await apply().click(); await expect(field()).toBeDisabled();
    await drawer().getByRole('button', { name: 'Close', exact: true }).last().click();
    await firstRow.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(field()).toHaveValue('godot-work'); await expect(field()).toBeDisabled();
    await expect(fs.access(aliasFile('godot-studio'))).resolves.toBeUndefined();
    await expect(fs.access(aliasFile('godot-work'))).rejects.toThrow();
    expect(await app.evaluate(() => (globalThis as typeof globalThis & { renameCalls: number }).renameCalls)).toBe(1);
    await app.evaluate(() => (globalThis as typeof globalThis & { releaseRename: () => void }).releaseRename());
    await expect(drawer().getByRole('alert')).toContainText('Simulated rename failure');
    await expect(field()).toHaveValue('godot-work'); await expect(field()).toBeFocused();
    await expect(drawer().getByText('Saved command:', { exact: false })).toContainText('godot-studio');
    await expect(firstRow.getByRole('img', { name: 'Named alias: godot-studio', exact: true })).toBeVisible();
    await expect(drawer().getByText('Available', { exact: true })).toBeVisible();
    await apply().click();
    await expect(field()).toHaveCount(0);
    await expect(drawer().getByRole('button', { name: 'Rename alias', exact: true })).toBeFocused();
    await expect(firstRow.getByRole('img', { name: 'Named alias: godot-work', exact: true })).toBeVisible();
    await expect(firstRow.getByRole('img', { name: 'Named alias: godot-studio', exact: true })).toHaveCount(0);
    await expect(fs.access(aliasFile('godot-studio'))).rejects.toThrow();
    await expect(fs.access(wrapper)).rejects.toThrow();
    const execution = await new Promise<{ code: number; stdout: string; stderr: string }>(resolve => {
        execFile(aliasFile('godot-work'), ['--path', 'renamed project'], { cwd: home }, (error, stdout, stderr) => resolve({ code: typeof error?.code === 'number' ? error.code : error ? -1 : 0, stdout, stderr }));
    });
    expect(execution.code).toBe(23); expect(execution.stdout).toContain(home); expect(execution.stdout).toContain('renamed project'); expect(execution.stderr).toContain('editor stderr');
    await drawer().getByRole('button', { name: 'Close', exact: true }).last().click();
});

/** Restarts the fixture app after deliberately persisted interruption states. */
async function launchAfterInterruption() {
    const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), PATH: '/usr/bin:/bin', GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env }); appClosed = false;
    page = await getMainWindow(app); await page.getByTestId('btnInstalls').click();
    firstRow = page.getByTestId(firstRowId); secondRow = page.getByTestId(secondRowId);
}

test('rolls back prepared renames and completes committed renames through real startup recovery', async () => {
    for (const phase of ['prepare', 'commit'] as const) {
        await app.close(); appClosed = true;
        const registryPath = path.join(home, '.gd-launcher', 'command-line-aliases.json');
        const entries = JSON.parse(await fs.readFile(registryPath, 'utf8'));
        const previous = entries[0].binding;
        const name = phase === 'prepare' ? 'godot-abandoned' : 'godot-studio';
        const id = randomUUID();
        const content = createGodotWrapper(previous.executable, os.platform(), name);
        const witness = path.join(path.dirname(wrapper), `.godot-launcher-alias-${id}`);
        await fs.writeFile(witness, content, { flag: 'wx', mode: 0o755 });
        const info = await fs.stat(witness, { bigint: true });
        const binding = { ...previous, id, name, content, dev: String(info.dev), ino: String(info.ino) };
        await fs.link(witness, aliasFile(name));
        entries[0] = { binding, operation: { kind: 'rename', phase, previous } };
        await writeJson(registryPath, entries);
        await launchAfterInterruption();
        const expected = phase === 'prepare' ? 'godot-work' : 'godot-studio';
        await expect(firstRow.getByRole('img', { name: `Named alias: ${expected}`, exact: true })).toBeVisible();
        const recovered = JSON.parse(await fs.readFile(registryPath, 'utf8'));
        expect(recovered[0].binding.name).toBe(expected); expect(recovered[0].operation).toBeUndefined();
        await expect(fs.access(aliasFile(phase === 'prepare' ? 'godot-abandoned' : 'godot-work'))).rejects.toThrow();
        await expect(fs.access(aliasFile(expected))).resolves.toBeUndefined();
        expect(await fs.readFile(aliasFile('foreign-alias'), 'utf8')).toBe('foreign');
    }
});

test('confirms switch-off removal, preserves cancellation and failure, and removes only the named command', async () => {
    await firstRow.getByRole('button', { name: 'Settings', exact: true }).click();
    await toggle().click();
    const confirmation = page.getByRole('dialog', { name: 'Remove named alias?', exact: true });
    const cancel = confirmation.getByRole('button', { name: 'Cancel', exact: true });
    const remove = confirmation.getByRole('button', { name: 'Remove alias', exact: true });
    await expect(cancel).toBeFocused();
    await expect(confirmation.locator('code')).toHaveText(['godot-studio', 'godot']);
    await expect(toggle()).toBeChecked();
    await expect(apply()).toHaveCount(0);
    await expect(fs.access(aliasFile('godot-studio'))).resolves.toBeUndefined();
    if (process.env.GODOT_LAUNCHER_PREVIEW_DIR) await page.screenshot({ path: path.join(process.env.GODOT_LAUNCHER_PREVIEW_DIR, 'alias-remove-confirm.png'), animations: 'disabled' });
    await cancel.click();
    await expect(toggle()).toBeChecked();
    await expect(toggle()).toBeFocused();
    await toggle().click();
    await page.keyboard.press('Escape');
    await expect(confirmation).toBeHidden();
    await expect(toggle()).toBeChecked();
    await expect(fs.access(aliasFile('godot-studio'))).resolves.toBeUndefined();

    await app.evaluate(({ ipcMain }) => {
        const channel = 'editorInstalls.setCommandLineAlias';
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> };
        const handler = ipc._invokeHandlers.get(channel)!;
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, () => { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); throw new Error('Simulated alias removal failure'); });
    });
    await toggle().click();
    await remove.click();
    await expect(confirmation).toBeHidden();
    await expect(drawer().getByRole('alert')).toContainText('Simulated alias removal failure');
    await expect(toggle()).toBeChecked();
    await expect(toggle()).toBeFocused();
    await expect(fs.access(aliasFile('godot-studio'))).resolves.toBeUndefined();
    await expect(apply()).toHaveCount(0);

    await app.evaluate(({ ipcMain }) => {
        const channel = 'editorInstalls.setCommandLineAlias';
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> };
        const handler = ipc._invokeHandlers.get(channel)!;
        const gate = globalThis as typeof globalThis & { releaseAlias: () => void; aliasCalls: number };
        gate.aliasCalls = 0;
        const pending = new Promise<void>(resolve => { gate.releaseAlias = () => { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); resolve(); }; });
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, async (...args) => { gate.aliasCalls++; await pending; return handler(...args); });
    });
    await toggle().click();
    await remove.click();
    await expect(cancel).toBeDisabled();
    await expect(remove).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(confirmation).toBeVisible();
    await expect(toggle()).toBeChecked();
    await expect(fs.access(aliasFile('godot-studio'))).resolves.toBeUndefined();
    expect(await app.evaluate(() => (globalThis as typeof globalThis & { aliasCalls: number }).aliasCalls)).toBe(1);
    await app.evaluate(() => (globalThis as typeof globalThis & { releaseAlias: () => void }).releaseAlias());
    await expect(confirmation).toBeHidden();
    await expect(toggle()).toBeEnabled();
    await expect(toggle()).not.toBeChecked();
    await expect(toggle()).toBeFocused();
    await expect(apply()).toHaveCount(0);
    await expect(firstRow.getByRole('img', { name: 'Named alias: godot-studio', exact: true })).toHaveCount(0);
    await expect.poll(async () => { try { await fs.access(aliasFile('godot-studio')); return true; } catch { return false; } }).toBe(false);
    expect(await fs.readFile(aliasFile('foreign-alias'), 'utf8')).toBe('foreign');
    expect(await fs.readFile(path.join(home, '.bashrc'), 'utf8')).toContain('# >>> Godot Launcher PATH >>>');
    await expect(drawer().getByRole('checkbox', { name: 'Default terminal editor', exact: true })).not.toBeChecked();
});

test('names both commands in removal confirmations and refuses foreign alias cleanup before deleting files', async () => {
    await drawer().getByRole('checkbox', { name: 'Default terminal editor', exact: true }).click();
    await page.getByRole('dialog', { name: 'Set as terminal default?', exact: true }).getByRole('button', { name: 'Set as default', exact: true }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await toggle().click();
    await field().fill('godot-lifecycle');
    await expect(apply()).toBeEnabled();
    await apply().click();
    await expect(firstRow.getByRole('img', { name: 'Named alias: godot-lifecycle', exact: true })).toBeVisible();
    await drawer().getByRole('button', { name: 'Close', exact: true }).last().click();
    await firstRow.getByRole('button', { name: /Remove|Delete/ }).click();
    const single = page.getByRole('dialog', { name: 'Remove Release', exact: true });
    await expect(single).toContainText('This editor is your default command-line Godot.');
    await expect(single).toContainText('Removing this editor will also remove its named command godot-lifecycle.');
    await expect(single.locator('code')).toHaveText('godot-lifecycle');
    await single.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Enable multi-select' }).click();
    await firstRow.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
    await page.getByRole('button', { name: 'Remove selected (1)', exact: true }).click();
    const bulk = page.getByRole('dialog', { name: 'Remove selected editors', exact: true });
    await expect(bulk).toContainText('godot-lifecycle');
    await expect(bulk).toContainText('This editor is your default command-line Godot.');
    await bulk.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Disable multi-select' }).click();

    const registry = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'installed-releases.json'), 'utf8'));
    const original = await fs.readFile(aliasFile('godot-lifecycle'), 'utf8');
    const backup = aliasFile('owned-backup');
    await fs.rename(aliasFile('godot-lifecycle'), backup);
    await fs.writeFile(aliasFile('godot-lifecycle'), 'foreign replacement');
    await firstRow.getByRole('button', { name: /Remove|Delete/ }).click();
    await single.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(single.getByRole('alert')).toContainText('needs recovery');
    expect(await fs.readFile(aliasFile('godot-lifecycle'), 'utf8')).toBe('foreign replacement');
    expect(JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'installed-releases.json'), 'utf8'))).toEqual(registry);
    await expect(fs.access(wrapper)).resolves.toBeUndefined();
    await single.getByRole('button', { name: 'Cancel', exact: true }).click();
    await fs.unlink(aliasFile('godot-lifecycle'));
    await fs.rename(backup, aliasFile('godot-lifecycle'));
    expect(await fs.readFile(aliasFile('godot-lifecycle'), 'utf8')).toBe(original);
});

test('keeps both commands cleared after partial deletion and permits a safe removal retry', async () => {
    const registry = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'installed-releases.json'), 'utf8'));
    const target = registry.find((release: { source: string }) => release.source !== 'custom');
    const executable = os.platform() === 'darwin' ? path.join(target.editor_path, 'Contents', 'MacOS', 'Godot') : target.editor_path;
    const script = await fs.readFile(executable, 'utf8');
    await firstRow.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(toggle()).toBeChecked();
    await drawer().getByRole('button', { name: 'Close', exact: true }).last().click();
    await app.evaluate((_, fault) => {
        const target = globalThis as typeof globalThis & { __name: (fn: unknown) => unknown; restoreRemovalFault: () => void };
        target.__name = fn => fn;
        const fixtureFs = process.getBuiltinModule('node:fs') as typeof import('node:fs');
        const original = fixtureFs.promises.rm;
        fixtureFs.promises.rm = async (...args: Parameters<typeof original>) => {
            if (String(args[0]) === fault.install) {
                await original(fault.executable, { force: true });
                throw new Error('Simulated partial editor deletion');
            }
            return original(...args);
        };
        target.restoreRemovalFault = () => { fixtureFs.promises.rm = original; };
    }, { install: target.install_path, executable });
    const dialog = page.getByRole('dialog', { name: 'Remove Release', exact: true });
    try {
        await firstRow.getByRole('button', { name: /Remove|Delete/ }).click();
        await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
        await expect(dialog.getByRole('alert')).toBeVisible();
        await expect(fs.access(wrapper)).rejects.toThrow();
        await expect(fs.access(aliasFile('godot-lifecycle'))).rejects.toThrow();
        expect(JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'command-line-godot.json'), 'utf8'))).toBeNull();
        expect(JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'installed-releases.json'), 'utf8'))).toHaveLength(2);
    } finally {
        await app.evaluate(() => (globalThis as typeof globalThis & { restoreRemovalFault: () => void }).restoreRemovalFault());
    }
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await firstRow.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(toggle()).not.toBeChecked();
    await expect(drawer().getByRole('checkbox', { name: 'Default terminal editor', exact: true })).not.toBeChecked();
    await fs.writeFile(executable, script, { mode: 0o755 });
    await drawer().getByRole('button', { name: 'Close', exact: true }).last().click();
    await firstRow.getByRole('button', { name: /Remove|Delete/ }).click();
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(firstRow).toHaveCount(0);
    await expect(secondRow).toBeVisible();
    expect(await fs.readFile(aliasFile('foreign-alias'), 'utf8')).toBe('foreign');
    expect(await fs.readFile(path.join(home, '.bashrc'), 'utf8')).toContain('# >>> Godot Launcher PATH >>>');
});

test('preserves both command bindings across custom replacement, rejects stale removal and unregisters without deleting custom files', async () => {
    await secondRow.getByRole('button', { name: 'Settings', exact: true }).click();
    await drawer().getByRole('checkbox', { name: 'Default terminal editor', exact: true }).click();
    await page.getByRole('dialog', { name: 'Set as terminal default?', exact: true }).getByRole('button', { name: 'Set as default', exact: true }).click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await toggle().click();
    await field().fill('godot-custom-life');
    await expect(apply()).toBeEnabled();
    await apply().click();
    await expect(secondRow.getByRole('img', { name: 'Named alias: godot-custom-life', exact: true })).toBeVisible();
    await drawer().getByRole('button', { name: 'Close', exact: true }).last().click();
    const registryPath = path.join(home, '.gd-launcher', 'installed-releases.json');
    const original = JSON.parse(await fs.readFile(registryPath, 'utf8'))[0];
    const replacementPath = path.join(home, os.platform() === 'darwin' ? 'custom-replacement.app' : 'custom-replacement');
    const executable = os.platform() === 'darwin' ? path.join(replacementPath, 'Contents', 'MacOS', 'Godot') : replacementPath;
    await fs.mkdir(path.dirname(executable), { recursive: true });
    await fs.writeFile(executable, '#!/bin/sh\nprintf "replacement\\n"\n', { mode: 0o755 });
    const manifest = path.join(home, 'replacement-manifest.json');
    await writeJson(manifest, { schema_version: 1, version: original.version, name: 'Replaced Custom Editor', base_version: '4.5', flavor: original.mono ? 'dotnet' : 'standard', config_version: 5, platforms: [{ platform: os.platform() === 'darwin' ? 'macos' : 'linux', arch: os.arch(), paths: { editor: replacementPath } }] });
    const outcomes = await app.evaluate(async ({ ipcMain, BrowserWindow }, data) => {
        const ipc = ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> };
        const sender = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('http://localhost:5123'))!.webContents;
        const event = { sender, senderFrame: sender.mainFrame };
        const replacement = await ipc._invokeHandlers.get('editorInstalls.registerCustomEditor')!(event, data.manifest, { replaceExisting: true });
        const staleRemoval = await ipc._invokeHandlers.get('editorInstalls.removeEditor')!(event, data.original);
        return { replacement, staleRemoval };
    }, { manifest, original });
    expect(outcomes.replacement).toMatchObject({ success: true, data: { success: true } });
    expect(outcomes.staleRemoval).toMatchObject({ success: true, data: { success: false } });
    expect(await fs.readFile(wrapper, 'utf8')).toContain(replacementPath);
    expect(await fs.readFile(aliasFile('godot-custom-life'), 'utf8')).toContain(replacementPath);
    await page.reload();
    await page.getByTestId('btnInstalls').click();
    await secondRow.getByRole('button', { name: /Remove|Delete/ }).click();
    const confirmation = page.getByRole('dialog', { name: 'Remove Custom Editor', exact: true });
    await expect(confirmation).toContainText('godot-custom-life');
    await expect(confirmation).toContainText('This editor is your default command-line Godot.');
    await confirmation.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(confirmation).toBeHidden();
    await expect(secondRow).toHaveCount(0);
    await expect(fs.access(wrapper)).rejects.toThrow();
    await expect(fs.access(aliasFile('godot-custom-life'))).rejects.toThrow();
    await expect(fs.access(executable)).resolves.toBeUndefined();
    await expect(fs.access(original.editor_path)).resolves.toBeUndefined();
    expect(JSON.parse(await fs.readFile(registryPath, 'utf8'))).toEqual([]);
    expect(await fs.readFile(aliasFile('foreign-alias'), 'utf8')).toBe('foreign');
});
