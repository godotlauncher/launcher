import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Locator, type Page, test } from './support/electron.fixture';
import { getMainWindow } from './splashscreen/getMainWindow';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { createFixtureHome, prepareAppWithStubbedData, setAppLanguage, stubGitIdentitySettings } from './support/e2e-fixture-runtime';

let app: ElectronApplication;
let page: Page;
let home: string;
let files: string[];
test.setTimeout(60_000);

test.beforeEach(async () => {
    home = await createFixtureHome();
    files = [0, 1, 2].map(index => path.join(home, 'imports', `game-${index}`, 'project.godot'));
    for (const file of files) {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, 'config_version=5\n[application]\nconfig/name="Import"\n');
    }
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env: { ...env, GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home } });
    page = await getMainWindow(app);
    await setAppLanguage(page, 'English');
    await prepareAppWithStubbedData(page, app);
    await stubGitIdentitySettings(app, { globalIdentity: { name: 'Fixture', email: 'fixture@example.com' }, projectPreset: null });
    // Registration responses use known fixture records; tag handlers and storage remain real.
    await app.evaluate(({ ipcMain }, injected) => {
        const state = globalThis as typeof globalThis & { entryRegistrations: number; entryFailTags: boolean; entryTagWrites: number; entryStale?: boolean; entryHoldTags?: boolean; entryReleaseTags?: () => void };
        state.entryRegistrations = 0;
        state.entryFailTags = false;
        state.entryTagWrites = 0;
        const handlers = (ipcMain as typeof ipcMain & { _invokeHandlers: Map<string, (...args: unknown[]) => unknown> })._invokeHandlers;
        const originalTags = handlers.get('projectTags.setProjectTags')!;
        ipcMain.removeHandler('projectTags.setProjectTags');
        ipcMain.handle('projectTags.setProjectTags', async (...args) => {
            state.entryTagWrites++;
            if (state.entryFailTags) return { success: false, error: { type: 'Error', message: 'write-failed' } };
            if (state.entryHoldTags) await new Promise<void>(resolve => { state.entryReleaseTags = resolve; });
            return originalTags(...args);
        });
        const discovered = injected.files.map((file, index) => ({ projectFilePath: file, name: `Imported ${index}`, relativePath: `game-${index}/project.godot`, detectedEditor: null }));
        const result = (data: unknown) => ({ success: true, data });
        const replacements: Record<string, (...args: any[]) => unknown> = {
            'app.openFileDialog': () => result({ canceled: false, filePaths: [injected.files[0]] }),
            'projects.scanProjectFolder': () => result({ scanId: 'scan', status: 'completed', projects: discovered, issues: [], omittedIssueCount: 0 }),
            'projects.inspectProjectImports': (_event, paths: string[]) => result(paths.map(file => ({ projectFilePath: file, name: `Imported ${injected.files.indexOf(file)}`, registered: false, editor: injected.projects[0].release }))),
            'projects.addProject': (_event, file: string) => {
                state.entryRegistrations++;
                if (state.entryStale) { state.entryStale = false; return result({ success: false, importConflict: 'name' }); }
                const index = injected.files.indexOf(file);
                return result(index === 2 ? { success: false, error: 'Registration failed' } : { success: true, newProject: injected.projects[index], projects: injected.projects });
            },
            'projects.inspectCreateProjectDestination': () => result({ status: 'available' }),
            'projects.inspectCreateProjectRepository': () => result({ status: 'not-a-repository' }),
            'projects.createProject': (_event, ...args) => { state.entryRegistrations++; return result({ success: true, projectDetails: injected.projects[args[9] ? 1 : 0] }); },
            'projects.inspectPublicGitSource': () => result({ ok: true, canonicalUrl: 'https://example.com/game.git', suggestedDirectoryName: 'game' }),
            'projects.listConnectedRepositories': () => result({ ok: true, page: { repositories: [{ repositoryRef: 'fixture-repo', providerId: 'github', owner: 'fixture', name: 'entry-tags-game', visibility: 'private', alreadyImported: false }], nextCursor: null } }),
            'projects.importRemoteProject': () => result({ ok: true, jobId: 'entry-tags-clone', repositoryPath: injected.home, projects: discovered, hasSubmodules: false }),
            'projects.resolveRemoteProjectClone': () => result({ jobId: 'entry-tags-clone', status: 'kept' }),
        };
        for (const [channel, handler] of Object.entries(replacements)) { ipcMain.removeHandler(channel); ipcMain.handle(channel, handler); }
    }, { files, home, projects: SAMPLE_PROJECTS });
    await page.getByTestId('btnProjects').click();
});

