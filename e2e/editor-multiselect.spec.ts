import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';
import type { EditorRemovalSelection, InstalledRelease } from '@shared/contracts';
import { getMainWindow } from './splashscreen/getMainWindow';
import {
    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
    SAMPLE_PROJECTS,
} from './support/e2e-fixture-data';
import {
    applyTheme,
    createFixtureHome,
    prepareAppWithStubbedData,
    setAppLanguage,
} from './support/e2e-fixture-runtime';
import { THEMES } from './support/e2e-fixture-theme';

let electronApp: ElectronApplication;
let page: Page;
let fixtureHome: string;
let launchEnvironment: Record<string, string>;
const previewDirectory = process.env.GODOT_LAUNCHER_PREVIEW_DIR;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    const env: Record<string, string> = {
        ...Object.fromEntries(Object.entries(process.env).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
        )),
        GODOT_LAUNCHER_E2E_FIXTURES: '1',
        GODOT_LAUNCHER_E2E_HOME_DIR: fixtureHome,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    launchEnvironment = env;
    electronApp = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`],
        env,
    });
    page = await getMainWindow(electronApp);
    await setAppLanguage(page, 'English');
});

test.afterAll(async () => {
    await electronApp?.close();
    if (fixtureHome) await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('selection follows the existing toolbar, preserves search and offers unused editors at zero', async () => {
    await prepareAppWithStubbedData(page, electronApp, {
        projects: SAMPLE_PROJECTS.filter((project) => !project.release.mono),
    });
    await applyTheme(page, THEMES[0]);
    await openInstalls();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await screenshot('editors-normal-dark.png');
    await page.getByRole('button', { name: 'Enable multi-select' }).click();
    const standard = page.getByRole('checkbox', { name: 'Select 4.7-stable (Standard)', exact: true });
    const dotnet = page.getByRole('checkbox', { name: 'Select 4.5.1-stable (.NET)', exact: true });
    const custom = page.getByRole('checkbox', { name: /Select Acme/ });
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
    await openActions();
    await expect(page.getByRole('button', { name: 'Remove selected (0)', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Select unused editors', exact: true }).click();
    // The fixture keeps the standard build in use and leaves .NET unused.
    await expect(dotnet).toBeChecked();
    await expect(standard).not.toBeChecked();
    await expect(custom).not.toBeChecked();

    await standard.check();
    await page.getByTestId('inputInstallSearch').fill('4.5');
    await expect(page.getByRole('checkbox')).toHaveCount(1);
    await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
    await page.getByTestId('inputInstallSearch').fill('');
    await expect(page.getByRole('button', { name: 'Start the Project Manager' })).toHaveCount(0);
    await openActions();
    await screenshot('editors-selection-menu-dark.png');
    await page.getByRole('button', { name: 'Remove selected (2)', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Remove selected editors', exact: true });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText(/Projects using this editor:/)).toBeVisible();
    await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await screenshot('editors-removal-confirm-dark.png');
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Disable multi-select' }).click();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Actions', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Enable multi-select' }).click();
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
});

test('select all includes custom registrations and matches the light theme', async () => {
    await prepareAppWithStubbedData(page, electronApp);
    await applyTheme(page, THEMES[1]);
    await openInstalls();
    await page.getByRole('button', { name: 'Enable multi-select' }).click();
    await openActions();
    await page.getByRole('button', { name: 'Select all', exact: true }).click();
    await expect(page.getByText('3 selected', { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Select Acme/ })).toBeChecked();
    await openActions();
    await screenshot('editors-selection-menu-light.png');
    await page.getByRole('button', { name: 'Remove selected (3)', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Remove selected editors', exact: true });
    await expect(confirm.getByText('Custom editors will be removed from Godot Launcher. Their files will be kept.', { exact: true })).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
    await openActions();
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox').first()).not.toBeChecked();
});

test('keeps partial failures visible and retries only failed removals through the preload bridge', async () => {
    await prepareAppWithStubbedData(page, electronApp, { projects: [] });
    await stubPartialRemoval();
    await openInstalls();
    await page.getByRole('button', { name: 'Enable multi-select' }).click();
    await page.getByRole('checkbox', { name: 'Select 4.7-stable (Standard)', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Select 4.5.1-stable (.NET)', exact: true }).check();
    await openActions();
    await page.getByRole('button', { name: 'Remove selected (2)', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Remove selected editors', exact: true });
    await confirm.getByRole('button', { name: 'Remove selected (2)', exact: true }).click();
    await expect(confirm.getByText('Removed', { exact: true })).toBeVisible();
    await expect(confirm.getByText('Failed', { exact: true })).toBeVisible();
    await expect(confirm.getByText('Access denied', { exact: true })).toBeVisible();
    await confirm.getByRole('button', { name: 'Retry failed removals', exact: true }).click();
    await expect(confirm).not.toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(1);
    await expect.poll(() => electronApp.evaluate(({ ipcMain }) =>
        (ipcMain as typeof ipcMain & { editorRemovalCalls: string[][] }).editorRemovalCalls,
    )).toEqual([['4.7-stable', '4.5.1-stable'], ['4.5.1-stable']]);
});

test('the actual batch handler deletes managed fixture files and preserves custom files', async () => {
    const configDir = path.join(fixtureHome, '.gd-launcher');
    const managed = { ...SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM[0], install_path: path.join(fixtureHome, 'managed-editor'), editor_path: path.join(fixtureHome, 'managed-editor', 'Godot') };
    const custom = { ...SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM.find((release) => release.source === 'custom')!, install_path: path.join(fixtureHome, 'custom-editor'), editor_path: path.join(fixtureHome, 'custom-editor', 'Godot') };
    for (const release of [managed, custom]) {
        await fs.mkdir(release.install_path, { recursive: true });
        await fs.writeFile(release.editor_path, 'fixture editor');
    }
    await fs.writeFile(path.join(configDir, 'installed-releases.json'), JSON.stringify([managed, custom]));
    await fs.writeFile(path.join(configDir, 'projects.json'), '[]');
    // Start a fresh store after writing fixture records; running stores cache reads.
    await electronApp.close();
    electronApp = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`],
        env: launchEnvironment,
    });
    page = await getMainWindow(electronApp);
    await expect(page.getByTestId('btnProjects')).toBeVisible();
    const result = await page.evaluate(async (editors) => {
        const bridge = window.__di_electron__;
        if (!bridge) throw new Error('Missing Electron preload bridge');
        return await bridge.invoke('editorInstalls.removeEditors', editors);
    }, [{ release: managed, onlyUnused: true }, { release: custom, onlyUnused: false }]);
    expect(result).toMatchObject({ success: true, data: { outcomes: [
        { status: 'removed' }, { status: 'removed' },
    ], releases: [] } });
    await expect(fs.access(managed.install_path)).rejects.toThrow();
    await expect(fs.readFile(custom.editor_path, 'utf8')).resolves.toBe('fixture editor');
});

