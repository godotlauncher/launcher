import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Page, test } from './support/electron.fixture';
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
    await expect(page.getByRole('checkbox')).toHaveCount(2);
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
    await page.getByTestId('inputInstallSearch').fill('');
    await standard.check();
    await dotnet.check();
    await expect(page.getByRole('button', { name: 'Start the Project Manager' })).toHaveCount(0);
    await openActions();
    await screenshot('editors-selection-menu-dark.png');
    await page.getByRole('button', { name: 'Remove selected (2)', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: /Remove \d+ editors?\?/ });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText('1 project will need another editor. Its project files will be kept.', { exact: true })).toBeVisible();
    await expect(confirm.getByRole('heading', { name: 'Affected items', exact: true })).toBeVisible();
    await expect(confirm.locator('details, summary')).toHaveCount(0);
    await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await expect(confirm.getByText(/Projects: My Awesome Game/)).toBeVisible();
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
    const confirm = page.getByRole('dialog', { name: /Remove \d+ editors?\?/ });
    await expect(confirm.getByText('1 custom editor will be unregistered. Its original files will be kept.', { exact: true })).toBeVisible();
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
    await openActions();
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox').first()).not.toBeChecked();
});

test('selects all filtered results including off-screen rows and supports mixed version groups', async () => {
    const installed = Array.from({ length: 18 }, (_, index) => ({ ...SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM[0], version: `4.7.${index + 1}-stable`, version_number: index + 1 }));
    installed.push({ ...installed[0], version: '4.8-stable' });
    await prepareAppWithStubbedData(page, electronApp, { installedReleases: installed, projects: [] });
    await openInstalls();
    await page.getByRole('button', { name: 'Enable multi-select' }).click();
    await page.getByTestId('inputInstallSearch').fill('4.7');
    const group = page.getByRole('checkbox', { name: 'Select group 4.7', exact: true });
    await page.getByRole('checkbox', { name: 'Select 4.7.1-stable (Standard)', exact: true }).check();
    await expect(group).toHaveJSProperty('indeterminate', true);
    await group.check();
    await expect(page.getByText('18 selected', { exact: true })).toBeVisible();
    await group.uncheck();
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
    await openActions();
    await page.getByRole('button', { name: 'Select all', exact: true }).click();
    await expect(page.getByText('18 selected', { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Select 4.7.1-stable (Standard)', exact: true })).toBeChecked();
    await page.getByTestId('inputInstallSearch').fill('4.8');
    await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Select 4.8-stable (Standard)', exact: true })).not.toBeChecked();
    await openActions();
    await page.getByRole('button', { name: 'Select unused editors', exact: true }).click();
    await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
});

test('summarises named commands once and uses one scroll area for a long editor list', async () => {
    const installed = Array.from({ length: 18 }, (_, index) => ({ ...SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM[0], version: `4.7.${index + 1}-stable`, version_number: index + 1 }));
    await prepareAppWithStubbedData(page, electronApp, { installedReleases: installed, projects: [SAMPLE_PROJECTS[0]] });
    await electronApp.evaluate(({ ipcMain }, editors) => {
        ipcMain.removeHandler('editorInstalls.getCommandLineAliases');
        ipcMain.handle('editorInstalls.getCommandLineAliases', async () => ({ success: true, data: { aliases: editors.map((editor, index) => ({ version: editor.version, mono: editor.mono, name: `godot47-${index + 1}`, management: 'manual', state: 'active' })) } }));
        ipcMain.removeHandler('editorInstalls.getCommandLineGodot');
        ipcMain.handle('editorInstalls.getCommandLineGodot', async () => ({ success: true, data: { selection: { version: editors[0].version, mono: editors[0].mono, editorPath: editors[0].editor_path }, binDirectory: '/fixture/bin' } }));
    }, installed);
    const viewport = page.viewportSize();
    try {
        await page.setViewportSize({ width: 1024, height: 600 });
        await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
        for (const theme of THEMES) {
            await applyTheme(page, theme);
            await openInstalls();
            await page.getByRole('button', { name: 'Enable multi-select' }).click();
            await openActions();
            await page.getByRole('button', { name: 'Select all', exact: true }).click();
            await openActions();
            await page.getByRole('button', { name: 'Remove selected (18)', exact: true }).click();
            const confirm = page.getByRole('dialog', { name: /Remove \d+ editors?\?/ });
            const commands = confirm.getByText('18 named commands will be removed.', { exact: true });
            await expect(commands).toHaveCount(1);
            expect(await commands.evaluate((element) => element.previousElementSibling?.textContent)).toBe('1 project will need another editor. Its project files will be kept.');
            await expect(confirm.getByRole('heading', { name: 'Affected items', exact: true })).toBeVisible();
            await expect(confirm.locator('details, summary')).toHaveCount(0);
            const before = await confirm.boundingBox();
            const footerBefore = await confirm.getByRole('button', { name: 'Cancel', exact: true }).boundingBox();
            const reviewRegion = confirm.getByRole('list', { name: 'Affected items', exact: true });
            expect(await reviewRegion.evaluate((element) => ({ gutter: element.clientWidth < (element as HTMLElement).offsetWidth, overflow: getComputedStyle(element).overflowY, thumb: getComputedStyle(element, '::-webkit-scrollbar-thumb').backgroundColor }))).toMatchObject({ gutter: true, overflow: 'scroll' });
            const summaryBefore = await commands.boundingBox();
            const headingBefore = await confirm.getByRole('heading', { name: 'Affected items', exact: true }).boundingBox();
            await reviewRegion.focus();
            await expect(reviewRegion).toBeFocused();
            await page.keyboard.press('End');
            await expect.poll(() => reviewRegion.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
            await expect(confirm.getByText(/Removing this editor will also remove its named command/)).toHaveCount(0);
            await expect(confirm.getByText(/This editor is your default command-line Godot/)).toHaveCount(0);
            await expect(confirm.getByText(/No replacement will be selected/)).toHaveCount(1);
            const list = confirm.getByRole('list');
            expect(await list.evaluate((element) => {
                let scrollAreas = 0;
                for (let current: HTMLElement | null = element as HTMLElement; current && current.tagName !== 'DIALOG'; current = current.parentElement) {
                    if (current.scrollHeight > current.clientHeight && ['auto', 'scroll'].includes(getComputedStyle(current).overflowY)) scrollAreas++;
                }
                return scrollAreas;
            })).toBe(1);
            await confirm.getByRole('heading', { name: '4.7.18-stable - Standard', exact: true }).scrollIntoViewIfNeeded();
            await expect(confirm.getByRole('heading', { name: '4.7.18-stable - Standard', exact: true })).toBeInViewport();
            expect(await confirm.boundingBox()).toEqual(before);
            expect(await commands.boundingBox()).toEqual(summaryBefore);
            expect(await confirm.getByRole('heading', { name: 'Affected items', exact: true }).boundingBox()).toEqual(headingBefore);
            expect(await confirm.getByRole('button', { name: 'Cancel', exact: true }).boundingBox()).toEqual(footerBefore);
            await expect(confirm.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
            await expect(confirm.getByRole('button', { name: 'Remove selected (18)', exact: true })).toBeInViewport();
            await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
        }
    } finally {
        await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
        if (viewport) await page.setViewportSize(viewport);
    }
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
    const confirm = page.getByRole('dialog', { name: /Remove \d+ editors?\?/ });
    await confirm.getByRole('button', { name: 'Remove selected (2)', exact: true }).click();
    await expect(confirm.getByText('Removed: 1. Failed: 1. Skipped: 0.', { exact: true })).toBeVisible();
    await expect(confirm.getByText('Removed', { exact: true })).toHaveCount(0);
    await expect(confirm.getByText('Failed', { exact: true })).toBeVisible();
    await expect(confirm.getByText('Access denied', { exact: true })).toBeVisible();
    await confirm.getByRole('button', { name: 'Retry failed removals', exact: true }).click();
    await expect(confirm).not.toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(2);
    await expect.poll(() => electronApp.evaluate(({ ipcMain }) =>
        (ipcMain as typeof ipcMain & { editorRemovalCalls: string[][] }).editorRemovalCalls,
    )).toEqual([['4.7-stable', '4.5.1-stable'], ['4.5.1-stable']]);
});

test('keeps skipped editors visible after failed-only retry without resizing the dialog', async () => {
    await prepareAppWithStubbedData(page, electronApp, { projects: [] });
    await stubPartialRemoval(true);
    await openInstalls();
    await page.getByRole('button', { name: 'Enable multi-select' }).click();
    await openActions();
    await page.getByRole('button', { name: 'Select all', exact: true }).click();
    await openActions();
    await page.getByRole('button', { name: 'Remove selected (3)', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: 'Remove 3 editors?', exact: true });
    const before = await confirm.boundingBox();
    await confirm.getByRole('button', { name: 'Remove selected (3)', exact: true }).click();
    await expect(confirm.getByText('Removed: 1. Failed: 1. Skipped: 1.', { exact: true })).toBeVisible();
    await expect(confirm.getByText(/editor installations will be deleted/)).toHaveCount(0);
    expect(await confirm.boundingBox()).toEqual(before);
    await confirm.getByRole('button', { name: 'Retry failed removals', exact: true }).click();
    await expect(confirm.getByText('Removed: 2. Failed: 0. Skipped: 1.', { exact: true })).toBeVisible();
    await expect(confirm.getByText('Editor changed; select it again.', { exact: true })).toBeVisible();
    await expect(confirm.getByRole('button', { name: 'Retry failed removals', exact: true })).toHaveCount(0);
    expect(await confirm.boundingBox()).toEqual(before);
    await confirm.getByRole('button', { name: 'Close', exact: true }).click();
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

/** Replaces only batch removal with a deterministic partial-failure fixture.
 * @param includeSkip - Whether a custom registration stays skipped after retries.
 */
async function stubPartialRemoval(includeSkip = false): Promise<void> {
    await electronApp.evaluate(({ ipcMain }, { installed, includeSkip }: { installed: InstalledRelease[]; includeSkip: boolean }) => {
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
                const skipped = includeSkip && release.source === 'custom';
                if (!failed && !skipped) remaining = remaining.filter((candidate) => candidate.version !== release.version || candidate.mono !== release.mono);
                return { release, status: skipped ? 'skipped' : failed ? 'failed' : 'removed', ...(skipped ? { error: 'Editor changed; select it again.' } : failed ? { error: 'Access denied' } : {}) };
            });
            return { success: true, data: { outcomes, releases: remaining } };
        });
    }, { installed: SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM, includeSkip });
}
