import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';
import type { InstalledRelease, ProjectDetails, ReleaseSummary } from '@shared/contracts';
import { createFixtureHome, prepareAppWithStubbedData, setAppLanguage } from './support/e2e-fixture-runtime';
import { SAMPLE_PROJECTS, SAMPLE_INSTALLED_RELEASES, SAMPLE_CUSTOM_RELEASE } from './support/e2e-fixture-data';
import { getMainWindow } from './splashscreen/getMainWindow';

let electronApp: ElectronApplication;
let page: Page;
let fixtureHome: string;
const original = SAMPLE_INSTALLED_RELEASES[0];
const project: ProjectDetails = { ...SAMPLE_PROJECTS[0], name: 'Settings Catalogue', release: original, version: original.version, version_number: original.version_number, codeEditorId: null };
const nextRelease: ReleaseSummary = {
    version: '4.9.3-stable', version_number: 4.9, name: '4.9.3-stable', published_at: '2026-09-05T00:00:00Z', draft: false, prerelease: false,
    assets: [{ name: 'Godot_mono.zip', download_url: 'https://example.invalid/godot.zip', platform_tags: ['darwin', 'universal'], mono: true }],
};

test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    electronApp = await _electron.launch({ args: ['.'], env: createIsolatedLaunchEnvironment(fixtureHome) });
    page = await getMainWindow(electronApp);
    await setAppLanguage(page, 'English');
});
test.afterAll(async () => {
    await electronApp.close();
    await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('closes immediately and reports installation failures before saving in the background', async () => {
    await prepareAppWithStubbedData(page, electronApp, { projects: [project], installedReleases: [original, SAMPLE_CUSTOM_RELEASE], availableReleases: [nextRelease, { ...nextRelease, version: '3.6-stable', version_number: 3.6 }], availablePrereleases: [] });
    await stubSettingsOperations();
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    const drawer = page.getByRole('dialog').filter({ has: page.getByTestId('selectProjectGodotEditor') });
    await expect(drawer).toBeVisible();
    const name = drawer.locator('#projectEditName');
    await name.fill('Preserved Settings Name');
    await drawer.getByTestId('selectProjectGodotEditor').click({ trial: true });
    const openingFrames = await drawer.getByTestId('selectProjectGodotEditor').evaluate(async (trigger) => {
        const panel = document.getElementById(trigger.getAttribute('aria-controls')!)!;
        const frames: { x: number; y: number; width: number; height: number }[] = [];
        (trigger as HTMLButtonElement).click();
        for (let frame = 0; frame < 4; frame += 1) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            if (getComputedStyle(panel).visibility === 'visible') {
                const { x, y, width, height } = panel.getBoundingClientRect();
                frames.push({ x, y, width, height });
            }
        }
        return frames;
    });
    expect(openingFrames.length).toBeGreaterThan(0);
    for (const frame of openingFrames) expect(frame).toEqual(openingFrames[0]);
    const picker = drawer.getByTestId('createProjectEditorPickerPopover');
    await expect(picker.getByRole('option', { name: /Acme 4.7 Custom Editor/ })).toBeVisible();
    const installedBounds = await picker.boundingBox();
    await picker.getByTestId('tabCreateProjectBrowseEditors').click();
    await expect.poll(() => picker.boundingBox()).toEqual(installedBounds);
    await picker.getByTestId('inputCreateProjectEditorSearch').fill('no-matching-editor');
    await expect(picker.getByText('No matching releases', { exact: true })).toBeVisible();
    await expect.poll(() => picker.boundingBox()).toEqual(installedBounds);
    await picker.getByTestId('inputCreateProjectEditorSearch').fill('');

    await expect(picker.getByTestId('createProjectCatalogueEditor_catalogue:3.6-stable:mono')).toHaveCount(0);
    await picker.getByTestId('createProjectCatalogueEditor_catalogue:4.9.3-stable:mono').click();
    await expect.poll(readSettingsEvents).toEqual([]);
    await drawer.getByRole('button', { name: 'Install and save', exact: true }).click();
    await expect(drawer).not.toBeVisible();
    await expect(page.getByText('Simulated installation failure', { exact: true })).toBeVisible();
    await page.getByTestId('btnAlertOk').click();
    await page.getByTestId('btnProjectSettings').click();
    await expect(name).toHaveValue('Preserved Settings Name');
    await expect(drawer.getByTestId('selectProjectGodotEditor')).toContainText('4.9.3-stable');
    await expect.poll(readSettingsEvents).toEqual(['install:4.9.3-stable:true']);
    await drawer.getByRole('button', { name: 'Install and save', exact: true }).click();
    await expect.poll(readSettingsEvents).toEqual(['install:4.9.3-stable:true', 'install:4.9.3-stable:true']);
    await expect(drawer).not.toBeVisible();
    await page.getByTestId('btnProjectSettings').click();
    await expect(drawer.getByTestId('selectProjectGodotEditor')).toBeDisabled();
    await completeSettingsInstall();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId('selectProjectGodotEditor')).toBeEnabled();
    await expect(drawer.getByTestId('selectProjectGodotEditor')).toContainText('4.9.3-stable');
    await expect(name).toHaveValue('Preserved Settings Name');
    await expect(drawer.getByRole('button', { name: 'Update', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect.poll(readSettingsEvents).toEqual(['install:4.9.3-stable:true', 'install:4.9.3-stable:true', 'rename:Preserved Settings Name', 'editor:4.9.3-stable:true']);
});

test('keeps installed custom editor selection staged until settings are saved', async () => {
    await prepareAppWithStubbedData(page, electronApp, { projects: [project], installedReleases: [original, SAMPLE_CUSTOM_RELEASE], availableReleases: [nextRelease], availablePrereleases: [] });
    await stubSettingsOperations();
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    const drawer = page.getByRole('dialog').filter({ has: page.getByTestId('selectProjectGodotEditor') });
    await drawer.getByTestId('selectProjectGodotEditor').click();
    const picker = drawer.getByTestId('createProjectEditorPickerPopover');
    await expect(picker).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(picker).not.toBeVisible();
    await expect(drawer).toBeVisible();
    await drawer.getByTestId('selectProjectGodotEditor').click();
    await picker.getByRole('option', { selected: true }).click();
    await expect(picker).not.toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Update', exact: true })).toBeDisabled();
    await drawer.getByTestId('selectProjectGodotEditor').click();
    await picker.getByRole('option', { name: /Acme 4.7 Custom Editor/ }).click();
    await expect.poll(readSettingsEvents).toEqual([]);
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).not.toBeVisible();
    await expect.poll(readSettingsEvents).toEqual([`editor:${SAMPLE_CUSTOM_RELEASE.version}:false`]);
});

test('offers installation when the selected catalogue version matches the missing current editor', async () => {
    const missingProject: ProjectDetails = { ...project, valid: false, invalid_reason: 'missing_editor', release: { ...original, valid: false, editor_path: '', install_path: '' } };
    const requiredRelease: ReleaseSummary = { ...nextRelease, version: original.version, version_number: original.version_number, assets: nextRelease.assets.map((asset) => ({ ...asset, mono: false })) };
    await prepareAppWithStubbedData(page, electronApp, { projects: [missingProject], installedReleases: [], availableReleases: [requiredRelease], availablePrereleases: [] });
    await stubSettingsOperations(missingProject);
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    const drawer = page.getByRole('dialog').filter({ has: page.getByTestId('selectProjectGodotEditor') });
    await drawer.getByTestId('selectProjectGodotEditor').click();
    await expect(drawer.getByTestId('selectProjectGodotEditor')).toContainText('Not installed');
    const picker = drawer.getByTestId('createProjectEditorPickerPopover');
    await expect(picker.getByRole('tab', { name: 'Browse releases' })).toHaveAttribute('aria-selected', 'true');
    await picker.getByRole('tab', { name: 'Installed', exact: true }).click();
    await expect(picker.getByText('No installed editors', { exact: true })).toBeVisible();
    await expect(picker.getByRole('option')).toHaveCount(0);
    await picker.getByRole('button', { name: 'Browse releases', exact: true }).click();
    await drawer.getByTestId(`createProjectCatalogueEditor_catalogue:${original.version}:std`).click();
    await drawer.getByRole('button', { name: 'Install and save', exact: true }).click();
    await expect(drawer).not.toBeVisible();
    await expect(page.getByText('Simulated installation failure', { exact: true })).toBeVisible();
    await page.getByTestId('btnAlertOk').click();
    await expect.poll(readSettingsEvents).toEqual([`install:${original.version}:false`]);
});

test('finishes submitted settings when an installation completes after navigation', async () => {
    await prepareAppWithStubbedData(page, electronApp, { projects: [project], installedReleases: [original], availableReleases: [nextRelease], availablePrereleases: [] });
    await stubSettingsOperations();
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    const drawer = page.getByRole('dialog').filter({ has: page.getByTestId('selectProjectGodotEditor') });
    await drawer.locator('#projectEditName').fill('Abandoned Settings Name');
    await drawer.getByTestId('selectProjectGodotEditor').click();
    await drawer.getByTestId('tabCreateProjectBrowseEditors').click();
    await drawer.getByTestId('createProjectCatalogueEditor_catalogue:4.9.3-stable:mono').click();
    await drawer.getByRole('button', { name: 'Install and save', exact: true }).click();
    await expect(drawer).not.toBeVisible();
    await expect(page.getByText('Simulated installation failure', { exact: true })).toBeVisible();
    await page.getByTestId('btnAlertOk').click();
    await page.getByTestId('btnProjectSettings').click();
    await drawer.locator('#projectEditName').fill('Submitted Settings Name');
    await drawer.getByTestId('selectProjectGodotEditor').click();
    await drawer.getByTestId('tabCreateProjectBrowseEditors').click();
    await drawer.getByTestId('createProjectCatalogueEditor_catalogue:4.9.3-stable:mono').click();
    await drawer.getByRole('button', { name: 'Install and save', exact: true }).click();
    await expect.poll(readSettingsEvents).toHaveLength(2);
    await page.evaluate(() => { window.location.hash = '#/installs'; });
    await expect(drawer).not.toBeVisible();
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    await expect(drawer.getByTestId('selectProjectGodotEditor')).toBeDisabled();
    await expect(drawer.locator('#projectEditName')).toBeDisabled();
    await expect(drawer.locator('#projectEditName')).toHaveValue('Submitted Settings Name');
    await expect(drawer.getByRole('status')).toContainText('Installing editor');
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await page.getByTestId('btnProjectSettings').click();
    await expect(drawer.getByTestId('selectProjectGodotEditor')).toBeDisabled();
    await completeSettingsInstall();
    await expect(drawer.getByTestId('selectProjectGodotEditor')).toBeEnabled();
    await expect(drawer.getByTestId('selectProjectGodotEditor')).toContainText('4.9.3-stable');
    await expect(drawer.getByRole('button', { name: 'Update', exact: true })).toBeDisabled();
    await expect.poll(readSettingsEvents).toEqual(['install:4.9.3-stable:true', 'install:4.9.3-stable:true', 'rename:Submitted Settings Name', 'editor:4.9.3-stable:true']);
});

/**
 * Stubs installation failure, delayed retry and relevant project mutations.
 * @param initialProject - Project preserved until the settings save succeeds.
 */
async function stubSettingsOperations(initialProject = project): Promise<void> {
    await electronApp.evaluate(({ ipcMain, BrowserWindow }, initialProject) => {
        const state = globalThis as typeof globalThis & { __settingsEvents?: string[]; __settingsComplete?: () => void };
        state.__settingsEvents = [];
        let current = initialProject;
        let installs = 0;
        ipcMain.removeHandler('editorInstalls.installEditor');
        ipcMain.handle('editorInstalls.installEditor', async (_event, release: ReleaseSummary, mono: boolean) => {
            state.__settingsEvents!.push(`install:${release.version}:${mono}`);
            installs += 1;
            if (installs === 1) return { success: true, data: { success: false, error: 'Simulated installation failure' } };
            return new Promise((resolve) => {
                state.__settingsComplete = () => {
                    const installed: InstalledRelease = { ...initialProject.release, version: release.version, version_number: release.version_number, mono, editor_path: '/editors/4.9.3/Godot', install_path: '/editors/4.9.3', valid: true };
                    for (const window of BrowserWindow.getAllWindows()) {
                        const contents = window.webContents as typeof window.webContents & { __e2eFixtureInstalledReleases?: InstalledRelease[] };
                        contents.__e2eFixtureInstalledReleases = [initialProject.release, installed];
                        contents.send('releases-updated', [initialProject.release, installed]);
                    }
                    resolve({ success: true, data: { success: true, version: release.version, release: installed } });
                };
            });
        });
        ipcMain.removeHandler('projects.renameProject');
        ipcMain.handle('projects.renameProject', async (_event, _project, options) => {
            state.__settingsEvents!.push(`rename:${options.name}`);
            current = { ...current, name: options.name };
            return { success: true, data: { success: true, project: current, projects: [current] } };
        });
        ipcMain.removeHandler('projects.setProjectEditor');
        ipcMain.handle('projects.setProjectEditor', async (_event, _project, release: InstalledRelease) => {
            state.__settingsEvents!.push(`editor:${release.version}:${release.mono}`);
            current = { ...current, release, version: release.version, version_number: release.version_number };
            return { success: true, data: { success: true, projects: [current] } };
        });
        ipcMain.removeHandler('projects.launchProject');
        ipcMain.handle('projects.launchProject', () => { state.__settingsEvents!.push('launch'); return { success: true, data: {} }; });
    }, initialProject);
}

/** Reads the ordered installation and mutation calls. */
async function readSettingsEvents(): Promise<string[]> {
    return electronApp.evaluate(() => (globalThis as typeof globalThis & { __settingsEvents?: string[] }).__settingsEvents ?? []);
}

/** Completes the pending successful editor installation. */
async function completeSettingsInstall(): Promise<void> {
    await electronApp.evaluate(() => {
        const complete = (globalThis as typeof globalThis & { __settingsComplete?: () => void }).__settingsComplete;
        if (!complete) throw new Error('No pending settings installation');
        complete();
    });
}

/**
 * Creates an isolated environment for one Electron E2E app.
 *
 * @param homeDir - Fixture home used for launcher state.
 * @returns Environment variables for the fixture Electron process.
 */
function createIsolatedLaunchEnvironment(
    homeDir: string,
): Record<string, string> {
    const overrideHomeScript = path.resolve(
        process.cwd(),
        'e2e',
        'support',
        'overrideHome.cjs',
    );
    const existingNodeOptions = process.env.NODE_OPTIONS?.trim();
    const requireOverrideOption = `--require "${overrideHomeScript}"`;
    const environment: Record<string, string> = {
        ...Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
            ),
        ),
        APPDATA: path.join(homeDir, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(homeDir, 'AppData', 'Local'),
        GODOT_LAUNCHER_E2E_FIXTURES: '1',
        GODOT_LAUNCHER_E2E_HOME_DIR: homeDir,
        NODE_OPTIONS: existingNodeOptions
            ? `${existingNodeOptions} ${requireOverrideOption}`
            : requireOverrideOption,
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    return environment;
}