/** Opens the selection menu through its visible toolbar action. */
async function openActions(): Promise<void> {
    await page.getByRole('button', { name: 'Actions', exact: true }).click();
}

/** Opens the editor list and waits for navigation to complete. */
async function openInstalls(): Promise<void> {
    await page.getByTestId('btnInstalls').click();
    await expect(page.getByTestId('installsTitle')).toBeVisible();
}

/**
 * Captures the actual Electron renderer when preview output is requested.
 *
 * @param filename - Screenshot name within the private preview directory.
 */
async function screenshot(filename: string): Promise<void> {
    if (!previewDirectory) return;
    await fs.mkdir(previewDirectory, { recursive: true });
    await page.screenshot({
        path: path.join(previewDirectory, filename),
        animations: 'disabled',
        caret: 'hide',
    });
}

/** Replaces only batch removal with a deterministic partial-failure fixture. */
async function stubPartialRemoval(): Promise<void> {
    await electronApp.evaluate(({ ipcMain }, installed: InstalledRelease[]) => {
        const handlers = ipcMain as typeof ipcMain & {
            _invokeHandlers: Map<string, (...args: unknown[]) => unknown>;
            realEditorRemovalHandler: (...args: unknown[]) => unknown;
            editorRemovalCalls: string[][];
        };
        const realHandler = handlers._invokeHandlers.get('editorInstalls.removeEditors');
        if (!realHandler) throw new Error('Missing registered batch removal handler');
        handlers.realEditorRemovalHandler = realHandler;
        handlers.editorRemovalCalls = [];
        let remaining = [...installed];
        ipcMain.removeHandler('editorInstalls.removeEditors');
        ipcMain.handle('editorInstalls.removeEditors', async (_, selections: EditorRemovalSelection[]) => {
            handlers.editorRemovalCalls.push(selections.map(({ release }) => release.version));
            const outcomes = selections.map(({ release }) => {
                const failed = handlers.editorRemovalCalls.length === 1 && release.mono;
                if (!failed) remaining = remaining.filter((candidate) => candidate.version !== release.version || candidate.mono !== release.mono);
                return { release, status: failed ? 'failed' : 'removed', ...(failed ? { error: 'Access denied' } : {}) };
            });
            return { success: true, data: { outcomes, releases: remaining } };
        });
    }, SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM);
}
