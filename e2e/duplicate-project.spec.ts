import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { createFixtureHome, prepareAppWithStubbedData, setAppLanguage, stubCreateProjectPublicationTargets, stubCreateProjectRepositoryNameAvailability, stubGlobalGitIdentity } from './support/e2e-fixture-runtime';
import { getMainWindow } from './splashscreen/getMainWindow';

let application: ElectronApplication;
let page: Page;
let home: string;

test.beforeAll(async () => {
    home = await createFixtureHome();
    const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    delete environment.ELECTRON_RUN_AS_NODE;
    application = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env: { ...environment, HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData', 'Roaming'), XDG_DATA_HOME: path.join(home, '.local', 'share'), XDG_CONFIG_HOME: path.join(home, '.config'), GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home } });
    page = await getMainWindow(application);
    await setAppLanguage(page, 'English');
});

test.afterAll(async () => {
    await application?.close();
    await fs.rm(home, { recursive: true, force: true });
});

test('uses two steps, retains choices on Back and submits only from More options', async () => {
    const source = { ...SAMPLE_PROJECTS[1], renderer: 'COMPATIBLE', codeEditorId: null };
    await prepareAppWithStubbedData(page, application, { projects: [source] });
    await stubCreateProjectPublicationTargets(application, { success: true, targets: [{ providerId: 'github', connectionId: '4d542f86-89c7-4a7c-89cf-835ce17022af', accessTargetId: 'de178a20-320a-471f-8c8c-94061ac13de1', ownerLogin: 'example-owner', ownerType: 'user', accountLogin: 'example-owner' }] });
    await stubCreateProjectRepositoryNameAvailability(application, { status: 'available' });
    await application.evaluate(({ ipcMain }) => {
        const state = globalThis as typeof globalThis & { duplicateCalls?: unknown[][] };
        state.duplicateCalls = [];
        for (const channel of ['projects.inspectCreateProjectDestination', 'projects.inspectCreateProjectRepository']) ipcMain.removeHandler(channel);
        ipcMain.handle('projects.inspectCreateProjectDestination', async () => ({ success: true, data: { status: 'available' } }));
        ipcMain.handle('projects.inspectCreateProjectRepository', async () => ({ success: true, data: { status: 'not-a-repository' } }));
        ipcMain.removeHandler('projects.createProject');
        ipcMain.handle('projects.createProject', async (_event, ...args) => {
            state.duplicateCalls?.push(args);
            return { success: true, data: { success: false, error: 'Copy request captured.' } };
        });
    });
    await page.getByTestId('btnProjects').click();
    await page.setViewportSize({ width: 1440, height: 1024 });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    for (const view of ['tabProjectCards', 'tabProjectList']) {
        await page.getByTestId(view).click();
        await page.getByTestId('btnProjectMoreOptions').first().click();
        await expect(page.getByRole('button', { name: 'Duplicate', exact: true })).toBeVisible();
        if (view === 'tabProjectCards') await page.screenshot({ path: test.info().outputPath('duplicate-more-menu-divider.png') });
        await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
        const drawer = page.getByRole('dialog', { name: 'Duplicate Project', exact: true });
        await expect(drawer).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Project copy', exact: true })).toBeVisible();
        await expect(page.getByText('Next: code editor, Git and GitHub.', { exact: true })).toHaveCount(0);
        await expect(page.getByTestId('inputProjectName')).toHaveValue(`${source.name} Copy`);
        await expect(page.getByTestId('duplicateEditorSummary')).toContainText(source.release.version);
        await expect(page.getByTestId('duplicateEditorSummary')).toContainText('Compatible');
        await expect(page.getByTestId('selectCreateProjectGodotEditor')).toHaveCount(0);
        await expect(page.getByTestId('selectCreateProjectRenderer')).toHaveCount(0);
        await expect(page.getByRole('checkbox', { name: 'Godot editor preferences', exact: true })).toBeChecked();
        await expect(page.getByRole('checkbox', { name: 'Game save data', exact: true })).not.toBeChecked();
        await expect(page.getByRole('checkbox', { name: 'Create a new Git repository', exact: true })).toHaveCount(0);
        await expect(page.getByTestId('btnCreateProject')).toHaveCount(0);
        await expect(page.getByRole('checkbox', { name: 'Open in Godot', exact: true })).toHaveCount(0);
        await expect(page.getByTestId('btnContinueDuplicate')).toBeEnabled();
        await page.getByRole('checkbox', { name: 'Game save data', exact: true }).focus();
        await page.keyboard.press('Tab');
        await expect(page.getByRole('button', { name: 'Copy saved progress and player settings. Leave off to start fresh.', exact: true })).toBeFocused();
        await expect(page.getByRole('tooltip')).toContainText('saved progress');
        await page.getByTestId('inputProjectName').focus();
        if (view === 'tabProjectCards') {
            await page.getByTestId('inputProjectName').fill('Independent Copy');
            await page.getByTestId('inputProjectPath').fill('/Users/docs/Godot/Copies');
            await page.getByRole('checkbox', { name: 'Godot editor preferences', exact: true }).uncheck();
            await page.getByRole('checkbox', { name: 'Game save data', exact: true }).check();
        } else {
            await page.screenshot({ path: test.info().outputPath('duplicate-two-step-project-copy.png') });
        }
        await expect(page.getByTestId('btnContinueDuplicate')).toBeEnabled();
        await page.getByTestId('btnContinueDuplicate').click();
        await expect(page.getByRole('heading', { name: 'More options', exact: true })).toBeFocused();
        await expect(page.getByTestId('inputProjectName')).toHaveCount(0);
        expect(await application.evaluate(() => (globalThis as typeof globalThis & { duplicateCalls?: unknown[][] }).duplicateCalls?.length)).toBe(view === 'tabProjectCards' ? 0 : 1);
        if (view === 'tabProjectCards') {
            await page.getByRole('checkbox', { name: 'Create a new Git repository', exact: true }).uncheck();
            await page.getByRole('checkbox', { name: 'Open in Godot', exact: true }).uncheck();
            await page.getByRole('button', { name: 'Back', exact: true }).click();
            await expect(page.getByRole('heading', { name: 'Project copy', exact: true })).toBeFocused();
            await expect(page.getByTestId('inputProjectName')).toHaveValue('Independent Copy');
            await expect(page.getByTestId('inputProjectPath')).toHaveValue('/Users/docs/Godot/Copies');
            await expect(page.getByRole('checkbox', { name: 'Godot editor preferences', exact: true })).not.toBeChecked();
            await expect(page.getByRole('checkbox', { name: 'Game save data', exact: true })).toBeChecked();
            await page.getByTestId('btnContinueDuplicate').click();
            await expect(page.getByRole('checkbox', { name: 'Create a new Git repository', exact: true })).not.toBeChecked();
            await expect(page.getByRole('checkbox', { name: 'Open in Godot', exact: true })).not.toBeChecked();
            await page.getByTestId('btnCreateProject').click();
            await expect(page.getByRole('dialog', { name: 'Error', exact: true })).toContainText('Copy request captured.');
            await page.getByRole('button', { name: 'Ok', exact: true }).click();
            const calls = await application.evaluate(() => (globalThis as typeof globalThis & { duplicateCalls?: unknown[][] }).duplicateCalls ?? []);
            expect(calls).toHaveLength(1);
            expect(calls[0][0]).toBe('Independent Copy');
            expect(calls[0][1]).toMatchObject({ version: source.release.version, mono: source.release.mono });
            expect(calls[0][2]).toBe('COMPATIBLE');
            expect(calls[0][9]).toEqual({ projectPath: source.path, copyEditorSettings: false, copySaveData: true, jobId: expect.any(String) });
        } else {
            const publish = page.getByRole('checkbox', { name: 'Publish to a private GitHub repository', exact: true });
            await expect(publish).not.toBeChecked();
            await expect(page.getByTestId('createProjectGitHubRepositoryName')).toHaveCount(0);
            await publish.check();
            await expect(page.getByTestId('createProjectGitHubRepositoryName')).toBeVisible();
            await page.getByTestId('createProjectGitHubRepositoryName').fill('independent-private-copy');
            await page.getByRole('button', { name: 'Back', exact: true }).click();
            await page.getByTestId('btnContinueDuplicate').click();
            await expect(publish).toBeChecked();
            await expect(page.getByTestId('createProjectGitHubRepositoryName')).toHaveValue('independent-private-copy');
            await expect(page.getByTestId('btnCreateProject')).toBeEnabled();
            await page.screenshot({ path: test.info().outputPath('duplicate-two-step-more-options.png') });
            await page.setViewportSize({ width: 1024, height: 700 });
            await expect(page.getByTestId('btnCreateProject')).toBeInViewport();
            await page.getByTestId('createProjectGitHubRepositoryName').scrollIntoViewIfNeeded();
            await page.screenshot({ path: test.info().outputPath('duplicate-two-step-compact.png') });
            await page.setViewportSize({ width: 1440, height: 1024 });
        }
        await page.getByTestId('btnCloseCreateProject').click();
        await expect(drawer).not.toBeVisible();
    }
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'New Project', exact: true })).toBeVisible();
    await expect(page.getByTestId('inputProjectName')).toHaveValue('');
    await expect(page.getByTestId('selectCreateProjectGodotEditor')).toBeVisible();
    await expect(page.getByTestId('selectCreateProjectRenderer')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Godot editor preferences', exact: true })).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: 'Edit now', exact: true })).toBeChecked();
    await page.getByTestId('btnCloseCreateProject').click();
});