test.afterEach(async () => { await app?.close(); if (home) await fs.rm(home, { recursive: true, force: true }); });

/** Stages a new tag through the real shared picker.
 * @param field - Field belonging to the intended project.
 * @param name - New tag name.
 */
async function chooseTag(field: Locator, name: string) {
    await field.click();
    const picker = page.getByRole('dialog', { name: 'Tags', exact: true });
    const input = picker.getByRole('combobox', { name: 'Tags', exact: true });
    await input.fill(name);
    await input.press('Enter');
    await expect(picker.getByRole('button', { name: `Remove ${name}`, exact: true })).toBeVisible();
    await input.press('Escape');
    await expect(field.getByTestId('projectTagDot').first()).toBeVisible();
    await expect(field).toHaveAccessibleName(new RegExp(name));
}

/** Reads the persisted catalogue and assignments rather than renderer drafts. */
async function savedTags() {
    return JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'project-tags.json'), 'utf8').catch(() => '{"tags":[],"assignments":{}}')) as { tags: { id: string; name: string }[]; assignments: Record<string, string[]> };
}

/** Opens a real import review through its existing entry point.
 * @param route - User-facing source to exercise.
 */
async function openImport(route: string) {
    if (route === 'drop') {
        const cdp = await page.context().newCDPSession(page);
        const data = { items: [], files, dragOperationsMask: 1 };
        await cdp.send('Input.dispatchDragEvent', { type: 'dragEnter', x: 400, y: 300, data });
        await cdp.send('Input.dispatchDragEvent', { type: 'drop', x: 400, y: 300, data });
    } else {
        await page.getByTestId('btnProjectAdd').click();
        await page.getByTestId({ file: 'btnAddProjectFromComputer', folder: 'btnAddProjectScanFolder', public: 'btnAddProjectPublicGit', github: 'btnAddProjectGitHub' }[route]!).click();
        if (route === 'public' || route === 'github') {
            const modal = page.getByTestId('remoteProjectImportDialog');
            if (route === 'public') {
                await page.getByTestId('inputPublicGitRepositoryUrl').fill('https://example.com/game.git');
                await modal.getByRole('button', { name: 'Continue', exact: true }).click();
            } else {
                await modal.getByText('fixture/entry-tags-game', { exact: true }).click();
                const next = modal.getByRole('button', { name: 'Continue', exact: true });
                if (await next.isVisible()) await next.click();
            }
            await modal.getByRole('button', { name: 'Clone repository', exact: true }).click();
        }
    }
    const review = route === 'folder' ? page.getByTestId('folderProjectImportDialog') : route === 'public' || route === 'github' ? page.getByTestId('remoteProjectImportDialog') : page.getByRole('dialog', { name: 'Review project imports', exact: true });
    await expect(review.getByTestId('btnProjectTags').first()).toBeVisible();
    return review;
}

for (const route of ['file', 'drop', 'folder', 'public', 'github']) {
    test(`chooses independent tags through ${route} import and excludes failed registrations`, async () => {
        const review = await openImport(route);
        await chooseTag(review.getByTestId('btnProjectTags').nth(0), 'Prototype');
        if (route !== 'file') {
            await chooseTag(review.getByTestId('btnProjectTags').nth(1), 'Game Jam');
            await chooseTag(review.getByTestId('btnProjectTags').nth(2), 'Failed project tag');
        }
        expect((await savedTags()).tags).toHaveLength(0);
        if (route === 'folder') { await page.setViewportSize({ width: 1024, height: 600 }); await page.screenshot({ path: test.info().outputPath('folder-entry-tags.png') }); }
        await review.getByRole('button', { name: /^Add (?:selected )?projects/i }).click();
        await expect.poll(async () => (await savedTags()).tags.map(tag => tag.name).sort()).toEqual(route === 'file' ? ['Prototype'] : ['Game Jam', 'Prototype']);
        const saved = await savedTags();
        expect(saved.assignments[SAMPLE_PROJECTS[0].path]).toEqual([saved.tags.find(tag => tag.name === 'Prototype')!.id]);
        if (route !== 'file') expect(saved.assignments[SAMPLE_PROJECTS[1].path]).toEqual([saved.tags.find(tag => tag.name === 'Game Jam')!.id]);
        expect(saved.assignments[SAMPLE_PROJECTS[2].path]).toBeUndefined();
    });
}

