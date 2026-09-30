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
    electronApp = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`],
        env: createIsolatedLaunchEnvironment(fixtureHome),
    });
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
    await cards.press('ArrowLeft');
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
    electronApp = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`],
        env: createIsolatedLaunchEnvironment(fixtureHome),
    });
    mainPage = await getMainWindow(electronApp);
    await capturePreferences();
    await prepareAppWithStubbedData(mainPage, electronApp);
    await restorePreferences();
    await mainPage.reload();
    await mainPage.getByTestId('btnProjects').click();
    await expect(mainPage.getByTestId('tabProjectList')).toHaveAttribute('aria-selected', 'true');

    const dense = mainPage.getByTestId('tabProjectDenseList');
    await mainPage.getByTestId('tabProjectList').press('Home');
    await expect(dense).toHaveAttribute('aria-selected', 'true');
    await expect(dense).toBeFocused();
    await dense.press('End');
    await expect(mainPage.getByTestId('tabProjectCards')).toHaveAttribute('aria-selected', 'true');
    await expect(mainPage.getByTestId('tabProjectCards')).toBeFocused();
    await mainPage.getByTestId('tabProjectCards').press('ArrowRight');
    await expect(dense).toHaveAttribute('aria-selected', 'true');
    await mainPage.getByTestId('btnSettings').click();
    await mainPage.getByTestId('btnProjects').click();
    await expect(dense).toHaveAttribute('aria-selected', 'true');
    await mainPage.reload();
    await expect(dense).toHaveAttribute('aria-selected', 'true');
    await electronApp.close();
    electronApp = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`],
        env: createIsolatedLaunchEnvironment(fixtureHome),
    });
    mainPage = await getMainWindow(electronApp);
    await capturePreferences();
    await prepareAppWithStubbedData(mainPage, electronApp);
    await restorePreferences();
    await mainPage.reload();
    await mainPage.getByTestId('btnProjects').click();
    await expect(mainPage.getByTestId('tabProjectDenseList')).toHaveAttribute('aria-selected', 'true');
    await mainPage.getByTestId('tabProjectList').click();

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
            const rows = mainPage.locator('[data-project-path]');
            for (const row of await rows.all()) {
                await expect(row).toBeInViewport();
            }
            const overflows = await rows.evaluateAll(elements => elements.map(element => element.scrollWidth - element.clientWidth));
            expect(overflows.every(overflow => overflow <= 1)).toBe(true);
            const toggleBox = await mainPage.getByRole('tablist', { name: 'List view / Compact view / Cards view' }).boundingBox();
            const searchBox = await mainPage.getByTestId('inputProjectSearch').boundingBox();
            expect(toggleBox).not.toBeNull();
            expect(searchBox).not.toBeNull();
            expect(toggleBox!.height).toBeGreaterThanOrEqual(24);
            expect(searchBox!.height).toBeGreaterThanOrEqual(24);
            expect(Math.abs((toggleBox!.y + toggleBox!.height / 2) - (searchBox!.y + searchBox!.height / 2))).toBeLessThanOrEqual(1);
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
    await mainPage.getByTestId('tabProjectDenseList').click();
    await expect(mainPage.getByText('Could not save the project view. Please try again.')).toBeVisible();
    await expect(mainPage.getByTestId('tabProjectCards')).toHaveAttribute('aria-selected', 'true');
    await mainPage.getByRole('button', { name: 'Ok', exact: true }).click();
    await restorePreferences();
    await mainPage.getByTestId('tabProjectDenseList').click();
    await expect(mainPage.getByTestId('tabProjectDenseList')).toHaveAttribute('aria-selected', 'true');
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
    await row.getByRole('button', { name: 'Copy path', exact: true }).click();
    await row.getByTestId('btnProjectFolders').click();
    await mainPage.keyboard.press('Escape');
    await row.getByTestId('btnProjectMoreOptions').click();
    await mainPage.keyboard.press('Escape');
    expect(await readLaunches()).toEqual([]);
    const projectPath = await row.getAttribute('data-project-path');
    await row.getByTestId('btnLaunchCompactProject').click();
    await expect.poll(readLaunches).toEqual([projectPath]);
    await mainPage.getByTestId('tabProjectDenseList').click();
    await row.getByTestId('btnProjectFolders').click();
    await mainPage.keyboard.press('Escape');
    await row.getByTestId('btnProjectMoreOptions').click();
    await mainPage.keyboard.press('Escape');
    expect(await readLaunches()).toEqual([projectPath]);
    await row.getByTestId('btnLaunchDenseProject').click();
    await expect.poll(readLaunches).toEqual([projectPath, projectPath]);
    await row.getByRole('button').first().click();
    await expect.poll(readLaunches).toEqual([projectPath, projectPath, projectPath]);
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
    const violations = await mainPage.locator('[data-project-path]').evaluateAll(rows => rows.flatMap(row => {
        const bounds = row.getBoundingClientRect();
        return [...row.querySelectorAll('button')].flatMap(button => {
            // The pinned grip intentionally sits halfway outside the row.
            if (button.dataset.testid === 'btnReorderPinnedProject') return [];
            const rect = button.getBoundingClientRect();
            return rect.left >= bounds.left && rect.right <= bounds.right && rect.width >= 20
                ? []
                : [{ control: button.dataset.testid, name: button.getAttribute('aria-label'), width: rect.width, left: rect.left - bounds.left, right: rect.right - bounds.right }];
        });
    }));
    expect(violations).toEqual([]);
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

test('limits dense editor tooltips to the version and shows a subtle missing-editor panel', async () => {
    test.setTimeout(60000);
    await prepareAppWithStubbedData(mainPage, electronApp, {
        preferences: { ...SAMPLE_PREFS, projects_view_mode: 'dense' },
        projects: [
            { ...SAMPLE_PROJECTS[0], valid: false, invalid_reason: 'missing_editor', codeEditorId: null },
            SAMPLE_PROJECTS[1],
        ],
        installedReleases: [SAMPLE_PROJECTS[1].release],
    });
    await setAppLanguage(mainPage, 'English');
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('inputProjectSearch').fill('');
    const warning = mainPage.getByRole('tooltip', { name: 'Editor not found. Check the editor location.', exact: true });
    const missingVersion = mainPage.locator(`[data-project-path="${SAMPLE_PROJECTS[0].path}"]`).getByTestId('denseProjectEditorVersion');
    for (const theme of ['dark', 'light'] as const) {
        await mainPage.getByTestId('btnSettings').click();
        await mainPage.getByRole('tab', { name: 'Appearance', exact: true }).click();
        await mainPage.getByTestId(theme === 'dark' ? 'themeDark' : 'themeLight').click();
        await mainPage.getByTestId('btnProjects').click();
        for (const width of [1024, 1920]) {
            await mainPage.setViewportSize({ width, height: width === 1024 ? 600 : 900 });
            for (const version of await mainPage.getByTestId('denseProjectEditorVersion').all()) {
                const bounds = (await version.boundingBox())!;
                // Empty space in the aligned editor column must not open help.
                await mainPage.mouse.move(bounds.x + bounds.width + 12, bounds.y + bounds.height / 2);
                await mainPage.waitForTimeout(1100);
                await expect(mainPage.getByRole('tooltip')).toHaveCount(0);
            }
            await missingVersion.hover();
            await mainPage.waitForTimeout(650);
            await expect(warning).toHaveCount(0);
            await expect(warning).toBeVisible();
            await expect(warning.locator('svg')).toBeVisible();
            await expect(missingVersion).toHaveAttribute('aria-describedby', (await warning.getAttribute('id'))!);
            const bounds = (await warning.boundingBox())!;
            expect(bounds.x).toBeGreaterThanOrEqual(0);
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
            await mainPage.screenshot({ path: test.info().outputPath(`dense-editor-warning-${theme}-${width}.png`) });
            await mainPage.mouse.move(0, 0);
            await expect(warning).toHaveCount(0);
        }
    }
});

for (const mode of ['list', 'cards'] as const) {
test(`shows neutral invalid-project and missing-editor tooltips in ${mode} view`, async () => {
    const editorMessage = 'Editor not found. Check the editor location.';
    const projectMessage = 'Project file not found. Check the project location.';
    const projects = [
        { ...SAMPLE_PROJECTS[0], valid: false, invalid_reason: 'missing_editor' as const, codeEditorId: null },
        { ...SAMPLE_PROJECTS[1], valid: false, invalid_reason: 'missing_project_file' as const, codeEditorId: null },
    ];
    await prepareAppWithStubbedData(mainPage, electronApp, {
        preferences: { ...SAMPLE_PREFS, projects_view_mode: mode },
        projects,
        installedReleases: [SAMPLE_PROJECTS[1].release],
    });
    await setAppLanguage(mainPage, 'English');
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('inputProjectSearch').fill('');
    await mainPage.setViewportSize({ width: 1024, height: 700 });
    const missingEditorRow = mainPage.locator(`[data-project-path="${projects[0].path}"]`);
    const invalidProjectRow = mainPage.locator(`[data-project-path="${projects[1].path}"]`);
    const targets = [
        { trigger: mode === 'list'
            ? missingEditorRow.getByTestId('compactProjectEditorVersion')
            : missingEditorRow.getByTestId('projectBadges').getByText(projects[0].version, { exact: true }), message: editorMessage, name: 'editor-version' },
        { trigger: invalidProjectRow.getByRole('img', { name: projectMessage, exact: true }), message: projectMessage, name: 'invalid-project' },
    ];
    if (mode === 'cards') targets.push({ trigger: missingEditorRow.getByRole('img', { name: editorMessage, exact: true }), message: editorMessage, name: 'editor-icon' });
    for (const theme of ['dark', 'light'] as const) {
        await mainPage.getByTestId('btnSettings').click();
        await mainPage.getByRole('tab', { name: 'Appearance', exact: true }).click();
        await mainPage.getByTestId(theme === 'dark' ? 'themeDark' : 'themeLight').click();
        await mainPage.getByTestId('btnProjects').click();
        for (const { trigger, message, name } of targets) {
            const bounds = await trigger.evaluate(element => {
                const box = element.closest('[data-tooltip-trigger]')!.getBoundingClientRect();
                return { right: box.right, y: box.y + box.height / 2 };
            });
            await mainPage.mouse.move(bounds.right + 2, bounds.y);
            await mainPage.waitForTimeout(1100);
            await expect(mainPage.getByRole('tooltip')).toHaveCount(0);
            await mainPage.mouse.move(0, 0);
            await trigger.hover();
            await expect.poll(() => trigger.evaluate(element => element.matches(':hover'))).toBe(true);
            const tooltip = mainPage.getByRole('tooltip', { name: message, exact: true });
            await mainPage.waitForTimeout(650);
            await expect(tooltip).toHaveCount(0);
            await expect(tooltip).toBeVisible();
            await expect(tooltip.locator('svg')).toBeVisible();
            await expect(tooltip).toBeInViewport();
            await mainPage.screenshot({ path: test.info().outputPath(`${mode}-${theme}-${name}.png`) });
            await mainPage.mouse.move(0, 0);
            await expect(tooltip).toHaveCount(0);
        }
    }
});
}

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
            await mainPage.screenshot({ path: `.internal-docs/projects-compact-view/cards-all-badges-${language}-${width}.png` });
        }
    }
});

test('keeps extreme custom version text within the card badge', async () => {
    const version = `4.7.0-custom-${'rendering-preview-with-experimental-optimisations-'.repeat(4)}2026.09`;
    await prepareAppWithStubbedData(mainPage, electronApp, {
        preferences: { ...SAMPLE_PREFS, projects_view_mode: 'cards' },
        projects: [{ ...SAMPLE_PROJECTS[0], version, open_windowed: true, withGit: true }],
    });
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.setViewportSize({ width: 1024, height: 600 });
    const badge = mainPage.getByTestId('projectBadges').locator('.badge').first();
    const versionText = badge.locator('span').last();
    await expect(versionText).toHaveText(version);
    const badgeBounds = await badge.boundingBox();
    const textBounds = await versionText.boundingBox();
    expect(badgeBounds).not.toBeNull();
    expect(textBounds).not.toBeNull();
    expect(textBounds!.y).toBeGreaterThanOrEqual(badgeBounds!.y);
    expect(textBounds!.y + textBounds!.height).toBeLessThanOrEqual(badgeBounds!.y + badgeBounds!.height);
    expect(textBounds!.x + textBounds!.width).toBeLessThanOrEqual(badgeBounds!.x + badgeBounds!.width);
    await versionText.hover();
    await expect(mainPage.getByRole('tooltip').filter({ hasText: version })).toBeVisible();
});

test('keeps selector icons unlabelled visually with delayed hover and keyboard tooltips', async () => {
    await prepareAppWithStubbedData(mainPage, electronApp, {
        preferences: { ...SAMPLE_PREFS, projects_view_mode: 'cards' },
    });
    await setAppLanguage(mainPage, 'English');
    await mainPage.getByTestId('btnProjects').click();
    const search = mainPage.getByTestId('inputProjectSearch');
    for (const [id, label] of [
        ['tabProjectDenseList', 'List view'],
        ['tabProjectList', 'Compact view'],
        ['tabProjectCards', 'Cards view'],
    ]) {
        const tab = mainPage.getByTestId(id);
        await expect(tab).toHaveAccessibleName(label);
        await expect(tab).toHaveText('');
        await search.click();
        await mainPage.mouse.move(0, 0);
        await tab.hover();
        const tooltip = mainPage.getByRole('tooltip', { name: label, exact: true });
        // A 500ms default would show too early; these controls require one second.
        await mainPage.waitForTimeout(650);
        await expect(tooltip).toHaveCount(0);
        await expect(tooltip).toBeVisible();
        await mainPage.mouse.move(0, 0);
        await expect(tooltip).toHaveCount(0);
    }

    // Enter the selector with Tab, then use its actual roving keyboard controls.
    await mainPage.getByTestId('btnProjectCreate').focus();
    await mainPage.keyboard.press('Tab');
    for (const [id, label] of [
        ['tabProjectCards', 'Cards view'],
        ['tabProjectDenseList', 'List view'],
        ['tabProjectList', 'Compact view'],
    ]) {
        const tab = mainPage.getByTestId(id);
        await expect(tab).toBeFocused();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        const tooltip = mainPage.getByRole('tooltip', { name: label, exact: true });
        await mainPage.waitForTimeout(650);
        await expect(tooltip).toHaveCount(0);
        await expect(tooltip).toBeVisible();
        await tab.press('ArrowRight');
        await expect(tooltip).toHaveCount(0);
    }
    await search.focus();
});

test('keeps dense titles, tags and badges together at minimum and wide window widths', async () => {
    const tags = ['Prototype', 'Game Jam', 'Release', '2D', 'Co-op'].map((name, index) => ({ name, colour: index + 4 }));
    const projects = SAMPLE_PROJECTS.map((project, index) => ({
        ...project,
        name: index === 1 ? 'test' : `${project.name} - A deliberately long project title to check single-line truncation`,
        open_windowed: index !== 1,
        withGit: index !== 1,
        valid: index !== 0,
        invalid_reason: index === 0 ? 'missing_project_file' as const : undefined,
        codeEditorId: index === 1 ? 'vscodium' as const : project.codeEditorId,
        release: project.release.source === 'custom' ? { ...project.release, mono: true, prerelease: true } : project.release,
    }));
    projects.push({ ...projects[1], name: 'Minimal project', path: `${projects[1].path}-minimal`, codeEditorId: null });
    await prepareAppWithStubbedData(mainPage, electronApp, {
        preferences: { ...SAMPLE_PREFS, projects_view_mode: 'dense' },
        projects,
        installedReleases: projects.map(project => project.release),
        codeEditorSettings: [SAMPLE_VSCODE_SETTINGS_AVAILABLE, {
            ...SAMPLE_VSCODE_SETTINGS_AVAILABLE,
            integration: { ...SAMPLE_VSCODE_SETTINGS_AVAILABLE.integration, id: 'vscodium', displayName: 'VSCodium' },
            installation: { ...SAMPLE_VSCODE_SETTINGS_AVAILABLE.installation!, integrationId: 'vscodium' },
        }],
    });
    await electronApp.evaluate(({ ipcMain }, projectPath) => {
        ipcMain.removeHandler('projects.refreshProjectGitHubLinks');
        ipcMain.handle('projects.refreshProjectGitHubLinks', () => ({ success: true, data: [{ projectPath, url: 'https://github.com/example/project' }] }));
    }, projects[0].path);
    const tagResults = await mainPage.evaluate(async ({ paths, tags }) => {
        const bridge = (window as unknown as { __di_electron__: { invoke: (channel: string, ...args: unknown[]) => Promise<{ success: boolean }> } }).__di_electron__;
        return Promise.all(paths.map((projectPath, index) => bridge.invoke('projectTags.setProjectTags', projectPath, tags.slice(0, [5, 1, 3][index]))));
    }, { paths: SAMPLE_PROJECTS.map(project => project.path), tags });
    expect(tagResults.every(result => result.success)).toBe(true);
    await mainPage.reload();
    await setAppLanguage(mainPage, 'English');
    await mainPage.getByTestId('btnProjects').click();
    const customVersion = mainPage.locator(`[data-project-path="${projects[2].path}"]`).getByTestId('denseProjectEditorVersion');
    await expect(customVersion.getByRole('img', { name: 'Custom', exact: true })).toBeVisible();
    await expect(customVersion.getByRole('img', { name: 'Using a pre-release Godot editor version', exact: true })).toBeVisible();
    await expect(customVersion).toHaveText('4.7.0-custom.1 (.NET)');
    const busyRow = mainPage.locator(`[data-project-path="${projects[0].path}"]`);
    await expect(busyRow.getByTestId('githubProjectIcon')).toBeVisible();
    await expect(busyRow.getByTestId('gitProjectIcon')).toHaveCount(0);
    await expect(busyRow.getByRole('img', { name: 'Project file not found. Check the project location.', exact: true })).toBeVisible();
    await expect(busyRow.getByTestId('btnLaunchDenseProject')).toBeDisabled();
    await expect(mainPage.locator(`[data-project-path="${projects[2].path}"]`).getByTestId('gitProjectIcon')).toBeVisible();
    await expect(mainPage.getByRole('img', { name: 'Using VSCodium', exact: true })).toBeVisible();
    await expect(busyRow.getByTestId('btnProjectTags')).toHaveText('+2');
    await expect(busyRow.getByTestId('btnProjectTags').getByTestId('projectTagDot')).toHaveCount(3);
    await expect(mainPage.getByTestId('tabProjectDenseList')).toHaveAttribute('aria-selected', 'true');
    for (const theme of ['dark', 'light'] as const) {
        await mainPage.getByTestId('btnSettings').click();
        await mainPage.getByRole('tab', { name: 'Appearance', exact: true }).click();
        await mainPage.getByTestId(theme === 'dark' ? 'themeDark' : 'themeLight').click();
        await mainPage.getByTestId('btnProjects').click();
        for (const width of [1024, 1920]) {
            await mainPage.setViewportSize({ width, height: width === 1024 ? 600 : 900 });
            const rows = mainPage.locator('[data-project-view="dense"]');
            await expect(rows).toHaveCount(4);
            for (const row of await rows.all()) {
                await expect(row).toBeInViewport();
                await expect(row.getByTestId('btnProjectMoreOptions')).toBeVisible();
                await expect(row.getByRole('button', { name: 'Copy path', exact: true })).toHaveCount(0);
            }
            const layout = await rows.evaluateAll(elements => elements.map(row => {
                const bounds = row.getBoundingClientRect();
                const name = row.querySelector('[data-testid="btnLaunchDenseProject"] span') as HTMLElement;
                const version = row.querySelector('[data-testid="denseProjectEditorVersion"]') as HTMLElement;
                const versionText = version.querySelector('[data-testid="denseProjectEditorVersionLabel"]') as HTMLElement;
                const indicators = row.querySelector('[data-testid="denseProjectIndicators"]') as HTMLElement;
                const tags = row.querySelector('[data-testid="btnProjectTags"]') as HTMLElement;
                const more = row.querySelector('[data-testid="btnProjectMoreOptions"]') as HTMLElement;
                const nameBounds = name.getBoundingClientRect();
                const tagBounds = tags.getBoundingClientRect();
                const indicatorBounds = indicators.getBoundingClientRect();
                const versionBounds = version.getBoundingClientRect();
                const actions = [...row.querySelectorAll('button')].filter(button => button.dataset.testid !== 'btnReorderPinnedProject');
                return {
                    project: row.getAttribute('data-project-path'),
                    name: name.textContent,
                    height: bounds.height,
                    overflow: row.scrollWidth - row.clientWidth,
                    nameTruncated: name.scrollWidth > name.clientWidth,
                    nameHeight: name.getBoundingClientRect().height,
                    versionFits: versionText.scrollWidth <= versionText.clientWidth + 1,
                    indicatorsFit: indicators.scrollWidth <= indicators.clientWidth + 1,
                    nameToTagsGap: tagBounds.left - nameBounds.right,
                    tagsToBadgesGap: indicatorBounds.left - tagBounds.right,
                    badgesToVersionGap: versionBounds.left - indicatorBounds.right,
                    controlsAligned: [versionBounds.left, more.getBoundingClientRect().right],
                    controlsFit: actions.every(button => {
                        const box = button.getBoundingClientRect();
                        return box.left >= bounds.left && box.right <= bounds.right + 1 && box.width >= 24;
                    }),
                };
            }));
            await mainPage.screenshot({ path: test.info().outputPath(`dense-${theme}-${width}.png`) });
            expect(layout.every(row => row.height <= 44 && row.height >= 36 && row.overflow <= 1)).toBe(true);
            expect(layout.filter(row => row.nameHeight >= row.height || !row.versionFits || !row.indicatorsFit || !row.controlsFit)).toEqual([]);
            for (const row of layout) {
                expect(row.controlsAligned).toEqual(layout[0].controlsAligned);
                expect(row.nameToTagsGap).toBeGreaterThanOrEqual(0);
                expect(row.nameToTagsGap).toBeLessThanOrEqual(12);
                expect(row.tagsToBadgesGap).toBeGreaterThanOrEqual(12);
                expect(row.tagsToBadgesGap).toBeLessThanOrEqual(20);
                expect(row.badgesToVersionGap).toBeGreaterThanOrEqual(12);
                expect(row.nameTruncated).toBe(width === 1024 && row.name !== 'test' && row.name !== 'Minimal project');
            }
            const versionLabelBounds = (await customVersion.getByTestId('denseProjectEditorVersionLabel').boundingBox())!;
            const prereleaseBounds = (await customVersion.getByRole('img', { name: 'Using a pre-release Godot editor version', exact: true }).boundingBox())!;
            expect(prereleaseBounds.x).toBeGreaterThanOrEqual(versionLabelBounds.x + versionLabelBounds.width);
            const tabs = await mainPage.getByRole('tablist').getByRole('tab').all();
            for (const tab of tabs) {
                const bounds = await tab.boundingBox();
                expect(bounds?.width).toBeGreaterThanOrEqual(24);
                expect(bounds?.height).toBeGreaterThanOrEqual(24);
            }
        }
    }
    // The existing tag filter also narrows the new presentation.
    await mainPage.getByTestId('btnFilterProjectTags').click();
    const filter = mainPage.getByRole('dialog', { name: 'Tags', exact: true });
    await filter.getByRole('combobox').fill('Co-op');
    await filter.getByRole('combobox').press('Enter');
    await expect(mainPage.locator('[data-project-path]')).toHaveCount(1);
    await expect(mainPage.locator('[data-project-path]')).toHaveAttribute('data-project-path', projects[0].path);
    await filter.getByRole('combobox').press('Escape');
});

test('shows complete dense project details after delayed hover and keyboard focus', async () => {
    const projects = SAMPLE_PROJECTS.map((project, index) => ({
        ...project,
        name: `${project.name} - A long project title with every detail available in the tooltip`,
        path: `${project.path}/a-long-folder-name/another-long-folder-name/project`,
        valid: index !== 1,
        invalid_reason: index === 1 ? 'missing_editor' as const : undefined,
    }));
    await prepareAppWithStubbedData(mainPage, electronApp, {
        preferences: { ...SAMPLE_PREFS, projects_view_mode: 'dense' },
        projects,
        installedReleases: projects.filter((_, index) => index !== 1).map(project => project.release),
    });
    await setAppLanguage(mainPage, 'English');
    await mainPage.getByTestId('btnSettings').click();
    await mainPage.getByRole('tab', { name: 'Appearance', exact: true }).click();
    await mainPage.getByTestId('themeDark').click();
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.setViewportSize({ width: 1024, height: 700 });
    const row = (index: number) => mainPage.locator(`[data-project-path="${projects[index].path}"]`);
    const details = (index: number) => mainPage.getByRole('tooltip').filter({ hasText: projects[index].path });
    const firstName = row(0).getByTestId('btnLaunchDenseProject');
    const missingEditorName = row(1).getByTestId('btnLaunchDenseProject');
    await electronApp.evaluate(({ ipcMain }) => {
        const fixture = ipcMain as typeof ipcMain & { compactLaunches: string[] };
        fixture.compactLaunches = [];
        ipcMain.removeHandler('projects.launchProject');
        ipcMain.handle('projects.launchProject', (_, project) => {
            fixture.compactLaunches.push(project.path);
            return { success: true, data: { launched: true } };
        });
    });
    await mainPage.getByTestId('inputProjectSearch').click();
    await firstName.hover();
    await mainPage.waitForTimeout(650);
    await expect(details(0)).toHaveCount(0);
    await missingEditorName.hover();
    await mainPage.waitForTimeout(650);
    await expect(details(0)).toHaveCount(0);
    await expect(details(1)).toHaveCount(0);
    await expect(details(1)).toBeVisible();
    await expect(details(1).getByText(projects[1].name, { exact: true })).toBeVisible();
    await expect(details(1).getByText(projects[1].path, { exact: true })).toBeVisible();
    await expect(details(1)).not.toContainText(projects[1].version);
    await expect(details(1)).toContainText('Opened 3 days ago');
    await expect(details(1).getByRole('button')).toHaveCount(0);
    await expect(row(1).getByTestId('btnLaunchDenseProject')).toBeDisabled();
    await expect(details(1)).toBeInViewport();
    await mainPage.screenshot({ path: test.info().outputPath('dense-project-details.png') });
    await mainPage.mouse.move(0, 0);
    await expect(details(1)).toHaveCount(0);

    // Keyboard users can read details even when launching is disabled.
    await mainPage.keyboard.press('Tab');
    await missingEditorName.focus();
    await mainPage.waitForTimeout(650);
    await expect(details(1)).toHaveCount(0);
    await expect(details(1)).toBeVisible();
    await expect(missingEditorName).toHaveAttribute('aria-describedby', (await details(1).getAttribute('id'))!);
    await missingEditorName.press('Enter');
    expect(await readLaunches()).toEqual([]);
    await mainPage.keyboard.press('Escape');
    await expect(details(1)).toHaveCount(0);
    const unopenedName = row(2).getByTestId('btnLaunchDenseProject');
    await unopenedName.focus();
    await expect(details(2)).toBeVisible();
    await expect(details(2)).toContainText('Not opened yet');
    await expect(unopenedName).toHaveAccessibleName(`Open ${projects[2].name} in Godot`);
    await expect(unopenedName).toHaveAttribute('aria-describedby', (await details(2).getAttribute('id'))!);
    await mainPage.getByTestId('inputProjectSearch').focus();
    await expect(details(2)).toHaveCount(0);
});

test('copies the exact project path from Folders with feedback, retry and focus return', async () => {
    const project = { ...SAMPLE_PROJECTS[0], name: 'A very long project name that should be truncated inside the More menu heading without overflowing its boundaries', path: `${SAMPLE_PROJECTS[0].path}/a folder with spaces` };
    await prepareAppWithStubbedData(mainPage, electronApp, {
        preferences: { ...SAMPLE_PREFS, projects_view_mode: 'dense' },
        projects: [project],
    });
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.evaluate(() => {
        const clipboardState = { values: [] as string[], reject: false };
        const fixture = window as unknown as { clipboardState: typeof clipboardState };
        fixture.clipboardState = clipboardState;
        Object.defineProperty(navigator.clipboard, 'writeText', {
            configurable: true,
            value: async (value: string) => {
                if (clipboardState.reject) throw new Error('Fixture clipboard failure');
                clipboardState.values.push(value);
            },
        });
    });
    try {
        await mainPage.getByTestId('btnProjectMoreOptions').click();
        const moreMenu = mainPage.getByRole('dialog', { name: project.name, exact: true });
        await expect(moreMenu.getByTestId('btnCopyProjectPathMenu')).toHaveCount(0);
        const heading = moreMenu.locator('.menu-title > span');
        await expect(heading).toHaveText(project.name);
        expect(await heading.evaluate(element => ({
            clipped: element.scrollWidth > element.clientWidth,
            ellipsis: getComputedStyle(element).textOverflow,
        }))).toEqual({ clipped: true, ellipsis: 'ellipsis' });
        await mainPage.keyboard.press('Escape');
        const more = mainPage.getByTestId('btnProjectFolders');
        const menu = mainPage.getByRole('dialog', { name: 'Open project folders', exact: true });
        await more.focus();
        await more.press('Enter');
        const copy = menu.getByTestId('btnCopyProjectPathMenu');
        await expect(copy).toBeFocused();
        await copy.press('Enter');
        await expect(copy).toHaveText('Success');
        await expect(menu).toBeVisible();
        expect(await mainPage.evaluate(() => (window as unknown as { clipboardState: { values: string[] } }).clipboardState.values)).toEqual([project.path]);
        await mainPage.keyboard.press('Escape');
        await expect(menu).toHaveCount(0);
        await expect(more).toBeFocused();

        await mainPage.evaluate(() => { (window as unknown as { clipboardState: { reject: boolean } }).clipboardState.reject = true; });
        await more.press('Enter');
        await expect(copy).toHaveText('Copy project path');
        await copy.press('Enter');
        await expect(copy).toHaveText('Error');
        await expect(menu).toBeVisible();
        await mainPage.evaluate(() => { (window as unknown as { clipboardState: { reject: boolean } }).clipboardState.reject = false; });
        await copy.press('Enter');
        await expect(copy).toHaveText('Success');
        await mainPage.keyboard.press('Escape');
        await expect(more).toBeFocused();
        for (const tab of ['tabProjectList', 'tabProjectCards']) {
            await mainPage.getByTestId(tab).click();
            await expect(mainPage.locator('[data-project-path]').getByRole('button', { name: 'Copy path', exact: true })).toBeVisible();
        }
    } finally {
        await mainPage.evaluate(() => { delete (navigator.clipboard as unknown as { writeText?: unknown }).writeText; });
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
    const launchEnv: Record<string, string> = {
        ...Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
            ),
        ),
        APPDATA: path.join(homeDir, 'AppData', 'Roaming'),
        HOME: homeDir,
        LOCALAPPDATA: path.join(homeDir, 'AppData', 'Local'),
        USERPROFILE: homeDir,
        XDG_CACHE_HOME: path.join(homeDir, '.cache'),
        XDG_CONFIG_HOME: path.join(homeDir, '.config'),
        XDG_DATA_HOME: path.join(homeDir, '.local', 'share'),
        XDG_STATE_HOME: path.join(homeDir, '.local', 'state'),
        GODOT_LAUNCHER_E2E_FIXTURES: '1',
        GODOT_LAUNCHER_E2E_HOME_DIR: homeDir,
    };
    delete launchEnv.ELECTRON_RUN_AS_NODE;
    return launchEnv;
}