test('installs only the missing source editor before copying with the source renderer', async () => {
    const source = { ...SAMPLE_PROJECTS[1], renderer: 'MOBILE', release: { ...SAMPLE_PROJECTS[1].release, version: '4.7.1-stable', version_number: 4.7, source: 'official' as const, mono: true, valid: false } };
    const catalogue = { version: source.release.version, version_number: 4.7, name: source.release.version, published_at: null, draft: false, prerelease: false, assets: [{ name: 'godot-dotnet.zip', download_url: 'https://example.com/godot-dotnet.zip', platform_tags: ['macos', 'arm64'], mono: true }] };
    await prepareAppWithStubbedData(page, application, { projects: [source], installedReleases: [], availableReleases: [catalogue], availablePrereleases: [] });
    await application.evaluate(({ ipcMain }, injectedSource) => {
        const state = globalThis as typeof globalThis & { fixedEditorInstall?: unknown[]; fixedEditorCopy?: unknown[] };
        for (const channel of ['projects.inspectCreateProjectDestination', 'projects.inspectCreateProjectRepository', 'editorInstalls.installEditor', 'projects.createProject']) ipcMain.removeHandler(channel);
        ipcMain.handle('projects.inspectCreateProjectDestination', async () => ({ success: true, data: { status: 'available' } }));
        ipcMain.handle('projects.inspectCreateProjectRepository', async () => ({ success: true, data: { status: 'not-a-repository' } }));
        ipcMain.handle('editorInstalls.installEditor', async (_event, release, mono, origin) => {
            state.fixedEditorInstall = [release.version, mono, origin];
            return { success: true, data: { success: true, version: release.version, release: { ...injectedSource.release, valid: true } } };
        });
        ipcMain.handle('projects.createProject', async (_event, ...args) => {
            state.fixedEditorCopy = args;
            return { success: true, data: { success: false, error: 'Matching editor request captured.' } };
        });
    }, source);
    await page.getByTestId('btnProjectMoreOptions').first().click();
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect(page.getByTestId('duplicateEditorSummary')).toContainText('4.7.1-stable');
    await expect(page.getByText('The matching Godot editor will be installed before duplication.', { exact: true })).toBeVisible();
    await expect(page.getByTestId('selectCreateProjectGodotEditor')).toHaveCount(0);
    await page.getByTestId('btnContinueDuplicate').click();
    const beforeInstall = await application.evaluate(() => { const state = globalThis as typeof globalThis & { fixedEditorInstall?: unknown[]; fixedEditorCopy?: unknown[] }; return { fixedEditorInstall: state.fixedEditorInstall, fixedEditorCopy: state.fixedEditorCopy }; });
    expect(beforeInstall.fixedEditorInstall).toBeUndefined();
    expect(beforeInstall.fixedEditorCopy).toBeUndefined();
    await page.getByRole('checkbox', { name: 'Create a new Git repository', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: 'Open in Godot', exact: true }).uncheck();
    await expect(page.getByTestId('btnCreateProject')).toHaveText('Install and duplicate');
    await page.getByTestId('btnCreateProject').click();
    await expect(page.getByRole('dialog', { name: 'Error', exact: true })).toContainText('Matching editor request captured.');
    await page.getByRole('button', { name: 'Ok', exact: true }).click();
    const captured = await application.evaluate(() => {
        const state = globalThis as typeof globalThis & { fixedEditorInstall?: unknown[]; fixedEditorCopy?: unknown[] };
        return { install: state.fixedEditorInstall, copy: state.fixedEditorCopy };
    });
    expect(captured.install).toEqual([source.release.version, true, 'project']);
    expect(captured.copy?.[1]).toMatchObject({ version: source.release.version, mono: true });
    expect(captured.copy?.[2]).toBe('MOBILE');
    await page.getByTestId('btnCloseCreateProject').click();
});

