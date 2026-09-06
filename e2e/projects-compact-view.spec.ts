import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, type Page, expect, test } from '@playwright/test';
import { createFixtureHome, prepareAppWithStubbedData, setAppLanguage } from './support/e2e-fixture-runtime';
import { SAMPLE_PREFS, SAMPLE_PROJECTS, SAMPLE_VSCODE_SETTINGS_AVAILABLE } from './support/e2e-fixture-data';
import { getMainWindow } from './splashscreen/getMainWindow';

let electronApp: ElectronApplication;
let mainPage: Page;
let fixtureHome: string;
test.describe.configure({ mode: 'serial' });


test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    electronApp = await _electron.launch({ args: ['.'], env: createIsolatedLaunchEnvironment(fixtureHome) });
    mainPage = await getMainWindow(electronApp);
    await setAppLanguage(mainPage, 'English');
    await capturePreferences();
});
test.afterAll(async () => {
    await electronApp?.close();
    if (fixtureHome) await fs.rm(fixtureHome, { recursive: true, force: true });
});

/** Captures real preference handlers before the fixture replaces them. */
async function capturePreferences() {
    await electronApp.evaluate(({ ipcMain }) => {
        const fixtureIpc = ipcMain as typeof ipcMain & {
            _invokeHandlers: Map<string, (...args: unknown[]) => unknown>;
            compactPreferenceHandlers?: Map<string, (...args: unknown[]) => unknown>;
        };
        fixtureIpc.compactPreferenceHandlers = new Map(
            ['app.getUserPreferences', 'app.setUserPreferences'].map(channel => {
                const handler = fixtureIpc._invokeHandlers.get(channel);
                if (!handler) throw new Error(`Missing preference handler: ${channel}`);
                return [channel, handler];
            }),
        );
    });
}

/** Restores actual disk-backed preferences behind the fixture preload bridge. */
async function restorePreferences() {
    await electronApp.evaluate(({ ipcMain }) => {
        const handlers = (ipcMain as typeof ipcMain & {
            compactPreferenceHandlers: Map<string, (...args: unknown[]) => unknown>;
        }).compactPreferenceHandlers;
        for (const [channel, handler] of handlers) {
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, handler);
        }
    });
}

test('switches accessibly, preserves search, and remembers the view after restart', async () => {
    test.setTimeout(60000);
    await prepareAppWithStubbedData(mainPage, electronApp);
    await restorePreferences();
    await mainPage.getByTestId('btnProjects').click();
    const cards = mainPage.getByTestId('tabProjectCards');
    const list = mainPage.getByTestId('tabProjectList');
    await expect(cards).toHaveAttribute('aria-selected', 'true');
    const originalPaths = await mainPage.locator('[data-project-path]').evaluateAll(rows => rows.map(row => row.getAttribute('data-project-path')));
    await cards.focus();
    await cards.press('ArrowRight');
    await expect(list).toHaveAttribute('aria-selected', 'true');
    await expect(list).toBeFocused();
    await expect(mainPage.getByTestId('btnEditProjectInGodot')).toHaveCount(0);
    expect(await mainPage.locator('[data-project-path]').evaluateAll(rows => rows.map(row => row.getAttribute('data-project-path')))).toEqual(originalPaths);
    await mainPage.getByTestId('inputProjectSearch').fill('Awesome');
    await expect(mainPage.locator('[data-project-path]')).toHaveCount(1);
    await expect(mainPage.getByTestId('btnReorderPinnedProject')).toBeDisabled();
    await cards.click();
    await expect(cards).toHaveAttribute('aria-selected', 'true');
    await expect(mainPage.getByTestId('inputProjectSearch')).toHaveValue('Awesome');
    await list.click();
    await expect(list).toHaveAttribute('aria-selected', 'true');
    await mainPage.getByTestId('inputProjectSearch').fill('');
    await mainPage.getByTestId('btnSettings').click();
    await mainPage.getByTestId('btnProjects').click();
    await expect(list).toHaveAttribute('aria-selected', 'true');
    await mainPage.reload();
    await expect(list).toHaveAttribute('aria-selected', 'true');

    await electronApp.close();
    electronApp = await _electron.launch({ args: ['.'], env: createIsolatedLaunchEnvironment(fixtureHome) });
    mainPage = await getMainWindow(electronApp);
    await capturePreferences();
    await prepareAppWithStubbedData(mainPage, electronApp);
    await restorePreferences();
    await mainPage.reload();
    await mainPage.getByTestId('btnProjects').click();
    await expect(mainPage.getByTestId('tabProjectList')).toHaveAttribute('aria-selected', 'true');

    await fs.mkdir(path.resolve('.internal-docs/projects-compact-view'), { recursive: true });
    for (const theme of ['dark', 'light'] as const) {
        await mainPage.getByTestId('btnSettings').click();
        await mainPage.getByRole('tab', { name: 'Appearance', exact: true }).click();
        await mainPage.getByTestId(theme === 'dark' ? 'themeDark' : 'themeLight').click();
        await mainPage.getByTestId('btnProjects').click();
        for (const width of [1024, 1440]) {
            await mainPage.setViewportSize({ width, height: width === 1024 ? 600 : 900 });
            await expect(mainPage.getByTestId('tabProjectList')).toBeVisible();
            await expect(mainPage.locator('[data-project-path]')).toHaveCount(3);
            const heights = await mainPage.locator('[data-project-path]').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
            expect(heights.every(height => height >= 64 && height <= 72)).toBe(true);
            const toggleBox = await mainPage.getByRole('tablist', { name: 'List view / Cards view' }).boundingBox();
            const searchBox = await mainPage.getByTestId('inputProjectSearch').boundingBox();
            expect(toggleBox?.height).toBe(28);
            expect(searchBox?.height).toBe(28);
            await mainPage.screenshot({ path: `.internal-docs/projects-compact-view/list-${theme}-${width}.png` });
        }
    }
});

