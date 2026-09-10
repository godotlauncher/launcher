import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';
import type {
    InstalledRelease,
    ProjectDetails,
    ReleaseInstallProgress,
    ReleaseSummary,
} from '@shared/contracts';
import { SAMPLE_INSTALLED_RELEASES, SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { createFixtureHome, prepareAppWithStubbedData, setAppLanguage } from './support/e2e-fixture-runtime';
import { getMainWindow } from './splashscreen/getMainWindow';

let electronApp: ElectronApplication;
let page: Page;
let fixtureHome: string;

const installedRelease = SAMPLE_INSTALLED_RELEASES[0];
const project: ProjectDetails = {
    ...SAMPLE_PROJECTS[0],
    codeEditorId: null,
    name: 'Settings catalogue',
    release: installedRelease,
    version: installedRelease.version,
    version_number: installedRelease.version_number,
};
const catalogueRelease: ReleaseSummary = {
    version: '4.9.3-stable', version_number: 4.9, name: '4.9.3-stable',
    published_at: '2026-09-05T00:00:00Z', draft: false, prerelease: false,
    assets: [{ name: 'Godot_v4.9.3-stable_mono_macos.universal.zip', download_url: 'https://example.invalid/godot.zip', platform_tags: ['darwin', 'universal'], mono: true }],
};

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    electronApp = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`],
        env: createIsolatedLaunchEnvironment(fixtureHome),
    });
    page = await getMainWindow(electronApp);
    await setAppLanguage(page, 'English');
});
test.afterAll(async () => {
    await electronApp.close();
    await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('saves a catalogue editor before its delayed download and recovers both project views', async () => {
    await prepareAppWithStubbedData(page, electronApp, {
        projects: [project], installedReleases: [installedRelease], availableReleases: [catalogueRelease], availablePrereleases: [],
    });
    await stubCatalogueEditorSave();
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    const drawer = page.getByRole('dialog', {
        name: 'Settings catalogue Settings',
    });
    await drawer.locator('#projectEditName').fill('Saved before download');
    await drawer.getByTestId('tabProjectSettings_launch').click();
    await drawer.getByRole('checkbox').check();
    await drawer.getByTestId('tabProjectSettings_project').click();
    await drawer.getByTestId('selectProjectGodotEditor').click();
    await drawer.getByTestId('tabCreateProjectBrowseEditors').click();
    await drawer.getByTestId('createProjectCatalogueEditor_catalogue:4.9.3-stable:mono').click();
    await drawer.getByRole('button', { name: 'Install and save' }).click();

    await expect(drawer).not.toBeVisible();
    await expect.poll(readSettingsEvents).toEqual([
        'rename:Saved before download', 'editor:4.9.3-stable:true',
        'windowed:true', 'install:4.9.3-stable:true',
    ]);
    const card = page.locator('[data-project-path]').filter({ hasText: 'Saved before download' });
    await expect(card).toContainText('4.9.3-stable (.NET)');
    await expect(card.getByTestId('projectBadges').locator('.loading-spinner')).toBeVisible();
    await expect(card.getByTestId('btnEditProjectInGodot')).toBeDisabled();

    await page.getByTestId('tabProjectList').click();
    const row = page.locator('[data-project-path]').filter({ hasText: 'Saved before download' });
    await expect(row.getByTestId('compactProjectEditorVersion')).toContainText('4.9.3-stable (.NET)');
    await expect(row.getByTestId('compactProjectEditorVersion').locator('.loading-spinner')).toBeVisible();
    await expect(row.getByTestId('btnLaunchCompactProject')).toBeDisabled();

    await completeCatalogueEditorInstall();
    await expect.poll(readSettingsEvents).toEqual([
        'rename:Saved before download', 'editor:4.9.3-stable:true',
        'windowed:true', 'install:4.9.3-stable:true', 'repair:4.9.3-stable:true',
    ]);
    await expect(row.getByTestId('compactProjectEditorVersion')).toContainText('4.9.3-stable (.NET)');
    await expect(row.getByTestId('btnLaunchCompactProject')).toBeEnabled();
    await page.getByTestId('tabProjectCards').click();
    await expect(card.getByTestId('btnEditProjectInGodot')).toBeEnabled();
});

test('keeps the saved missing selection after a download failure', async () => {
    await prepareAppWithStubbedData(page, electronApp, {
        projects: [project], installedReleases: [installedRelease], availableReleases: [catalogueRelease], availablePrereleases: [],
    });
    await stubCatalogueEditorSave({ failInstall: true });
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    const drawer = page.getByRole('dialog', {
        name: 'Settings catalogue Settings',
    });
    await drawer.getByTestId('selectProjectGodotEditor').click();
    await drawer.getByTestId('tabCreateProjectBrowseEditors').click();
    await drawer.getByTestId('createProjectCatalogueEditor_catalogue:4.9.3-stable:mono').click();
    await drawer.getByRole('button', { name: 'Install and save' }).click();
    await expect(drawer).not.toBeVisible();
    await expect(page.getByText('Simulated installation failure')).toBeVisible();
    const card = page.locator('[data-project-path]');
    await expect(card).toContainText('4.9.3-stable (.NET)');
    await expect(card.getByTestId('btnEditProjectInGodot')).toBeDisabled();
});

test('keeps Settings open when a combined save fails before download starts', async () => {
    await prepareAppWithStubbedData(page, electronApp, {
        projects: [project], installedReleases: [installedRelease], availableReleases: [catalogueRelease], availablePrereleases: [],
    });
    await stubCatalogueEditorSave({ failRename: true });
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    const drawer = page.getByRole('dialog', {
        name: 'Settings catalogue Settings',
    });
    await drawer.locator('#projectEditName').fill('Rejected save');
    await drawer.getByTestId('tabProjectSettings_launch').click();
    await drawer.getByRole('checkbox').check();
    await drawer.getByTestId('tabProjectSettings_project').click();
    await drawer.getByTestId('selectProjectGodotEditor').click();
    await drawer.getByTestId('tabCreateProjectBrowseEditors').click();
    await drawer.getByTestId('createProjectCatalogueEditor_catalogue:4.9.3-stable:mono').click();
    await drawer.getByRole('button', { name: 'Install and save' }).click();

    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('alert')).toContainText('Simulated save failure');
    await expect.poll(readSettingsEvents).toEqual(['rename:Rejected save']);
    await expect(page.getByTestId('btnEditProjectInGodot')).toBeEnabled();
});

test('keeps an installed custom editor staged until Settings is saved', async () => {
    const customRelease: InstalledRelease = {
        ...installedRelease,
        version: '4.7.0-custom.1',
        name: 'Studio custom editor',
        mono: false,
        source: 'custom',
    };
    await prepareAppWithStubbedData(page, electronApp, {
        projects: [project],
        installedReleases: [installedRelease, customRelease],
        availableReleases: [catalogueRelease],
        availablePrereleases: [],
    });
    await stubCatalogueEditorSave({
        initialInstalledReleases: [installedRelease, customRelease],
    });
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    const drawer = page.getByRole('dialog', {
        name: 'Settings catalogue Settings',
    });
    await drawer.getByTestId('selectProjectGodotEditor').click();
    await drawer
        .getByRole('option', { name: /Studio custom editor/ })
        .click();
    await expect.poll(readSettingsEvents).toEqual([]);
    await drawer.getByRole('button', { name: 'Update' }).click();
    await expect(drawer).not.toBeVisible();
    await expect.poll(readSettingsEvents).toEqual([
        'repair:4.7.0-custom.1:false',
    ]);
});

test('offers the matching missing editor from the catalogue', async () => {
    const missingProject: ProjectDetails = {
        ...project,
        valid: false,
        invalid_reason: 'missing_editor',
        release: {
            ...installedRelease,
            valid: false,
            install_path: '',
            editor_path: '',
        },
    };
    const matchingRelease: ReleaseSummary = {
        ...catalogueRelease,
        version: installedRelease.version,
        version_number: installedRelease.version_number,
        assets: catalogueRelease.assets.map((asset) => ({
            ...asset,
            mono: false,
        })),
    };
    await prepareAppWithStubbedData(page, electronApp, {
        projects: [missingProject],
        installedReleases: [],
        availableReleases: [matchingRelease],
        availablePrereleases: [],
    });
    await stubCatalogueEditorSave({
        failInstall: true,
        initialInstalledReleases: [],
        initialProject: missingProject,
    });
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    const drawer = page.getByRole('dialog', {
        name: 'Settings catalogue Settings',
    });
    await drawer.getByTestId('selectProjectGodotEditor').click();
    await expect(drawer.getByTestId('selectProjectGodotEditor')).toContainText(
        'Not installed',
    );
    const picker = drawer.getByTestId('createProjectEditorPickerPopover');
    await expect(
        picker.getByRole('tab', { name: 'Browse releases' }),
    ).toHaveAttribute('aria-selected', 'true');
    await drawer
        .getByTestId(
            `createProjectCatalogueEditor_catalogue:${installedRelease.version}:std`,
        )
        .click();
    await drawer.getByRole('button', { name: 'Install and save' }).click();
    await expect(drawer).not.toBeVisible();
    await expect.poll(readSettingsEvents).toEqual([
        `editor:${installedRelease.version}:false`,
        `install:${installedRelease.version}:false`,
    ]);
});

test('retains staged settings across tabs and discards them when closed', async () => {
    await prepareAppWithStubbedData(page, electronApp, {
        projects: [project], installedReleases: [installedRelease],
        availableReleases: [catalogueRelease], availablePrereleases: [],
    });
    await stubCatalogueEditorSave();
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('projects.getProjectGodotName');
        ipcMain.handle('projects.getProjectGodotName', async (_event, selected) => new Promise((resolve) => {
            (globalThis as typeof globalThis & { __finishSettingsName?: () => void }).__finishSettingsName =
                () => resolve({ success: true, data: selected.name });
        }));
    });
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    const drawer = page.getByRole('dialog', { name: 'Settings catalogue Settings' });
    await expect.poll(() => electronApp.evaluate(() => Boolean(
        (globalThis as typeof globalThis & { __finishSettingsName?: () => void }).__finishSettingsName,
    ))).toBe(true);
    await electronApp.evaluate(({ BrowserWindow }, selected) => {
        for (const window of BrowserWindow.getAllWindows()) {
            const contents = window.webContents as typeof window.webContents & { __e2eFixtureProjects?: ProjectDetails[] };
            contents.__e2eFixtureProjects = [selected];
            contents.send('projects-updated', [selected]);
        }
    }, project);
    await drawer.locator('#projectEditName').fill('Unsaved draft');
    await electronApp.evaluate(() => {
        (globalThis as typeof globalThis & { __finishSettingsName?: () => void }).__finishSettingsName?.();
    });
    await expect(drawer.getByRole('button', { name: 'Update', exact: true })).toBeEnabled();
    await drawer.getByTestId('tabProjectSettings_launch').click();
    const windowed = drawer.getByRole('checkbox');
    await windowed.setChecked(!Boolean(project.open_windowed));
    await drawer.getByTestId('tabProjectSettings_codeEditor').click();
    await drawer.getByTestId('tabProjectSettings_project').click();
    await expect(drawer.locator('#projectEditName')).toHaveValue('Unsaved draft');
    await drawer.getByTestId('tabProjectSettings_launch').click();
    await expect(windowed).toBeChecked({ checked: !Boolean(project.open_windowed) });
    await drawer.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(drawer).not.toBeVisible();
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('projects.getProjectGodotName');
        ipcMain.handle('projects.getProjectGodotName', async (_event, selected) => ({ success: true, data: selected.name }));
    });
    await page.getByTestId('btnProjectSettings').click();
    await expect(drawer.locator('#projectEditName')).toHaveValue(project.name);
    await drawer.getByTestId('tabProjectSettings_launch').click();
    await expect(windowed).toBeChecked({ checked: Boolean(project.open_windowed) });
    await expect.poll(readSettingsEvents).toEqual([]);
    await drawer.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('retains a Git identity draft across tabs and saves it independently', async () => {
    const gitProject = { ...project, withGit: true };
    await prepareAppWithStubbedData(page, electronApp, {
        projects: [gitProject], installedReleases: [installedRelease],
        availableReleases: [catalogueRelease], availablePrereleases: [],
    });
    await stubCatalogueEditorSave({ initialProject: gitProject });
    await electronApp.evaluate(({ ipcMain }, projectPath) => {
        let identity = {
            status: 'available', canUpdate: true,
            repository: { root: projectPath, isProjectRoot: true, kind: 'standard' },
            name: { value: 'Original identity', source: 'repository' },
            email: { value: 'original@example.invalid', source: 'repository' },
        };
        const state = globalThis as typeof globalThis & {
            __settingsIdentityReads?: number;
            __finishStaleSettingsIdentity?: () => void;
        };
        state.__settingsIdentityReads = 0;
        ipcMain.removeHandler('projects.getProjectGitIdentity');
        ipcMain.handle('projects.getProjectGitIdentity', async () => {
            state.__settingsIdentityReads = (state.__settingsIdentityReads ?? 0) + 1;
            if (state.__settingsIdentityReads === 1) {
                return new Promise((resolve) => {
                    state.__finishStaleSettingsIdentity = () => resolve({
                        success: true,
                        data: { ...identity, name: { value: 'Stale response', source: 'repository' } },
                    });
                });
            }
            return { success: true, data: identity };
        });
        ipcMain.removeHandler('projects.setProjectGitIdentity');
        ipcMain.handle('projects.setProjectGitIdentity', async (_event, _project, next) => {
            identity = { ...identity, name: { value: next.name, source: 'repository' }, email: { value: next.email, source: 'repository' } };
            return { success: true, data: identity };
        });
    }, gitProject.path);
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    const drawer = page.getByRole('dialog', { name: 'Settings catalogue Settings' });
    await drawer.getByTestId('tabProjectSettings_sourceControl').click();
    await expect.poll(() => electronApp.evaluate(() =>
        (globalThis as typeof globalThis & { __settingsIdentityReads?: number }).__settingsIdentityReads ?? 0,
    )).toBeGreaterThanOrEqual(1);
    await drawer.getByTestId('tabProjectSettings_project').click();
    await drawer.getByTestId('tabProjectSettings_sourceControl').click();
    const sourceControl = drawer.locator('section').filter({ hasText: 'Original identity' });
    await expect(sourceControl).toBeVisible();
    await electronApp.evaluate(() => {
        (globalThis as typeof globalThis & { __finishStaleSettingsIdentity?: () => void }).__finishStaleSettingsIdentity?.();
    });
    await expect(drawer.getByText('Stale response', { exact: true })).not.toBeVisible();
    await sourceControl.getByRole('button', { name: 'Update', exact: true }).click();
    await drawer.locator('#projectGitIdentityName').fill('Saved identity');
    await drawer.locator('#projectGitIdentityEmail').fill('saved@example.invalid');
    await drawer.getByTestId('tabProjectSettings_project').click();
    await drawer.getByTestId('tabProjectSettings_sourceControl').click();
    await expect(drawer.locator('#projectGitIdentityName')).toHaveValue('Saved identity');
    await expect(drawer.locator('#projectGitIdentityEmail')).toHaveValue('saved@example.invalid');
    await drawer.getByRole('button', { name: 'Save identity' }).click();
    await expect(drawer.locator('#projectGitIdentityName')).not.toBeVisible();
    await expect(drawer.getByText('Saved identity', { exact: true })).toBeVisible();
    await expect(drawer.getByText('saved@example.invalid', { exact: true })).toBeVisible();
    await expect.poll(readSettingsEvents).toEqual([]);
    await drawer.getByRole('button', { name: 'Cancel', exact: true }).click();
});

/**
 * Replaces project saves and installation with a delayed, stateful fixture flow.
 *
 * @param options - Whether the save or editor installation should fail.
 * @returns A promise that resolves when fixture IPC handlers are ready.
 */
async function stubCatalogueEditorSave(
    options: {
        failInstall?: boolean;
        failRename?: boolean;
        initialInstalledReleases?: InstalledRelease[];
        initialProject?: ProjectDetails;
    } = {},
): Promise<void> {
    await electronApp.evaluate(({ ipcMain, BrowserWindow }, injected) => {
        type EditorSelection = { release: ReleaseSummary; mono: boolean };
        const state = globalThis as typeof globalThis & {
            __settingsCatalogueEvents?: string[];
            __settingsCatalogueComplete?: () => void;
        };
        state.__settingsCatalogueEvents = [];
        let currentProject = injected.options.initialProject ?? injected.initialProject;
        let installedReleases =
            injected.options.initialInstalledReleases ?? [injected.installedRelease];
        const publishProjects = () => {
            for (const window of BrowserWindow.getAllWindows()) {
                const contents = window.webContents as typeof window.webContents & { __e2eFixtureProjects?: ProjectDetails[] };
                contents.__e2eFixtureProjects = [currentProject];
                contents.send('projects-updated', [currentProject]);
            }
        };
        const createInstalledRelease = (release: ReleaseSummary, mono: boolean): InstalledRelease => ({
            ...injected.installedRelease, version: release.version, version_number: release.version_number, mono,
            install_path: `/editors/${release.version}`, editor_path: `/editors/${release.version}/Godot`, valid: true,
        });
        const publishInstallProgress = (progress: ReleaseInstallProgress) => {
            for (const window of BrowserWindow.getAllWindows()) {
                window.webContents.send('release-install-progress', progress);
            }
        };
        ipcMain.removeHandler('projects.renameProject');
        ipcMain.handle('projects.renameProject', async (_event, _project, saveOptions) => {
            state.__settingsCatalogueEvents?.push(`rename:${saveOptions.name}`);
            if (injected.options.failRename) {
                return { success: true, data: { success: false, error: 'Simulated save failure' } };
            }
            currentProject = { ...currentProject, name: saveOptions.name };
            publishProjects();
            return { success: true, data: { success: true, project: currentProject, projects: [currentProject] } };
        });
        for (const channel of [
            'editorInstalls.getInstalledEditors',
            'editorInstalls.revalidateInstalledEditors',
        ]) {
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, async () => ({
                success: true,
                data: installedReleases,
            }));
        }
        ipcMain.removeHandler('projects.setProjectEditor');
        ipcMain.handle('projects.setProjectEditor', async (_event, _project, selection: EditorSelection | InstalledRelease) => {
            const selected = 'release' in selection ? selection.release : selection;
            const mono = selection.mono;
            const repairing = !('release' in selection);
            state.__settingsCatalogueEvents?.push(`${repairing ? 'repair' : 'editor'}:${selected.version}:${mono}`);
            currentProject = repairing ? {
                ...currentProject, release: selected, version: selected.version, version_number: selected.version_number,
                launch_path: selected.editor_path, valid: true, invalid_reason: undefined,
            } : {
                ...currentProject,
                release: { ...selected, mono, install_path: '', editor_path: '', valid: false, source: 'official' },
                version: selected.version, version_number: selected.version_number, launch_path: '', valid: false, invalid_reason: 'missing_editor',
            };
            publishProjects();
            return { success: true, data: { success: true, projects: [currentProject] } };
        });
        ipcMain.removeHandler('projects.setProjectWindowed');
        ipcMain.handle('projects.setProjectWindowed', async (_event, _project, openWindowed: boolean) => {
            state.__settingsCatalogueEvents?.push(`windowed:${openWindowed}`);
            currentProject = { ...currentProject, open_windowed: openWindowed };
            publishProjects();
            return { success: true, data: currentProject };
        });
        ipcMain.removeHandler('editorInstalls.installEditor');
        ipcMain.handle('editorInstalls.installEditor', async (_event, release: ReleaseSummary, mono: boolean) => {
            state.__settingsCatalogueEvents?.push(`install:${release.version}:${mono}`);
            const progress = {
                id: 'settings-catalogue-install',
                version: release.version,
                mono,
                prerelease: release.prerelease,
                published_at: release.published_at,
                canCancel: false,
            };
            publishInstallProgress({ ...progress, stage: 'queued', percent: 0, queuePosition: 1 });
            publishInstallProgress({ ...progress, stage: 'downloading', percent: 42, receivedBytes: 42, totalBytes: 100 });
            if (injected.options.failInstall) {
                publishInstallProgress({ ...progress, stage: 'error', error: 'Simulated installation failure' });
                return { success: true, data: { success: false, error: 'Simulated installation failure' } };
            }
            return await new Promise((resolve) => {
                state.__settingsCatalogueComplete = () => {
                    const installed = createInstalledRelease(release, mono);
                    installedReleases = [injected.installedRelease, installed];
                    for (const window of BrowserWindow.getAllWindows()) {
                        const contents = window.webContents as typeof window.webContents & { __e2eFixtureInstalledReleases?: InstalledRelease[] };
                        contents.__e2eFixtureInstalledReleases = installedReleases;
                        contents.send('releases-updated', installedReleases);
                    }
                    publishInstallProgress({ ...progress, stage: 'complete', percent: 100, release: installed });
                    resolve({ success: true, data: { success: true, version: release.version, release: installed } });
                };
            });
        });
    }, { options, initialProject: project, installedRelease });
}

/**
 * Completes the delayed fixture installation.
 *
 * @returns A promise that resolves after the fixture install completes.
 */
async function completeCatalogueEditorInstall(): Promise<void> {
    await electronApp.evaluate(() => {
        const complete = (globalThis as typeof globalThis & { __settingsCatalogueComplete?: () => void }).__settingsCatalogueComplete;
        if (!complete) throw new Error('No editor installation is pending.');
        complete();
    });
}

/**
 * Reads the ordered fixture save and repair operations.
 *
 * @returns Recorded operation names.
 */
async function readSettingsEvents(): Promise<string[]> {
    return electronApp.evaluate(() => (globalThis as typeof globalThis & { __settingsCatalogueEvents?: string[] }).__settingsCatalogueEvents ?? []);
}

/**
 * Creates an isolated Electron fixture environment.
 *
 * @param homeDir - Fixture home used for launcher state.
 * @returns Environment variables for the fixture Electron process.
 */
function createIsolatedLaunchEnvironment(homeDir: string): Record<string, string> {
    const environment: Record<string, string> = {
        ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
        APPDATA: path.join(homeDir, 'AppData', 'Roaming'), HOME: homeDir,
        LOCALAPPDATA: path.join(homeDir, 'AppData', 'Local'), USERPROFILE: homeDir,
        XDG_CACHE_HOME: path.join(homeDir, '.cache'), XDG_CONFIG_HOME: path.join(homeDir, '.config'),
        XDG_DATA_HOME: path.join(homeDir, '.local', 'share'), XDG_STATE_HOME: path.join(homeDir, '.local', 'state'),
        GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: homeDir,
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    return environment;
}