test('blocks duplication when the exact source editor is unavailable', async () => {
    const source = { ...SAMPLE_PROJECTS[1], release: { ...SAMPLE_PROJECTS[1].release, version: 'custom-missing', source: 'custom' as const, valid: false } };
    await prepareAppWithStubbedData(page, application, { projects: [source], installedReleases: [] });
    await page.getByTestId('btnProjectMoreOptions').first().click();
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect(page.getByText('The matching Godot editor is unavailable. Install or register it in Installs to continue.', { exact: true })).toBeVisible();
    await page.getByTestId('btnContinueDuplicate').click();
    await expect(page.getByTestId('btnCreateProject')).toBeDisabled();
    await expect(page.getByTestId('selectCreateProjectGodotEditor')).toHaveCount(0);
    await page.getByTestId('btnCloseCreateProject').click();
});

test('validates name and destination again on Continue without downstream work', async () => {
    const source = SAMPLE_PROJECTS[1];
    await prepareAppWithStubbedData(page, application, { projects: [source] });
    await application.evaluate(({ ipcMain }) => {
        const state = globalThis as typeof globalThis & { blockNextDestination?: boolean; downstreamCalls?: number };
        state.blockNextDestination = false;
        state.downstreamCalls = 0;
        ipcMain.removeHandler('projects.inspectCreateProjectDestination');
        ipcMain.handle('projects.inspectCreateProjectDestination', async (_event, name: string) => ({ success: true, data: name === 'Occupied' || state.blockNextDestination ? { status: 'blocked', error: 'Destination changed or occupied' } : { status: 'available' } }));
        for (const channel of ['projects.inspectCreateProjectRepository', 'projects.createProject', 'editorInstalls.installEditor', 'projects.retryCreateProjectPublication']) {
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, async () => { state.downstreamCalls = (state.downstreamCalls ?? 0) + 1; throw new Error('Continue must not start downstream work'); });
        }
    });
    await page.getByTestId('btnProjectMoreOptions').first().click();
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    const next = page.getByTestId('btnContinueDuplicate');
    const name = page.getByTestId('inputProjectName');
    await name.fill(source.name);
    await expect(next).toBeDisabled();
    await expect(page.getByLabel('A project with this name already exists')).toBeVisible();
    await name.fill('');
    await expect(next).toBeDisabled();
    await name.fill('Occupied');
    await expect(page.getByTestId('createProjectDestinationStatus')).toContainText('Destination changed or occupied');
    await expect(next).toBeDisabled();
    await name.fill('Available Copy');
    await expect(next).toBeEnabled();
    await application.evaluate(() => { (globalThis as typeof globalThis & { blockNextDestination?: boolean }).blockNextDestination = true; });
    await next.click();
    await expect(page.getByRole('heading', { name: 'Project copy', exact: true })).toBeVisible();
    await expect(page.getByTestId('createProjectDestinationStatus')).toContainText('Destination changed or occupied');
    await application.evaluate(() => { (globalThis as typeof globalThis & { blockNextDestination?: boolean }).blockNextDestination = false; });
    await name.fill('Final check copy');
    await expect(next).toBeEnabled();
    await next.click();
    await expect(page.getByRole('heading', { name: 'More options', exact: true })).toBeFocused();
    await page.getByRole('checkbox', { name: 'Create a new Git repository', exact: true }).uncheck();
    await application.evaluate(() => { (globalThis as typeof globalThis & { blockNextDestination?: boolean }).blockNextDestination = true; });
    await page.getByTestId('btnCreateProject').click();
    await expect(page.getByRole('heading', { name: 'Project copy', exact: true })).toBeFocused();
    await expect(page.getByTestId('createProjectDestinationStatus')).toContainText('Destination changed or occupied');
    expect(await application.evaluate(() => (globalThis as typeof globalThis & { downstreamCalls?: number }).downstreamCalls)).toBe(0);
    await page.getByTestId('btnCloseCreateProject').click();
});