test('cancels staged local tags and retries persistence without registering twice', async () => {
    let review = await openImport('file');
    await chooseTag(review.getByTestId('btnProjectTags'), 'Discarded');
    await review.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await savedTags()).tags).toHaveLength(0);
    review = await openImport('file');
    await chooseTag(review.getByTestId('btnProjectTags'), 'Retried');
    await app.evaluate(() => { (globalThis as any).entryFailTags = true; });
    await review.getByRole('button', { name: 'Add projects', exact: true }).click();
    const recovery = page.getByRole('dialog', { name: 'Tags', exact: true });
    await expect(recovery).toContainText('Could not save tags.');
    await recovery.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(recovery).toBeVisible();
    await app.evaluate(() => { (globalThis as any).entryFailTags = false; (globalThis as any).entryHoldTags = true; });
    await recovery.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(recovery.getByRole('button', { name: 'Retry', exact: true })).toBeDisabled();
    await expect(recovery.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(recovery).toBeVisible();
    await app.evaluate(() => { (globalThis as any).entryReleaseTags(); });
    await expect(recovery).not.toBeVisible();
    expect(await app.evaluate(() => (globalThis as any).entryRegistrations)).toBe(1);
    expect((await savedTags()).tags.map(tag => tag.name)).toEqual(['Retried']);
});