test('keeps the saved view when a preference write fails and allows retry', async () => {
    await mainPage.getByTestId('tabProjectCards').click();
    await expect(mainPage.getByTestId('tabProjectCards')).toHaveAttribute('aria-selected', 'true');
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('app.setUserPreferences');
        ipcMain.handle('app.setUserPreferences', () => { throw new Error('Fixture write failure'); });
    });
    await mainPage.getByTestId('tabProjectList').click();
    await expect(mainPage.getByText('Could not save the project view. Please try again.')).toBeVisible();
    await expect(mainPage.getByTestId('tabProjectCards')).toHaveAttribute('aria-selected', 'true');
    await mainPage.getByRole('button', { name: 'Ok', exact: true }).click();
    await restorePreferences();
    await mainPage.getByTestId('tabProjectList').click();
    await expect(mainPage.getByTestId('tabProjectList')).toHaveAttribute('aria-selected', 'true');
});

test('launches only from the compact identity and keeps other actions independent', async () => {
    await mainPage.setViewportSize({ width: 1024, height: 600 });
    await electronApp.evaluate(({ ipcMain }) => {
        const fixture = ipcMain as typeof ipcMain & { compactLaunches?: string[] };
        fixture.compactLaunches = [];
        ipcMain.removeHandler('projects.launchProject');
        ipcMain.handle('projects.launchProject', (_, project) => {
            fixture.compactLaunches?.push(project.path);
            return { success: true, data: { launched: true } };
        });
    });
    const row = mainPage.locator('[data-project-section="new"]').first();
    const launch = row.getByTestId('btnLaunchCompactProject');
    await launch.hover();
    await expect(mainPage.getByRole('tooltip', { name: 'Edit in Godot', exact: true })).toBeVisible();
    await expect(launch.locator('span').last()).toHaveCSS('text-decoration-line', 'underline');
    await launch.locator('img').hover();
    await expect(mainPage.getByRole('tooltip', { name: 'Edit in Godot', exact: true })).toBeVisible();
    await expect(launch.locator('span').last()).toHaveCSS('text-decoration-line', 'underline');
    await row.getByRole('button', { name: 'Copy path', exact: true }).click();
    await row.getByTestId('btnProjectFolders').click();
    await mainPage.keyboard.press('Escape');
    await row.getByTestId('btnProjectMoreOptions').click();
    await mainPage.keyboard.press('Escape');
    expect(await readLaunches()).toEqual([]);
    const projectPath = await row.getAttribute('data-project-path');
    await row.getByTestId('btnLaunchCompactProject').click();
    await expect.poll(readLaunches).toEqual([projectPath]);
});

test('fits long translated content, warnings and two additional action slots', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp, {
        preferences: { ...SAMPLE_PREFS, projects_view_mode: 'list' },
        projects: SAMPLE_PROJECTS.map((project, index) => ({
            ...project,
            name: `${project.name} - A very long project name for checking compact layout`,
            path: `${project.path}/a-long-folder-name/another-long-folder-name/project`,
            version: `${project.version}-a-long-custom-editor-build-name`,
            open_windowed: true,
            withGit: true,
            icon_path: undefined,
            valid: index !== 0,
            invalid_reason: index === 0 ? 'missing_project_file' : undefined,
            release: { ...project.release, prerelease: true },
        })),
        codeEditorSettings: [{ ...SAMPLE_VSCODE_SETTINGS_AVAILABLE, installation: null }],
    });
    await setAppLanguage(mainPage, 'Deutsch');
    await mainPage.setViewportSize({ width: 1024, height: 600 });
    await expect(mainPage.getByTestId('tabProjectList')).toHaveAttribute('aria-selected', 'true');
    await expect(mainPage.locator('[data-project-section="pinned"]').getByTestId('btnLaunchCompactProject')).toBeDisabled();
    // The approved capacity check adds visual slots only to the test DOM.
    await mainPage.getByTestId('btnProjectMoreOptions').evaluateAll(buttons => {
        for (const button of buttons) {
            for (let index = 0; index < 2; index++) {
                const slot = document.createElement('span');
                slot.style.cssText = 'display:block;width:28px;height:28px;flex-shrink:0;border:1px dashed currentColor;border-radius:4px';
                slot.setAttribute('aria-hidden', 'true');
                button.parentElement?.appendChild(slot);
            }
        }
    });
    const fits = await mainPage.locator('[data-project-path]').evaluateAll(rows => rows.every(row => {
        const bounds = row.getBoundingClientRect();
        return bounds.height <= 72 && [...row.querySelectorAll('button')].every(button => {
            const rect = button.getBoundingClientRect();
            return rect.left >= bounds.left && rect.right <= bounds.right && rect.width >= 20;
        });
    }));
    expect(fits).toBe(true);
    await mainPage.screenshot({ path: '.internal-docs/projects-compact-view/list-long-content-de-1024.png' });
});