test('matches the Create drawer control sizing in both duplicate steps', async () => {
    const source = SAMPLE_PROJECTS[1];
    await prepareAppWithStubbedData(page, application, { projects: [source] });
    await application.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('projects.inspectCreateProjectDestination');
        ipcMain.handle('projects.inspectCreateProjectDestination', async () => ({ success: true, data: { status: 'available' } }));
    });
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await page.getByRole('button', { name: 'New Project', exact: true }).click();
    await expect.poll(() => page.getByRole('dialog', { name: 'New Project', exact: true }).evaluate((element) => Math.round(element.getBoundingClientRect().right) - window.innerWidth)).toBe(0);
    /** Measures the visible control and its text presentation.
     * @param testId - Stable input or button identifier in the active drawer.
     * @param joined - Whether the input's parent carries the visible path border.
     */
    const measure = async (testId: string, joined = false) => page.getByTestId(testId).evaluate((element, measureParent) => {
        const control = measureParent ? element.parentElement : element;
        if (!control) throw new Error('Missing path control container');
        return { height: control.getBoundingClientRect().height, fontSize: getComputedStyle(element).fontSize, borderRadius: getComputedStyle(control).borderRadius };
    }, joined);
    const create = {
        name: await measure('inputProjectName'),
        folder: await measure('inputProjectPath', true),
        browse: await measure('btnSelectProjectFolder'),
        codeEditor: await measure('selectCreateProjectCodeEditor'),
        action: await measure('btnCreateProject'),
    };
    await page.screenshot({ path: test.info().outputPath('duplicate-create-style-baseline.png') });
    await page.getByTestId('btnCloseCreateProject').click();
    await page.getByTestId('btnProjectMoreOptions').first().click();
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await expect.poll(() => page.getByRole('dialog', { name: 'Duplicate Project', exact: true }).evaluate((element) => Math.round(element.getBoundingClientRect().right) - window.innerWidth)).toBe(0);
    const duplicate = {
        name: await measure('inputProjectName'),
        folder: await measure('inputProjectPath', true),
        browse: await measure('btnSelectProjectFolder'),
        action: await measure('btnContinueDuplicate'),
    };
    await page.screenshot({ path: test.info().outputPath('duplicate-duplicate-style-step-1.png') });
    await page.getByTestId('btnContinueDuplicate').click();
    const options = {
        codeEditor: await measure('selectCreateProjectCodeEditor'),
        action: await measure('btnCreateProject'),
    };
    await page.screenshot({ path: test.info().outputPath('duplicate-duplicate-style-step-2.png') });
    expect(duplicate).toEqual({ name: create.name, folder: create.folder, browse: create.browse, action: create.action });
    expect(options).toEqual({ codeEditor: create.codeEditor, action: create.action });
    await page.getByTestId('btnCloseCreateProject').click();
});