test('creates with staged tags and duplicates with editable source tags', async () => {
    await page.getByTestId('btnProjectCreate').click();
    let drawer = page.getByRole('dialog', { name: 'New Project', exact: true });
    await page.getByTestId('inputProjectName').fill('Tagged Creation');
    await chooseTag(drawer.getByTestId('btnProjectTags'), 'Source tag');
    await drawer.getByRole('checkbox', { name: /^(Initialize Git Repository|Create a new Git repository)$/ }).uncheck();
    await drawer.getByRole('checkbox', { name: /^(Edit now|Open in Godot)$/ }).uncheck();
    await page.screenshot({ path: test.info().outputPath('create-entry-tags.png') });
    await app.evaluate(() => { (globalThis as any).entryFailTags = true; });
    await page.getByTestId('btnCreateProject').click();
    const recovery = page.getByRole('dialog', { name: 'Tags', exact: true });
    await expect(recovery).toContainText('Could not save tags.');
    await recovery.getByRole('button', { name: 'Retry', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(recovery.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await app.evaluate(() => { (globalThis as any).entryFailTags = false; });
    await recovery.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(drawer).not.toBeVisible();
    await page.getByTestId('btnProjectMoreOptions').filter({ visible: true }).first().click();
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    drawer = page.getByRole('dialog', { name: 'Duplicate Project', exact: true });
    await expect(drawer.getByTestId('btnProjectTags')).toHaveAccessibleName('Tags: Source tag');
    await chooseTag(drawer.getByTestId('btnProjectTags'), 'Copy tag');
    await page.getByTestId('btnContinueDuplicate').click();
    await drawer.getByRole('checkbox', { name: /^(Initialize Git Repository|Create a new Git repository)$/ }).uncheck();
    await drawer.getByRole('checkbox', { name: /^(Edit now|Open in Godot)$/ }).uncheck();
    await page.getByTestId('btnCreateProject').click();
    await expect(drawer).not.toBeVisible();
    const saved = await savedTags();
    expect(saved.tags.map(tag => tag.name)).toEqual(['Source tag', 'Copy tag']);
    expect(saved.assignments[SAMPLE_PROJECTS[0].path]).toEqual([saved.tags[0].id]);
    expect(saved.assignments[SAMPLE_PROJECTS[1].path]).toEqual([saved.tags[0].id, saved.tags[1].id]);
});

for (const route of ['file', 'folder', 'public']) {
    test(`retains per-project tags through stale registration review in ${route}`, async () => {
        const review = await openImport(route);
        await chooseTag(review.getByTestId('btnProjectTags').first(), 'Retained choice');
        await app.evaluate(() => { (globalThis as any).entryStale = true; });
        await review.getByRole('button', { name: /^Add (?:selected )?projects/i }).click();
        await expect(review.getByTestId('btnProjectTags').first()).toHaveAccessibleName('Tags: Retained choice');
        expect((await savedTags()).tags).toHaveLength(0);
        await review.getByRole('button', { name: /^Add (?:selected )?projects/i }).click();
        await expect.poll(async () => (await savedTags()).tags.map(tag => tag.name)).toEqual(['Retained choice']);
    });
}

for (const route of ['drop', 'folder', 'public', 'github']) {
    test(`stages bulk tags and individual exceptions through ${route} import`, async () => {
        const review = await openImport(route);
        await chooseTag(review.getByTestId('btnProjectTags').nth(0), 'Individual');
        await review.getByRole('button', { name: 'Tag selected (3)', exact: true }).click();
        let bulk = page.getByRole('dialog', { name: 'Bulk edit tags', exact: true });
        await bulk.getByRole('searchbox').fill('Batch');
        await bulk.getByRole('searchbox').press('Enter');
        await expect(bulk.getByRole('checkbox', { name: 'Batch', exact: true })).toBeChecked();
        await page.keyboard.press('Escape');
        await expect(review.getByTestId('btnProjectTags').nth(0)).toHaveAccessibleName('Tags: Individual, Batch');
        await review.getByRole('checkbox', { name: /Imported 1/ }).uncheck();
        await review.getByRole('button', { name: 'Tag selected (2)', exact: true }).click();
        bulk = page.getByRole('dialog', { name: 'Bulk edit tags', exact: true });
        await bulk.getByRole('checkbox', { name: 'Batch', exact: true }).uncheck();
        await page.keyboard.press('Escape');
        await expect(review.getByTestId('btnProjectTags').nth(0)).toHaveAccessibleName('Tags: Individual');
        await expect(review.getByTestId('btnProjectTags').nth(1)).toHaveAccessibleName('Tags: Batch');
        await review.getByRole('checkbox', { name: /Imported 1/ }).check();
        await review.getByRole('button', { name: 'Tag selected (3)', exact: true }).click();
        bulk = page.getByRole('dialog', { name: 'Bulk edit tags', exact: true });
        await expect(bulk.getByRole('checkbox', { name: 'Batch', exact: true })).toHaveAttribute('aria-checked', 'mixed');
        await bulk.getByRole('checkbox', { name: 'Batch', exact: true }).click();
        await expect(bulk.getByRole('checkbox', { name: 'Batch', exact: true })).toBeChecked();
        await page.keyboard.press('Escape');
        await review.getByTestId('btnProjectTags').nth(2).click();
        const picker = page.getByRole('dialog', { name: 'Tags', exact: true });
        await picker.getByRole('button', { name: 'Remove Batch', exact: true }).click();
        await picker.getByRole('combobox').press('Escape');
        const selectAll = review.getByRole('checkbox', { name: 'Select all projects', exact: true });
        await selectAll.uncheck();
        await expect(review.getByRole('button', { name: 'Tag selected (0)', exact: true })).toBeDisabled();
        await selectAll.check();
        expect((await savedTags()).tags).toHaveLength(0);
        if (route === 'folder') await page.screenshot({ path: test.info().outputPath('bulk-import-tags.png') });
        await review.getByRole('button', { name: /^Add (?:selected )?projects/i }).click();
        await expect.poll(async () => (await savedTags()).tags.map(tag => tag.name)).toEqual(['Individual', 'Batch']);
        await expect.poll(async () => (await savedTags()).assignments[SAMPLE_PROJECTS[1].path]?.length).toBe(1);
        const saved = await savedTags();
        expect(saved.assignments[SAMPLE_PROJECTS[0].path]).toEqual(saved.tags.map(tag => tag.id));
        expect(saved.assignments[SAMPLE_PROJECTS[1].path]).toEqual([saved.tags[1].id]);
        expect(saved.assignments[SAMPLE_PROJECTS[2].path]).toBeUndefined();
    });
}

test('cancels bulk import drafts without saving tags', async () => {
    const review = await openImport('drop');
    await review.getByRole('button', { name: 'Tag selected (3)', exact: true }).click();
    const bulk = page.getByRole('dialog', { name: 'Bulk edit tags', exact: true });
    await bulk.getByRole('searchbox').fill('Discarded batch');
    await bulk.getByRole('searchbox').press('Enter');
    await page.keyboard.press('Escape');
    await review.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await savedTags()).tags).toHaveLength(0);
    expect(await app.evaluate(() => (globalThis as any).entryRegistrations)).toBe(0);
});