test('places the missing-editor warning beside the version without duplicate title badges', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp, {
        preferences: { ...SAMPLE_PREFS, projects_view_mode: 'list' },
        projects: [{ ...SAMPLE_PROJECTS[0], valid: false, invalid_reason: 'missing_editor', codeEditorId: null }],
        installedReleases: [],
    });
    await mainPage.getByTestId('btnProjects').click();
    const row = mainPage.locator('[data-project-path]');
    const version = row.getByTestId('compactProjectEditorVersion');
    await expect(version).toHaveClass(/text-warning/);
    await expect(version).toContainText(SAMPLE_PROJECTS[0].version);
    await expect(row.locator('svg.lucide-triangle-alert')).toHaveCount(1);
    await expect(version.locator('svg.lucide-triangle-alert')).toHaveCount(1);
    const disabledLaunch = row.getByTestId('btnLaunchCompactProject');
    await expect(disabledLaunch).toBeDisabled();
    await disabledLaunch.hover({ force: true });
    await mainPage.waitForTimeout(600);
    await expect(mainPage.getByRole('tooltip', { name: 'Edit in Godot', exact: true })).toHaveCount(0);
    await expect(disabledLaunch.locator('xpath=..')).not.toHaveAttribute('data-tooltip-trigger', '');
    await fs.mkdir(path.resolve('.internal-docs/projects-compact-view'), { recursive: true });
    await mainPage.screenshot({ path: '.internal-docs/projects-compact-view/list-missing-editor.png' });
});

test('previews cards with all badges and long version labels', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp, {
        preferences: { ...SAMPLE_PREFS, projects_view_mode: 'cards' },
        projects: SAMPLE_PROJECTS.map((project, index) => ({
            ...project,
            version: index === 0 ? '4.7-stable' : '4.7.0-custom-studio-rendering-preview.2026.09',
            open_windowed: true,
            withGit: true,
            release: { ...project.release, prerelease: true },
        })),
    });
    await mainPage.getByTestId('btnProjects').click();
    for (const language of ['English', 'Deutsch']) {
        await setAppLanguage(mainPage, language);
        for (const width of [1024, 1440]) {
            await mainPage.setViewportSize({ width, height: 900 });
            await expect(mainPage.getByTestId('tabProjectCards')).toHaveAttribute('aria-selected', 'true');
            await expect(mainPage.getByTestId('projectBadges').first().locator(':scope > *')).toHaveCount(4);
            const badgeLayout = await mainPage.getByTestId('projectBadges').evaluateAll(groups => groups.map(group => {
                const bounds = group.getBoundingClientRect();
                const boxes = [...group.children].map(child => child.getBoundingClientRect());
                return {
                    rows: new Set(boxes.map(box => box.top)).size,
                    fits: boxes.every(box => box.left >= bounds.left && box.right <= bounds.right + 1),
                };
            }));
            expect(badgeLayout.every(layout => layout.fits)).toBe(true);
            expect(badgeLayout.map(layout => layout.rows)).toEqual(width === 1024 ? [2, 1, 2] : [1, 1, 1]);
            await mainPage.screenshot({ path: `.internal-docs/projects-compact-view/cards-all-badges-${language}-${width}.png` });
        }
    }
});

/** Returns launches recorded by the test's project handler. */
async function readLaunches() {
    return electronApp.evaluate(({ ipcMain }) => (ipcMain as typeof ipcMain & { compactLaunches: string[] }).compactLaunches);
}

/** Builds an isolated Electron fixture environment.
 * @param homeDir - Temporary home for this test.
 */
function createIsolatedLaunchEnvironment(homeDir: string) {
    const overrideHomeScript = path.resolve(
        process.cwd(),
        'e2e',
        'support',
        'overrideHome.cjs',
    );
    const existingNodeOptions = process.env.NODE_OPTIONS?.trim();
    const requireOverrideOption = `--require "${overrideHomeScript}"`;
    const launchEnv: Record<string, string> = {
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
    delete launchEnv.ELECTRON_RUN_AS_NODE;
    return launchEnv;
}