for (const { publish, parentRepository } of [{ publish: true, parentRepository: false }, { publish: false, parentRepository: false }, { publish: true, parentRepository: true }]) {
    test(`retains copied files through real progress events with Git/publication ${publish}, parent consent ${parentRepository}`, async () => {
        const source = { ...SAMPLE_PROJECTS[1], codeEditorId: null };
        const effectivePublication = publish && !parentRepository;
        await prepareAppWithStubbedData(page, application, { projects: [source] });
        await stubGlobalGitIdentity(application, { name: 'Fixture User', email: 'fixture@example.com' });
        await stubCreateProjectPublicationTargets(application, { success: true, targets: [{ providerId: 'github', connectionId: '4d542f86-89c7-4a7c-89cf-835ce17022af', accessTargetId: 'de178a20-320a-471f-8c8c-94061ac13de1', ownerLogin: 'fixture-owner', ownerType: 'user', accountLogin: 'fixture-owner' }] });
        await stubCreateProjectRepositoryNameAvailability(application, { status: 'available' });
        await application.evaluate(({ ipcMain }, injected) => {
            const state = globalThis as typeof globalThis & { progressJobId?: string; finishDuplicateProgress?: () => void; finishDuplicateLaunch?: () => void };
            for (const channel of ['projects.inspectCreateProjectDestination', 'projects.inspectCreateProjectRepository', 'projects.createProject', 'projects.launchProject']) ipcMain.removeHandler(channel);
            ipcMain.handle('projects.inspectCreateProjectDestination', async () => ({ success: true, data: { status: 'available' } }));
            ipcMain.handle('projects.inspectCreateProjectRepository', async () => ({ success: true, data: injected.parentRepository ? { status: 'inside-work-tree', root: '/Users/docs/Godot/Parent', isProjectRoot: false, kind: 'standard' } : { status: 'not-a-repository' } }));
            ipcMain.handle('projects.createProject', async (_event, ...args) => {
                state.progressJobId = args[9].jobId;
                if (injected.parentRepository && (args[7] !== undefined || args[8]?.root !== '/Users/docs/Godot/Parent')) throw new Error('Parent consent must skip publication');
                return await new Promise((resolve) => {
                    state.finishDuplicateProgress = () => resolve({ success: true, data: { success: true, projectDetails: { ...injected.source, name: 'Progress Copy', path: '/Users/docs/Godot/Projects/Progress-Copy' }, ...(injected.publish && !injected.parentRepository ? { publication: { status: 'published', repository: { owner: 'fixture-owner', name: 'progress-copy', webUrl: 'https://github.com/fixture-owner/progress-copy' } } } : {}), ...(injected.parentRepository ? { gitSetup: { status: 'existing-repository', root: '/Users/docs/Godot/Parent', isProjectRoot: false, kind: 'standard' } } : {}) } });
                });
            });
            ipcMain.handle('projects.launchProject', async () => await new Promise((resolve) => {
                state.finishDuplicateLaunch = () => resolve({ success: true, data: { launched: true, project: injected.source } });
            }));
        }, { source, publish, parentRepository });
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.getByTestId('btnProjects').click();
        await page.getByTestId('btnProjectMoreOptions').first().click();
        await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
        await page.getByTestId('inputProjectName').fill('Progress Copy');
        await page.getByTestId('btnContinueDuplicate').click();
        await page.getByRole('checkbox', { name: 'Create a new Git repository', exact: true }).setChecked(publish);
        if (publish) await page.getByRole('checkbox', { name: 'Publish to a private GitHub repository', exact: true }).check();
        await expect(page.getByTestId('btnCreateProject')).toBeEnabled();
        await page.getByTestId('btnCreateProject').click();
        if (parentRepository) await page.getByRole('dialog', { name: 'This project will be inside another Git repository' }).getByRole('button', { name: 'Continue', exact: true }).click();
        const overlay = page.getByTestId('createProjectProgressOverlay');
        await expect(overlay).toBeVisible();
        await expect(overlay.locator('[data-step="creating"]')).toHaveAttribute('data-step-state', 'active');
        await expect.poll(() => application.evaluate(() => (globalThis as typeof globalThis & { progressJobId?: string }).progressJobId)).toBeTruthy();
        await emitDuplicateProgress('copying', 7);
        await expect(overlay).toContainText('7 files copied');
        await expect(overlay.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
        if (effectivePublication) {
            await emitDuplicateProgress('git', 7);
            await expect(overlay.locator('[data-step="git"]')).toHaveAttribute('data-step-state', 'active');
            await expect(overlay.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
        } else {
            await expect(overlay.locator('[data-step="git"]')).toHaveCount(0);
            await expect(overlay.locator('[data-step="publishing"]')).toHaveCount(0);
        }
        await emitDuplicateProgress('configuring', 7);
        await expect(overlay.locator('[data-step="configuring"]')).toHaveAttribute('data-step-state', 'active');
        if (effectivePublication) {
            await emitDuplicateProgress('publishing');
            await expect(overlay.locator('[data-step="publishing"]')).toHaveAttribute('data-step-state', 'active');
            for (const theme of ['dark', 'light']) {
                await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
                await page.screenshot({ path: test.info().outputPath(`duplicate-progress-${theme}.png`) });
            }
        }
        await expect(overlay).toContainText('7 files copied');
        await expect(overlay).not.toContainText('0 files copied');
        await application.evaluate(() => (globalThis as typeof globalThis & { finishDuplicateProgress?: () => void }).finishDuplicateProgress?.());
        if (parentRepository) {
            const completion = page.getByRole('dialog', { name: 'Project created', exact: true });
            await expect(completion).toBeVisible();
            await completion.getByRole('button', { name: 'Done', exact: true }).click();
            return;
        }
        await expect(overlay.locator('[data-step="launching"]')).toHaveAttribute('data-step-state', 'active');
        await expect(overlay).toContainText('7 files copied');
        if (effectivePublication) {
            await expect(overlay.locator('[data-step="git"]')).toHaveAttribute('data-step-state', 'complete');
            await expect(overlay.locator('[data-step="publishing"]')).toHaveAttribute('data-step-state', 'complete');
        }
        await application.evaluate(() => (globalThis as typeof globalThis & { finishDuplicateLaunch?: () => void }).finishDuplicateLaunch?.());
        await expect(page.getByRole('dialog', { name: 'Duplicate Project', exact: true })).not.toBeVisible();
    });
}

/** Emits the active duplication job's progress through Electron's preload event bridge.
 * @param stage - Backend operation now running.
 * @param files - New copied total, omitted during publication to retain it.
 */
async function emitDuplicateProgress(stage: 'copying' | 'git' | 'configuring' | 'publishing', files?: number): Promise<void> {
    await application.evaluate(({ BrowserWindow }, payload) => {
        const jobId = (globalThis as typeof globalThis & { progressJobId?: string }).progressJobId;
        for (const window of BrowserWindow.getAllWindows()) window.webContents.send('project-copy-progress', { jobId, ...payload, canCancel: payload.stage === 'copying' });
    }, { stage, ...(files !== undefined ? { files } : {}) });
}
