import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { EditorCatalogRelease } from '@shared/contracts';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Page,
    test,
} from '@playwright/test';
import {
    createFixtureHome,
    applyTheme,
    setAppLanguage,
} from './support/e2e-fixture-runtime';
import { THEMES } from './support/e2e-fixture-theme';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { storedZip } from './support/stored-zip.util';
import { getMainWindow } from './splashscreen/getMainWindow';

let app: ElectronApplication;
let page: Page;
let home: string;
let root: string;
let local: string;
let launchEnv: Record<string, string>;
let packages: { url: string; bytes: string }[];
type BridgeWindow = Window & {
    __di_electron__: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> };
};
/** Fails one bridge read after an accepted operation, until the fixture is restored. */
async function failReadAfterAction(action: string, read: string) {
    await app.evaluate(({ ipcMain }, channels) => {
        const handlers = (ipcMain as typeof ipcMain & {
            _invokeHandlers: Map<string, (...args: unknown[]) => unknown>;
        })._invokeHandlers;
        const originalAction = handlers.get(channels.action);
        const originalRead = handlers.get(channels.read);
        if (!originalAction || !originalRead) throw new Error('Missing template bridge handler');
        let accepted = false;
        ipcMain.removeHandler(channels.action);
        ipcMain.removeHandler(channels.read);
        ipcMain.handle(channels.action, async (event, ...args) => {
            const result = await originalAction(event, ...args);
            if ((result as { success?: boolean }).success) accepted = true;
            return result;
        });
        ipcMain.handle(channels.read, (event, ...args) => accepted
            ? { success: false, error: { type: 'Error', message: 'Fixture read failure' } }
            : originalRead(event, ...args));
        (globalThis as typeof globalThis & { restoreTemplateReadAfterAction?: () => void }).restoreTemplateReadAfterAction = () => {
            ipcMain.removeHandler(channels.action);
            ipcMain.removeHandler(channels.read);
            ipcMain.handle(channels.action, originalAction);
            ipcMain.handle(channels.read, originalRead);
        };
    }, { action, read });
}
async function restoreReadAfterAction() {
    await app.evaluate(() => {
        const state = globalThis as typeof globalThis & { restoreTemplateReadAfterAction?: () => void };
        state.restoreTemplateReadAfterAction?.();
        delete state.restoreTemplateReadAfterAction;
    });
}
test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);
test.beforeAll(async () => {
    home = await createFixtureHome();
    const cataloguePath = path.join(home, '.gd-launcher', 'editor-catalog.json');
    const catalogue: {
        providers: Record<string, {
            templateMetadataRefreshed: boolean;
            releases: EditorCatalogRelease[];
        }>;
    } = JSON.parse(await fs.readFile(cataloguePath, 'utf8'));
    for (const provider of Object.values(catalogue.providers)) {
        provider.templateMetadataRefreshed = true;
        for (const release of provider.releases) {
            // Preserve feed overlap while matching production channel classification.
            release.prerelease = release.versionParts.channel !== 'stable';
            release.templateAssets = ['gdscript', 'dotnet'].map((flavor) => ({
                id: `${release.id}:templates:${flavor}`,
                name: `Godot_${release.version}_${flavor}_export_templates.tpz`,
                flavor: flavor as 'gdscript' | 'dotnet',
                downloadUrl: `https://example.invalid/templates/${release.version}/${flavor}.tpz`,
                sizeBytes: 48 * 1024 * 1024,
            }));
        }
    }
    await fs.writeFile(cataloguePath, JSON.stringify(catalogue));
    root = path.join(home, '.gd-launcher', 'godot', 'export_templates');
    const project = {
        ...SAMPLE_PROJECTS[0],
        name: 'Template migration',
        path: path.join(home, 'project'),
        launch_path: path.join(home, 'editor', 'Godot'),
        release: {
            ...SAMPLE_PROJECTS[0].release,
            version: '4.4-stable',
            source: 'official',
            mono: false,
        },
    };
    local = path.join(home, 'editor', 'editor_data', 'export_templates');
    await fs.mkdir(project.path, { recursive: true });
    await fs.writeFile(
        path.join(project.path, 'project.godot'),
        '[application]\nconfig/name="Template migration"\n',
    );
    await fs.mkdir(path.dirname(project.launch_path), { recursive: true });
    await fs.writeFile(project.launch_path, 'fixture editor');
    await fs.writeFile(
        path.join(home, '.gd-launcher', 'projects.json'),
        JSON.stringify([project]),
    );
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        APPDATA: path.join(home, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
        XDG_CONFIG_HOME: path.join(home, '.config'),
        XDG_DATA_HOME: path.join(home, '.local', 'share'),
        GODOT_LAUNCHER_E2E_FIXTURES: '1',
        GODOT_LAUNCHER_E2E_HOME_DIR: home,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    launchEnv = Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined));
    app = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`],
        env: launchEnv,
    });
    packages = Object.values(catalogue.providers).flatMap((provider) => provider.releases).flatMap((release) => (release.templateAssets ?? []).map((asset) => ({
        url: asset.downloadUrl,
        bytes: storedZip({
            'templates/version.txt': `${release.tag.replace('-', '.')}${asset.flavor === 'dotnet' ? '.mono' : ''}`,
            'templates/linux_debug.x86_64': 'official debug',
            'templates/linux_release.x86_64': 'official release',
            'templates/macos.zip': 'other platform',
        }).toString('base64'),
    })));
    await installPackageFixtures();
    page = await getMainWindow(app);
    await setAppLanguage(page, 'English');
    await page.getByTestId('btnExportTemplates').click();
});
test.afterAll(async () => {
    await app?.close();
    await fs.rm(home, { recursive: true, force: true });
});

/** Counts template reads through the real preload bridge until restored. */
async function trackTemplateReads() {
    await app.evaluate(({ ipcMain }) => {
        const handlers = (ipcMain as typeof ipcMain & {
            _invokeHandlers: Map<string, (...args: unknown[]) => unknown>;
        })._invokeHandlers;
        const counts: Record<string, number> = {};
        const channels = ['getProjectSettings', 'getProjectPackage', 'getPackage', 'getLocalPackage'];
        const originals = channels.map(name => {
            const channel = `exportTemplates.${name}`;
            const handler = handlers.get(channel)!;
            counts[name] = 0;
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, (event, ...args) => {
                counts[name]++;
                return handler(event, ...args);
            });
            return { channel, handler };
        });
        (globalThis as any).templateFocusReads = counts;
        (globalThis as any).restoreTemplateFocusReads = () => {
            for (const { channel, handler } of originals) {
                ipcMain.removeHandler(channel);
                ipcMain.handle(channel, handler);
            }
        };
    });
}

/** Returns the number of file-selector reads observed in the main process. */
async function templateReadCounts(): Promise<Record<string, number>> {
    return app.evaluate(() => (globalThis as any).templateFocusReads);
}

for (const surface of ['library', 'project'] as const) {
    test(`refreshes only the visible ${surface} template file tree on focus and preserves drafts`, async () => {
        const directory = path.join(root, '4.4.stable');
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, 'before.txt'), 'before');
        await trackTemplateReads();
        try {
            let drawer;
            if (surface === 'library') {
                await page.getByTestId('btnExportTemplates').click();
                await page.getByRole('button', { name: 'Refresh', exact: true }).click();
                await page.getByRole('button', { name: 'Manage templates 4.4.stable', exact: true }).click();
                drawer = page.getByTestId('templateDownloadDrawer');
            } else {
                drawer = await openProjectTemplates();
            }
            const other = drawer.getByRole('button', { name: 'Other files', exact: true });
            await expect(other).toBeVisible();
            if (await other.getAttribute('aria-expanded') === 'false') await other.click();
            await expect(drawer.getByRole('checkbox', { name: 'before.txt', exact: true })).toBeChecked();
            await fs.unlink(path.join(directory, 'before.txt'));
            await fs.writeFile(path.join(directory, 'after.txt'), 'after');
            await page.evaluate(() => window.dispatchEvent(new Event('focus')));
            await expect(drawer.getByRole('checkbox', { name: 'before.txt', exact: true })).toHaveCount(0);
            const file = drawer.getByRole('checkbox', { name: 'after.txt', exact: true });
            await expect(file).toBeChecked();
            await file.uncheck();
            const dirtyReads = await templateReadCounts();
            await fs.writeFile(path.join(directory, 'later.txt'), 'later');
            await page.evaluate(() => window.dispatchEvent(new Event('focus')));
            await page.waitForTimeout(300);
            await expect(file).not.toBeChecked();
            const afterDirty = await templateReadCounts();
            expect(afterDirty.getProjectPackage).toBe(dirtyReads.getProjectPackage);
            expect(afterDirty.getPackage).toBe(dirtyReads.getPackage);
            expect(afterDirty.getLocalPackage).toBe(dirtyReads.getLocalPackage);
            // Undo the draft so closing does not require a discard confirmation.
            await file.check();
            if (surface === 'project') {
                await drawer.getByTestId('tabProjectSettings_project').click();
                const hiddenReads = await templateReadCounts();
                await page.evaluate(() => window.dispatchEvent(new Event('focus')));
                await page.waitForTimeout(300);
                expect(await templateReadCounts()).toEqual(hiddenReads);
                await drawer.getByTestId('tabProjectSettings_exportTemplates').click();
                await expect(drawer.getByRole('checkbox', { name: 'later.txt', exact: true })).toBeChecked();
            }
            await drawer.getByRole('button', { name: 'Close', exact: true }).click();
            await expect(drawer).toBeHidden();
            await page.getByTestId('btnProjects').click();
            const closedReads = await templateReadCounts();
            await page.evaluate(() => window.dispatchEvent(new Event('focus')));
            await page.waitForTimeout(300);
            expect(await templateReadCounts()).toEqual(closedReads);
        } finally {
            await app.evaluate(() => {
                (globalThis as any).restoreTemplateFocusReads();
                delete (globalThis as any).templateFocusReads;
                delete (globalThis as any).restoreTemplateFocusReads;
            });
            await fs.rm(directory, { recursive: true, force: true });
            await page.getByTestId('btnExportTemplates').click();
            await page.getByRole('button', { name: 'Refresh', exact: true }).click();
        }
    });
}

test('clears transient inventory and imported-library read errors after refresh', async () => {
    await app.evaluate(({ ipcMain }) => {
        const channels = [
            'exportTemplates.getInventory',
            'exportTemplates.getImportedTemplates',
        ] as const;
        const handlers = (ipcMain as typeof ipcMain & {
            _invokeHandlers: Map<string, (...args: unknown[]) => unknown>;
        })._invokeHandlers;
        const original = channels.map((channel) => {
            const handler = handlers.get(channel);
            if (!handler) throw new Error(`Missing ${channel} handler`);
            return handler;
        });
        const state = globalThis as typeof globalThis & {
            __templateReadFixture?: {
                fail: 'inventory' | 'library' | null;
                restore: () => void;
            };
        };
        state.__templateReadFixture = {
            fail: null,
            restore: () => {
                channels.forEach((channel, index) => {
                    ipcMain.removeHandler(channel);
                    ipcMain.handle(channel, original[index]);
                });
            },
        };
        channels.forEach((channel, index) => {
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, (event, ...args) => {
                const failure = index === 0 ? 'inventory' : 'library';
                if (state.__templateReadFixture?.fail === failure) {
                    return {
                        success: false,
                        error: { type: 'Error', message: 'Fixture read failure' },
                    };
                }
                return original[index](event, ...args);
            });
        });
    });
    const refresh = page.getByRole('button', { name: 'Refresh', exact: true });
    try {
        for (const [source, message] of [
            [
                'library',
                'The shared folder could not be read. Check its location and permissions, then refresh.',
            ],
            [
                'inventory',
                'The shared folder could not be read. Check its location and permissions, then refresh.',
            ],
        ] as const) {
            await app.evaluate((_electron, next) => {
                const state = globalThis as typeof globalThis & {
                    __templateReadFixture?: { fail: string | null };
                };
                state.__templateReadFixture!.fail = next;
            }, source);
            await refresh.click();
            await expect(page.getByText(message, { exact: true })).toBeVisible();
            await app.evaluate(() => {
                (globalThis as typeof globalThis & {
                    __templateReadFixture: { fail: string | null };
                }).__templateReadFixture.fail = null;
            });
            await refresh.click();
            await expect(page.getByText(message, { exact: true })).toHaveCount(0);
        }
    } finally {
        await app.evaluate(() => {
            const state = globalThis as typeof globalThis & {
                __templateReadFixture?: { restore: () => void };
            };
            state.__templateReadFixture?.restore();
            delete state.__templateReadFixture;
        });
    }
});

test('keeps an accepted download submitted when the following job read fails', async () => {
    const directory = path.join(root, '4.6.stable');
    await page.getByRole('button', { name: 'Download templates', exact: true }).first().click();
    const drawer = page.getByTestId('templateDownloadDrawer');
    await page.getByTestId('templateVersionPicker').click();
    const picker = page.getByTestId('templateVersionPopover');
    await picker.getByRole('button', { name: 'All', exact: true }).click();
    await picker.getByRole('textbox').fill('4.6');
    await picker.getByRole('button', { name: '4.6-stable Standard', exact: true }).click();
    const tree = page.getByTestId('templateFileTree');
    await tree.getByRole('button', { name: 'Linux', exact: true }).click();
    await tree.getByRole('button', { name: 'Linux x86_64', exact: true }).click();
    await tree.getByRole('checkbox', { name: 'linux_release.x86_64', exact: true }).check();
    await failReadAfterAction('exportTemplates.savePackage', 'exportTemplates.getJobs');
    try {
        await drawer.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(drawer).toBeHidden();
        await expect(page.getByText('The shared folder could not be read. Check its location and permissions, then refresh.', { exact: true })).toBeVisible();
        await expect.poll(() => fs.readFile(path.join(directory, 'linux_release.x86_64'), 'utf8').catch(() => null)).toBe('official release');
    } finally {
        await restoreReadAfterAction();
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
        await expect(page.getByText('The shared folder could not be read. Check its location and permissions, then refresh.', { exact: true })).toHaveCount(0);
        await fs.rm(directory, { recursive: true, force: true });
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    }
});

test('shows a library read error after a committed import and recovers on refresh', async () => {
    const archive = path.join(home, 'read-recovery-template.tpz');
    const registryPath = path.join(home, '.gd-launcher', 'export-templates', 'imported-templates.json');
    const original = await fs.readFile(registryPath, 'utf8').catch(() => undefined);
    await fs.writeFile(archive, storedZip({
        'templates/version.txt': '4.4.stable',
        'templates/web_release.zip': 'committed import',
    }));
    await chooseArchive(archive);
    await failReadAfterAction('exportTemplates.installTemplateImport', 'exportTemplates.getImportedTemplates');
    try {
        await page.getByRole('button', { name: 'Import .tpz', exact: true }).click();
        const modal = page.getByRole('dialog', { name: 'Import export templates', exact: true });
        await modal.getByRole('button', { name: 'Choose TPZ file', exact: true }).click();
        await modal.getByRole('button', { name: 'Next', exact: true }).click();
        await modal.getByRole('textbox', { name: 'Name', exact: true }).fill('Read recovery fixture');
        await modal.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(modal).toBeHidden();
        await expect(page.getByText('The shared folder could not be read. Check its location and permissions, then refresh.', { exact: true })).toBeVisible();
        const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
        expect(registry.builds.some((build: { label: string }) => build.label === 'Read recovery fixture')).toBe(true);
        await restoreReadAfterAction();
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
        await expect(page.getByRole('article', { name: 'Read recovery fixture', exact: true })).toBeVisible();
        await expect(page.getByText('The shared folder could not be read. Check its location and permissions, then refresh.', { exact: true })).toHaveCount(0);
    } finally {
        await restoreReadAfterAction();
        if (original === undefined) await fs.rm(registryPath, { force: true });
        else await fs.writeFile(registryPath, original);
        await fs.rm(path.join(home, '.gd-launcher', 'export-templates', 'imported', '4.4.stable', 'Read recovery fixture'), { recursive: true, force: true });
        await fs.rm(archive, { force: true });
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    }
});

test('opens an imported build folder from its row', async () => {
    const label = 'Folder action fixture';
    const id = randomUUID();
    const revision = randomUUID();
    const libraryRoot = path.join(home, '.gd-launcher', 'export-templates');
    const registryPath = path.join(libraryRoot, 'imported-templates.json');
    const folder = path.join(libraryRoot, 'imported', '4.8.stable', label);
    const original = await fs.readFile(registryPath, 'utf8').catch(() => undefined);
    const registry = original ? JSON.parse(original) : { schemaVersion: 1, builds: [] };
    registry.builds.push({ id, revision, label, directoryName: label, setId: '4.8.stable', importedAt: '', archiveName: '', files: ['web.zip'], sizeBytes: 7 });
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, 'web.zip'), 'fixture');
    await fs.writeFile(registryPath, JSON.stringify(registry));
    await app.evaluate(({ shell }) => {
        const originalOpenPath = shell.openPath;
        shell.openPath = async (selected) => {
            (globalThis as any).openedTemplateFolder = selected;
            return '';
        };
        (globalThis as any).restoreTemplateOpenPath = () => { shell.openPath = originalOpenPath; };
    });
    try {
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
        const openFolder = page.getByRole('article', { name: label, exact: true }).getByRole('button', { name: 'Open template folder' });
        await expect(openFolder).toBeVisible();
        await openFolder.hover();
        await expect(page.getByRole('tooltip')).toHaveText('Open template folder');
        await openFolder.click();
        await expect.poll(() => app.evaluate(() => (globalThis as any).openedTemplateFolder)).toBe(folder);
    } finally {
        await app.evaluate(() => { (globalThis as any).restoreTemplateOpenPath(); delete (globalThis as any).restoreTemplateOpenPath; delete (globalThis as any).openedTemplateFolder; });
        if (original === undefined) await fs.rm(registryPath, { force: true });
        else await fs.writeFile(registryPath, original);
        await fs.rm(path.join(libraryRoot, 'imported', '4.8.stable'), { recursive: true, force: true });
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    }
});

test('stores imported builds under readable names and rejects folder collisions', async () => {
    const libraryRoot = path.join(home, '.gd-launcher', 'export-templates');
    const registryPath = path.join(libraryRoot, 'imported-templates.json');
    const original = await fs.readFile(registryPath, 'utf8').catch(() => undefined);
    const archive = path.join(home, 'readable-template.tpz');
    await fs.writeFile(archive, storedZip({
        'templates/version.txt': '4.4.stable',
        'templates/web_release.zip': 'readable build',
    }));
    try {
        await chooseArchive(archive);
        await page.getByRole('button', { name: 'Import .tpz', exact: true }).click();
        let modal = page.getByRole('dialog', { name: 'Import export templates', exact: true });
        await modal.getByRole('button', { name: 'Choose TPZ file', exact: true }).click();
        await modal.getByRole('button', { name: 'Next', exact: true }).click();
        await modal.getByRole('textbox', { name: 'Name', exact: true }).fill('Cloud: Build');
        await modal.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(modal).toBeHidden();
        const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
        const build = registry.builds.find((item: { label: string }) => item.label === 'Cloud: Build');
        expect(build.directoryName).toBe('Cloud- Build');
        const firstFolder = path.join(libraryRoot, 'imported', build.setId, build.directoryName);
        expect(await fs.readFile(path.join(firstFolder, 'web_release.zip'), 'utf8')).toBe('readable build');

        await chooseArchive(archive);
        await page.getByRole('article', { name: 'Cloud: Build', exact: true })
            .getByRole('button', { name: 'Replace TPZ', exact: true }).click();
        const replacement = page.getByRole('dialog', { name: 'Replace TPZ', exact: true });
        await replacement.getByRole('button', { name: 'Choose TPZ file', exact: true }).click();
        await replacement.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(replacement.getByRole('textbox', { name: 'Name', exact: true })).toHaveCount(0);
        await expect(replacement.getByText('Cloud: Build', { exact: true })).toBeVisible();
        await replacement.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(replacement).toBeHidden();
        const replaced = JSON.parse(await fs.readFile(registryPath, 'utf8'));
        const replacedBuild = replaced.builds.find((item: { id: string }) => item.id === build.id);
        expect(replacedBuild).toMatchObject({ label: 'Cloud: Build', directoryName: 'Cloud- Build' });
        expect(replacedBuild.revision).not.toBe(build.revision);

        await chooseArchive(archive);
        await page.getByRole('button', { name: 'Import .tpz', exact: true }).click();
        modal = page.getByRole('dialog', { name: 'Import export templates', exact: true });
        await modal.getByRole('button', { name: 'Choose TPZ file', exact: true }).click();
        await modal.getByRole('button', { name: 'Next', exact: true }).click();
        await modal.getByRole('textbox', { name: 'Name', exact: true }).fill('cloud/ build');
        await modal.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(modal.getByRole('alert')).toContainText('A folder with this name already exists');
        await modal.getByRole('button', { name: 'Cancel', exact: true }).click();

        const row = page.getByRole('article', { name: 'Cloud: Build', exact: true });
        await row.getByRole('button', { name: 'Rename', exact: true }).click();
        await row.getByRole('textbox', { name: 'Name', exact: true }).fill('Renamed Build');
        await row.getByRole('button', { name: 'Save', exact: true }).click();
        const renamedRow = page.getByRole('article', { name: 'Renamed Build', exact: true });
        await expect(renamedRow.getByRole('textbox', { name: 'Name', exact: true })).toHaveCount(0);
        await expect(renamedRow.getByRole('button', { name: 'Rename', exact: true })).toBeEnabled();
        const nextFolder = path.join(libraryRoot, 'imported', build.setId, 'Renamed Build');
        expect(await fs.readFile(path.join(nextFolder, 'web_release.zip'), 'utf8')).toBe('readable build');
        expect(await fs.stat(firstFolder).catch(() => null)).toBeNull();

        const caseOnly = await page.evaluate(async (id: string) =>
            (window as unknown as BridgeWindow).__di_electron__.invoke('exportTemplates.renameImportedTemplate', id, 'renamed build'),
        build.id) as { success: boolean };
        expect(caseOnly.success).toBe(true);
        expect(await fs.readdir(path.join(libraryRoot, 'imported', build.setId))).toContain('renamed build');
        expect(await fs.readFile(path.join(libraryRoot, 'imported', build.setId, 'renamed build', 'web_release.zip'), 'utf8')).toBe('readable build');
    } finally {
        const modal = page.getByRole('dialog', { name: 'Import export templates', exact: true });
        if (await modal.isVisible())
            await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
        if (original === undefined) await fs.rm(registryPath, { force: true });
        else await fs.writeFile(registryPath, original);
        await fs.rm(path.join(libraryRoot, 'imported', '4.4.stable'), { recursive: true, force: true });
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    }
});

test('selects template files in the compact version drawer without downloading', async () => {
    const version = '4.6.stable';
    const directory = path.join(root, version);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'linux_debug.x86_64'), 'local template');
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByRole('article', { name: version, exact: true })).toBeVisible();
    const platformIcon = page.getByRole('article', { name: version, exact: true }).locator('img');
    await expect.poll(() => platformIcon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.getByRole('button', { name: 'Download templates', exact: true }).click();
    const drawer = page.getByTestId('templateDownloadDrawer');
    const picker = page.getByTestId('templateVersionPicker');
    await expect(drawer).toHaveAccessibleName('Add Export Template');
    await picker.click();
    const popover = page.getByTestId('templateVersionPopover');
    await expect(popover.getByRole('button', { name: 'Stable', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await popover.getByRole('button', { name: 'All', exact: true }).click();
    await popover.getByRole('button', { name: 'Prerelease', exact: true }).click();
    await expect(popover.getByRole('button', { name: '4.6-stable Standard', exact: true })).toHaveCount(0);
    await popover.getByRole('button', { name: 'Stable', exact: true }).click();
    const versionSearch = popover.getByRole('textbox');
    await versionSearch.fill('no-such-version');
    await expect(popover.getByText('No matching versions', { exact: true })).toBeVisible();
    await versionSearch.fill('4.6');
    await page.screenshot({ path: test.info().outputPath('template-version-picker.png') });
    await popover.getByRole('button', { name: '4.6-stable Standard', exact: true }).click();
    await expect(popover).toBeHidden();
    const tree = page.getByTestId('templateFileTree');
    await tree.getByRole('button', { name: 'Linux', exact: true }).click();
    await tree.getByRole('button', { name: 'Linux x86_64', exact: true }).click();
    const localFile = tree.getByRole('checkbox', { name: 'linux_debug.x86_64', exact: true });
    await expect(localFile).toBeChecked();
    await localFile.uncheck();
    await expect(tree.getByText('Will remove', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Files to add: 0; to remove: 1', { exact: true })).toBeVisible();
    expect(await fs.readFile(path.join(directory, 'linux_debug.x86_64'), 'utf8')).toBe('local template');
    await localFile.check();
    await expect(tree.getByText('Will remove', { exact: true })).toHaveCount(0);
    await tree.getByRole('checkbox', { name: 'Linux x86_64', exact: true }).check();
    await expect(tree.getByRole('checkbox', { name: 'linux_release.x86_64', exact: true })).toBeChecked();
    await expect(drawer.getByText('Files to add: 1; to remove: 0', { exact: true })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
    await picker.click();
    await popover.getByRole('button', { name: '4.6-stable .NET', exact: true }).click();
    await expect(drawer.getByText('Files to add: 0; to remove: 0', { exact: true })).toBeVisible();
    await picker.click();
    await page.keyboard.press('Escape');
    await expect(popover).toBeHidden();
    await expect(drawer).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 600 });
    await expect.poll(() => drawer.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await expect(drawer.getByRole('button', { name: 'Save changes', exact: true })).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath('template-file-selector.png') });
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    for (const theme of THEMES) {
        await applyTheme(page, theme);
        await page.getByTestId('btnExportTemplates').click();
        await expect(page.getByRole('article', { name: version, exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Download templates', exact: true }).click();
        await picker.click();
        await popover.getByRole('button', { name: 'All', exact: true }).click();
        await popover.getByRole('textbox').fill('4.6');
        await page.screenshot({ path: test.info().outputPath(`template-picker-${theme.name}.png`) });
        await popover.getByRole('button', { name: '4.6-stable Standard', exact: true }).click();
        await tree.getByRole('button', { name: 'Linux', exact: true }).click();
        await tree.getByRole('button', { name: 'Linux x86_64', exact: true }).click();
        await tree.getByRole('checkbox', { name: 'Linux x86_64', exact: true }).check();
        await expect(drawer.getByRole('button', { name: 'Save changes', exact: true })).toBeInViewport();
        await expect.poll(() => tree.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        await page.screenshot({ path: test.info().outputPath(`template-tree-${theme.name}.png`) });
        await page.keyboard.press('Escape');
        await expect(drawer).toBeHidden();
    }
    await fs.rm(directory, { recursive: true });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
});

test('shows affected entries instead of an empty inventory when a set cannot be read', async () => {
    const unreadable = path.join(root, '4.7.stable');
    try {
        await fs.writeFile(unreadable, 'not a directory');
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
        const content = page.getByTestId('exportTemplatesContent');
        await expect(content.getByRole('alert')).toContainText('Some entries could not be identified or read.');
        await expect(content.getByRole('alert')).toContainText('4.7.stable');
        await expect(content.getByText('No export templates installed', { exact: true })).toHaveCount(0);
    } finally {
        await fs.rm(unreadable, { force: true });
        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    }
});

test('saves selected additions and removals through the preload bridge', async () => {
    const directory = path.join(root, '4.6.stable');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'linux_debug.x86_64'), 'local debug');
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByRole('article', { name: '4.6.stable', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Download templates', exact: true }).click();
    const drawer = page.getByTestId('templateDownloadDrawer');
    await page.getByTestId('templateVersionPicker').click();
    const popover = page.getByTestId('templateVersionPopover');
    await popover.getByRole('button', { name: 'All', exact: true }).click();
    await popover.getByRole('textbox').fill('4.6');
    await popover.getByRole('button', { name: '4.6-stable Standard', exact: true }).click();
    const tree = page.getByTestId('templateFileTree');
    await tree.getByRole('button', { name: 'Linux', exact: true }).click();
    await tree.getByRole('button', { name: 'Linux x86_64', exact: true }).click();
    await tree.getByRole('checkbox', { name: 'linux_debug.x86_64', exact: true }).uncheck();
    await tree.getByRole('checkbox', { name: 'linux_release.x86_64', exact: true }).check();
    await expect(drawer.getByText('Files to add: 1; to remove: 1', { exact: true })).toBeVisible();
    await drawer.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(drawer).toBeHidden();
    await waitForTemplateStage('complete');
    expect(await fs.readdir(directory)).toEqual(['linux_release.x86_64', 'version.txt']);
    expect(await fs.readFile(path.join(directory, 'linux_release.x86_64'), 'utf8')).toBe('official release');
    await fs.writeFile(path.join(directory, '.DS_Store'), 'finder metadata');
    await fs.mkdir(path.join(directory, '__MACOSX'));
    await fs.writeFile(path.join(directory, '__MACOSX', '._template'), 'AppleDouble metadata');
    await page.getByRole('button', { name: 'Manage templates 4.6.stable', exact: true }).click();
    await expect(drawer).toHaveAccessibleName('Manage templates 4.6.stable - Standard');
    await expect(drawer.getByTestId('templateVersionPicker')).toHaveCount(0);
    await tree.getByRole('button', { name: 'Linux', exact: true }).click();
    await tree.getByRole('button', { name: 'Linux x86_64', exact: true }).click();
    await tree.getByRole('checkbox', { name: 'linux_release.x86_64', exact: true }).uncheck();
    await expect(drawer.getByRole('button', { name: 'Remove templates', exact: true })).toBeEnabled();
    await page.screenshot({ path: test.info().outputPath('manage-template-files.png') });
    await drawer.getByRole('button', { name: 'Remove templates', exact: true }).click();
    await expect(drawer).toBeHidden();
    await waitForTemplateStage('complete');
    await expect(page.getByRole('article', { name: '4.6.stable', exact: true })).toBeHidden();
    await expect(fs.lstat(directory)).rejects.toMatchObject({ code: 'ENOENT' });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
});

test('keeps queued operations in their rows and shows sidebar activity across navigation', async () => {
    const drawer = page.getByTestId('templateDownloadDrawer');
    const tree = page.getByTestId('templateFileTree');
    /** Selects a fixture package using the real drawer.
     * @param edition - Standard or .NET.
     */
    const choose = async (edition: string) => {
        await page.getByRole('button', { name: 'Download templates', exact: true }).first().click();
        await page.getByTestId('templateVersionPicker').click();
        const popover = page.getByTestId('templateVersionPopover');
        await popover.getByRole('button', { name: 'All', exact: true }).click();
        await popover.getByRole('textbox').fill('4.6');
        await popover.getByRole('button', { name: `4.6-stable ${edition}`, exact: true }).click();
        await tree.getByRole('checkbox', { name: 'Linux', exact: true }).check();
    };
    await choose('Standard');
    await app.evaluate(() => {
        (globalThis as typeof globalThis & { templateHoldUrl?: string }).templateHoldUrl = 'https://example.invalid/templates/4.6-stable/gdscript.tpz';
    });
    try {
        await drawer.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(drawer).toBeHidden();
        const standard = page.getByRole('article', { name: '4.6.stable', exact: true });
        await expect(standard.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
        const activity = page.getByTestId('btnExportTemplates').getByRole('status');
        await expect(activity).toBeVisible();
        await activity.hover();
        await expect(page.getByRole('tooltip')).toHaveText('Template updates in progress...');
        await choose('.NET');
        await drawer.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(drawer).toBeHidden();
        const mono = page.getByRole('article', { name: '4.6.stable.mono', exact: true });
        await expect(mono.getByText('Queued', { exact: true })).toBeVisible();
        await page.screenshot({ path: test.info().outputPath('queued-template-rows.png') });
        await mono.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(mono).toBeHidden();
        await expect(standard).toBeVisible();
        await page.getByTestId('btnProjects').click();
        await expect(activity).toBeVisible();
        await page.getByTestId('btnExportTemplates').click();
        await standard.getByRole('button', { name: 'Cancel', exact: true }).click();
        await waitForTemplateStage('cancelled');
        await expect(standard).toBeHidden();
        await expect(activity).toBeHidden();
        await expect(fs.lstat(path.join(root, '4.6.stable'))).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(fs.lstat(path.join(root, '4.6.stable.mono'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
        await app.evaluate(() => { delete (globalThis as typeof globalThis & { templateHoldUrl?: string }).templateHoldUrl; });
    }
});

test('merges project files, links a project and removes only shared templates', async () => {
    await expect(page).toHaveURL(/#\/export-templates$/);
    await expect(
        page.getByText('No export templates installed', { exact: true }),
    ).toBeVisible();
    await fs.mkdir(path.join(root, '4.4.stable'), { recursive: true });
    await fs.writeFile(path.join(root, '4.4.stable', 'version.txt'), '4.4.stable\n');
    await fs.writeFile(path.join(root, '4.4.stable', 'windows_release_x86_64.exe'), 'shared bytes');
    await fs.writeFile(path.join(root, '4.4.stable', 'web_release.zip'), 'web template');
    const apply = page.getByRole('button', { name: 'Apply changes' });
    if ((await fs.lstat(local).catch(() => null))?.isSymbolicLink()) await fs.unlink(local);
    await fs.mkdir(path.join(local, '4.4.stable'), { recursive: true });
    if (process.platform !== 'win32')
        await fs.chmod(path.join(root, '4.4.stable', 'version.txt'), 0o600);
    await fs.writeFile(
        path.join(local, '4.4.stable', 'version.txt'),
        '4.4.stable\n',
    );
    await fs.writeFile(
        path.join(local, '4.4.stable', 'windows_release_x86_64.exe'),
        'project custom bytes',
    );
    await fs.writeFile(
        path.join(local, '4.4.stable', 'linux_release.x86_64'),
        'linux template',
    );
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await openMigrationChoices();
    await expect(page.getByTestId('templateMigrationModal').getByRole('button', { name: /^Template migration:/ })).toHaveCount(1);
    await apply.click();
    await waitForTemplateStage('complete');
    await page.getByTestId('templateMigrationModal').getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByTestId('templateMigrationModal')).toBeHidden();
    expect((await fs.lstat(local)).isSymbolicLink()).toBe(true);
    if (process.platform !== 'win32')
        expect((await fs.stat(path.join(root, '4.4.stable', 'version.txt'))).mode & 0o777).toBe(0o600);
    expect(
        await fs.readFile(
            path.join(root, '4.4.stable', 'windows_release_x86_64.exe'),
            'utf8',
        ),
    ).toBe('shared bytes');
    expect(
        await fs.readFile(
            path.join(root, '4.4.stable', 'web_release.zip'),
            'utf8',
        ),
    ).toBe('web template');
    const localEntries = await fs.readdir(path.join(home, 'editor', 'editor_data'));
    expect(localEntries).toContain('export_templates');
    expect(localEntries.some(name => name.startsWith('export_templates.launcher-'))).toBe(false);
    await page.screenshot({ path: test.info().outputPath('export-templates.png') });
    await page
        .getByRole('button', { name: 'Remove 4.4.stable', exact: true })
        .click();
    const confirmation = page.getByRole('dialog', {
        name: 'Remove 4.4.stable',
    });
    await expect(
        confirmation.getByRole('button', { name: 'Remove', exact: true }),
    ).toBeEnabled();
    await expect(confirmation.getByRole('checkbox')).toHaveCount(0);
    await confirmation
        .getByRole('button', { name: 'Remove', exact: true })
        .click();
    await expect(
        page.getByText('No export templates installed', { exact: true }),
    ).toBeVisible();
    expect((await fs.lstat(local)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(path.join(home, 'editor', 'Godot'), 'utf8')).toBe(
        'fixture editor',
    );
});

test('rejects unsafe imported archives without changing ordinary templates', async () => {
    await fs.mkdir(path.join(root, '4.4.stable'), { recursive: true });
    await fs.writeFile(path.join(root, '4.4.stable', 'new-file'), 'external change');
    const unsafe = path.join(home, 'unsafe.tpz');
    await fs.writeFile(unsafe, storedZip({ '../outside': 'bad', 'templates/version.txt': '4.4.stable' }));
    await chooseArchive(unsafe);
    await page.getByRole('button', { name: 'Import .tpz', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Import export templates', exact: true });
    await modal.getByRole('button', { name: 'Choose TPZ file', exact: true }).click();
    await expect(modal.getByText(unsafe, { exact: true })).toBeVisible();
    await expect(modal.getByRole('alert')).toHaveCount(0);
    await modal.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(modal.getByRole('alert')).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await fs.readFile(path.join(root, '4.4.stable', 'new-file'), 'utf8')).toBe('external change');
    expect(await fs.stat(path.join(home, '.gd-launcher', 'export-templates', '.staging', 'outside')).catch(() => null)).toBeNull();
});

test('recovers an interrupted directory swap without removing newer user changes', async () => {
    const id = randomUUID();
    const work = path.join(
        path.dirname(root),
        '.godot-launcher-template-work',
        id,
    );
    const set = '4.5.stable';
    await fs.mkdir(path.join(work, 'old', set), { recursive: true });
    await fs.mkdir(path.join(root, set), { recursive: true });
    await fs.writeFile(path.join(work, 'old', set, 'version.txt'), 'original');
    await fs.writeFile(path.join(root, set, 'version.txt'), 'replacement');
    /** Matches the current journal fingerprint, including the file's permissions.
     * @param filename - Fixture version file before the interrupted swap.
     */
    const fingerprint = async (filename: string) => {
        const contents = await fs.readFile(filename);
        const stat = await fs.stat(filename);
        return createHash('sha256')
            .update(
                JSON.stringify([
                    [
                        'version.txt',
                        contents.length,
                        createHash('sha256').update(contents).digest('hex'),
                        stat.mode & 0o777,
                    ],
                ]),
            )
            .digest('hex');
    };
    await fs.writeFile(
        path.join(work, 'journal.json'),
        JSON.stringify({
            version: 2,
            phase: 'committing',
            sets: [
                {
                    id: set,
                    existed: true,
                    before: await fingerprint(path.join(work, 'old', set, 'version.txt')),
                    after: await fingerprint(path.join(root, set, 'version.txt')),
                },
            ],
        }),
    );
    await fs.writeFile(path.join(root, set, 'version.txt'), 'newer user edit');
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Recover files', exact: true }),
    ).toBeEnabled();
    await page
        .getByRole('button', { name: 'Recover files', exact: true })
        .click();
    await expect(
        page.getByRole('article', { name: set, exact: true }).getByRole('alert'),
    ).toHaveText('Files changed since review. Refresh and review them again before continuing.');
    expect(await fs.readFile(path.join(root, set, 'version.txt'), 'utf8')).toBe(
        'newer user edit',
    );
    expect(
        await fs.readFile(path.join(work, 'old', set, 'version.txt'), 'utf8'),
    ).toBe('original');
    await fs.writeFile(path.join(root, set, 'version.txt'), 'replacement');
    await page
        .getByRole('button', { name: 'Recover files', exact: true })
        .click();
    await expect(
        page.getByText('An interrupted operation needs attention', {
            exact: true,
        }),
    ).not.toBeVisible();
    expect(await fs.readFile(path.join(root, set, 'version.txt'), 'utf8')).toBe(
        'original',
    );
    expect(await fs.stat(work).catch(() => null)).toBeNull();
});

test('cancels an imported package preview and refuses damaged contents', async () => {
    const archive = path.join(home, 'mono.tpz');
    const contents = storedZip({ 'templates/version.txt': '4.4.stable.mono\n', 'templates/windows_release_x86_64.exe': 'dotnet template' });
    await fs.writeFile(archive, contents);
    await chooseArchive(archive);
    await page.getByRole('button', { name: 'Import .tpz', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Import export templates', exact: true });
    await modal.getByRole('button', { name: 'Choose TPZ file', exact: true }).click();
    await expect(modal.getByText(archive, { exact: true })).toBeVisible();
    await expect(modal.getByRole('textbox', { name: 'Name' })).toHaveCount(0);
    await expect(modal.getByRole('alert')).toHaveCount(0);
    await modal.getByRole('button', { name: 'Remove selected file', exact: true }).click();
    await expect(modal.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await modal.getByRole('button', { name: 'Choose TPZ file', exact: true }).click();
    await modal.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(modal.getByText('4.4.stable - .NET', { exact: true })).toBeVisible();
    await expect(modal.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('');
    await expect(modal.getByRole('textbox', { name: 'Name', exact: true })).toHaveAttribute('placeholder', 'Encrypted');
    await expect(modal.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(modal.getByText('windows_release_x86_64.exe', { exact: true })).toHaveCount(0);
    await modal.getByRole('textbox', { name: 'Name', exact: true }).fill('Encrypted');
    await modal.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(modal.getByText(archive, { exact: true })).toBeVisible();
    await modal.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(modal.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Encrypted');
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(modal).toBeHidden();
    const library = await page.evaluate(async () => (window as unknown as BridgeWindow).__di_electron__.invoke('exportTemplates.getImportedTemplates')) as { data: { builds: unknown[] } };
    expect(library.data.builds).toEqual([]);
    const corrupted = Buffer.from(contents);
    corrupted[corrupted.indexOf(Buffer.from('dotnet template'))] ^= 1;
    await fs.writeFile(archive, corrupted);
    await page.getByRole('button', { name: 'Import .tpz', exact: true }).click();
    await modal.getByRole('button', { name: 'Choose TPZ file', exact: true }).click();
    await modal.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(modal.getByRole('alert')).toBeVisible();
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(await fs.readFile(path.join(root, '4.4.stable', 'new-file'), 'utf8')).toBe('external change');
});

test('cancels TPZ preparation with Cancel and Escape and cleans staging', async () => {
    const archive = path.join(home, 'cancel-during-prepare.tpz');
    await fs.writeFile(archive, storedZip({
        'templates/version.txt': '4.4.stable',
        'templates/linux_release.x86_64': 'cancelled import',
    }));
    await chooseArchive(archive);
    await app.evaluate((_electron, selected) => {
        const fs = process.getBuiltinModule('node:fs');
        const original = fs.promises.stat;
        (globalThis as any).templateImportStatStarted = false;
        fs.promises.stat = (async (...args: Parameters<typeof original>) => {
            if (String(args[0]) === selected) {
                (globalThis as any).templateImportStatStarted = true;
                await new Promise(resolve => setTimeout(resolve, 750));
            }
            return original(...args);
        }) as typeof original;
        (globalThis as any).restoreTemplateImportStat = () => { fs.promises.stat = original; };
    }, archive);
    try {
        for (const close of ['Cancel', 'Escape']) {
            await page.getByRole('button', { name: 'Import .tpz', exact: true }).click();
            const modal = page.getByRole('dialog', { name: 'Import export templates', exact: true });
            await modal.getByRole('button', { name: 'Choose TPZ file', exact: true }).click();
            await modal.getByRole('button', { name: 'Next', exact: true }).click();
            await expect.poll(() => app.evaluate(() => (globalThis as any).templateImportStatStarted)).toBe(true);
            await expect(modal.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
            if (close === 'Cancel') await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
            else await page.keyboard.press('Escape');
            await expect(modal).toBeHidden();
            const staging = path.join(home, '.gd-launcher', 'export-templates', '.staging');
            await expect.poll(async () => fs.readdir(staging).catch(() => [])).toEqual([]);
            const library = await page.evaluate(async () => (window as unknown as BridgeWindow).__di_electron__.invoke('exportTemplates.getImportedTemplates')) as { data: { builds: unknown[] } };
            expect(library.data.builds).toEqual([]);
            await app.evaluate(() => { (globalThis as any).templateImportStatStarted = false; });
        }
    } finally {
        await app.evaluate(() => { (globalThis as any).restoreTemplateImportStat(); delete (globalThis as any).restoreTemplateImportStat; });
    }
});

test('keeps original project files when the final project link cannot be created', async () => {
    const originalEntries = await fs.readdir(path.dirname(local));
    await fs.unlink(local);
    const id = '4.6.stable';
    await fs.mkdir(path.join(local, id), {recursive: true});
    await fs.writeFile(path.join(local, id, 'version.txt'), id);
    await fs.writeFile(path.join(local, id, 'linux_release.x86_64'), 'local template');
    await fs.mkdir(path.join(root, id), {recursive: true});
    await fs.writeFile(path.join(root, id, 'web_release.zip'), 'existing web template');
    await page.getByRole('button', {name:'Refresh', exact:true}).click();
    await openMigrationChoices();
    await app.evaluate(async (_electron, target) => {
        const {promises} = process.getBuiltinModule('node:fs');
        const state = globalThis as typeof globalThis & {templateSymlink?: typeof promises.symlink};
        state.templateSymlink = promises.symlink;
        promises.symlink = async (...args) => {
            if (String(args[1]) === target) throw new Error('Fixture link permission failure');
            return state.templateSymlink?.(...args);
        };
    }, await fs.realpath(local));
    try {
        await page.getByRole('button', {name:'Apply changes'}).click();
        await waitForTemplateStage('error');
        await page.getByTestId('templateMigrationModal').getByRole('button', { name: 'Finish later', exact: true }).click();
        expect((await fs.lstat(local)).isDirectory()).toBe(true);
        expect(await fs.readFile(path.join(local, id, 'linux_release.x86_64'), 'utf8')).toBe('local template');
        expect((await fs.readdir(path.join(root, id))).sort()).toEqual(['linux_release.x86_64', 'version.txt', 'web_release.zip']);
        expect(await fs.readFile(path.join(root, id, 'linux_release.x86_64'), 'utf8')).toBe('local template');
        expect(await fs.readFile(path.join(root, id, 'web_release.zip'), 'utf8')).toBe('existing web template');
        expect(await fs.readdir(path.dirname(local))).toEqual(originalEntries);
    } finally {
        await app.evaluate(async () => {
            const {promises} = process.getBuiltinModule('node:fs');
            const state = globalThis as typeof globalThis & {templateSymlink?: typeof promises.symlink};
            if (state.templateSymlink) promises.symlink = state.templateSymlink;
            delete state.templateSymlink;
        });
    }
});

test('connects an unchanged merge without replacing shared files and keeps the registry controls usable', async () => {
    const originalEntries = await fs.readdir(path.dirname(local));
    const id = '4.6.stable';
    await fs.writeFile(path.join(root, id, 'version.txt'), id);
    await fs.writeFile(path.join(root, id, 'linux_release.x86_64'), 'shared template');
    const before = await fs.stat(path.join(root, id));
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await openMigrationChoices();
    await page.getByRole('button', { name: 'Apply changes' }).click();
    await waitForTemplateStage('complete');
    await page.getByTestId('templateMigrationModal').getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByTestId('templateMigrationModal')).toBeHidden();
    expect((await fs.stat(path.join(root, id))).ino).toBe(before.ino);
    expect(await fs.readFile(path.join(root, id, 'linux_release.x86_64'), 'utf8')).toBe('shared template');
    expect((await fs.lstat(local)).isSymbolicLink()).toBe(true);
    const newEntries = (await fs.readdir(path.dirname(local))).filter(name => !originalEntries.includes(name));
    expect(newEntries).toHaveLength(0);

    const search = page.getByRole('textbox', { name: 'Search installed versions' });
    await search.fill('no-such-version');
    await expect(page.getByText('No matching versions', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Clear search', exact: true }).last().click();
    await expect(search).toHaveValue('');
    await expect(page.getByRole('article', { name: id, exact: true })).toBeVisible();
    const downloadTrigger = page.getByRole('button', {
        name: 'Download templates',
        exact: true,
    });
    const download = page.getByTestId('templateDownloadDrawer');

    await page.setViewportSize({ width: 1024, height: 600 });
    for (const theme of THEMES) {
        await applyTheme(page, theme);
        await page.getByTestId('btnExportTemplates').click();
        await expect(page.getByRole('article', { name: id, exact: true })).toBeVisible();
        const registry = page.getByTestId('exportTemplatesView');
        await expect.poll(() => registry.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        const content = page.getByTestId('exportTemplatesContent');
        const heading = registry.getByRole('heading', { level: 1 });
        const toolbar = page.getByTestId('exportTemplatesToolbar');
        const downloadButton = page.getByRole('button', {
            name: 'Download templates',
            exact: true,
        });
        await content.evaluate((element) => {
            element.scrollTop = 0;
        });
        const toolbarBefore = await toolbar.boundingBox();
        const headingBefore = await heading.boundingBox();
        const searchBefore = await search.boundingBox();
        const downloadBefore = await downloadButton.boundingBox();
        const lastTemplate = registry.getByRole('article').last();
        await lastTemplate.scrollIntoViewIfNeeded();
        await expect(lastTemplate).toBeInViewport({ ratio: 1 });
        await expect
            .poll(() => content.evaluate((element) => element.scrollTop))
            .toBeGreaterThan(0);
        expect(await toolbar.boundingBox()).toEqual(toolbarBefore);
        await expect(toolbar).toBeInViewport({ ratio: 1 });
        expect(await heading.boundingBox()).toEqual(headingBefore);
        expect(await search.boundingBox()).toEqual(searchBefore);
        expect(await downloadButton.boundingBox()).toEqual(downloadBefore);
        await expect(search).toBeInViewport({ ratio: 1 });
        await expect(downloadButton).toBeInViewport({ ratio: 1 });
        expect(await registry.evaluate((element) => element.scrollTop)).toBe(0);
        expect(
            await page.evaluate(
                () => document.documentElement.scrollHeight <= window.innerHeight,
            ),
        ).toBe(true);
        await expect
            .poll(() =>
                content.evaluate(
                    (element) => element.scrollWidth <= element.clientWidth + 1,
                ),
            )
            .toBe(true);
        const removeButton = page.getByRole('button', {
            name: 'Remove 4.6.stable',
            exact: true,
        });
        await removeButton.scrollIntoViewIfNeeded();
        await expect(removeButton).toBeInViewport({ ratio: 1 });
        await page.screenshot({ path: test.info().outputPath(`registry-${theme.name}.png`) });
        await downloadTrigger.click();
        await expect(download).toBeInViewport({ ratio: 1 });
        await expect.poll(() => download.boundingBox()).toEqual({
            x: 324,
            y: 0,
            width: 700,
            height: 600,
        });
        await expect(page.getByTestId('templateVersionPicker')).toBeInViewport({ ratio: 1 });
        await expect(download.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
        await expect.poll(() => download.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        await page.screenshot({ path: test.info().outputPath(`template-selector-${theme.name}.png`) });

        await page.keyboard.press('Escape');
        await expect(download).toBeHidden();
        await expect(downloadTrigger).toBeFocused();

    }

});

/** Replaces the native file dialog while exercising the real import bridge.
 * @param filename - Fixture archive selected by the user.
 */
async function chooseArchive(filename: string) {
    await app.evaluate(({ dialog }, selected) => {
        dialog.showOpenDialog = async () => ({
            canceled: false,
            filePaths: [selected],
        });
    }, filename);
}
/** Waits on the real preload transport after the global completion panel was removed.
 * @param stage - Expected terminal state of the most recently submitted operation.
 */
async function waitForTemplateStage(stage: string): Promise<void> {
    await expect.poll(async () => page.evaluate(async () => {
        const result = await (window as unknown as BridgeWindow).__di_electron__.invoke('exportTemplates.getJobs') as { success: boolean; data: { stage: string }[] };
        return result.data[result.data.length - 1]?.stage;
    })).toBe(stage);
}

/** Opens the migration modal and selects the missing-files policy. */
async function openMigrationChoices(): Promise<void> {
    await page.getByRole('button', { name: /Migrate projects/ }).click();
    const modal = page.getByTestId('templateMigrationModal');
    await modal.getByRole('button', { name: 'Template migration: Choose an option', exact: true }).click();
    await modal.getByRole('option', { name: 'Switch to shared export templates', exact: true }).click();
}


async function installPackageFixtures() {
    await app.evaluate((_electron, packages) => {
        const original = globalThis.fetch;
        const assets = new Map(packages.map((asset) => [asset.url, Buffer.from(asset.bytes, 'base64')]));
        globalThis.fetch = async (input, init) => {
            const archive = assets.get(String(input));
            if (!archive) return original(input, init);
            const headers = { etag: '"fixture"', 'content-length': String(archive.length) };
            if (init?.method === 'HEAD') return new Response(null, { headers });
            const range = new Headers(init?.headers).get('range');
            const match = /bytes=(\d+)-(\d+)/.exec(range ?? '');
            if (!match) throw new Error('Expected a partial template request');
            const start = Number(match[1]);
            const end = Number(match[2]) + 1;
            const state = globalThis as typeof globalThis & { templateHoldUrl?: string; templateHoldPayload?: boolean };
            if (state.templateHoldUrl === String(input) && (!state.templateHoldPayload || end - start > 128 * 1024)) await new Promise<void>((_resolve, reject) => {
                if (init?.signal?.aborted) reject(init.signal.reason);
                else init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
            });
            return new Response(new Uint8Array(archive.subarray(start, end)), { status: 206, headers: { ...headers, 'content-length': String(end - start), 'content-range': `bytes ${start}-${end - 1}/${archive.length}` } });
        };
    }, packages);
}


/** Reopens Electron with the same isolated project and library. */
async function restartTemplatesApp() {
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env: launchEnv });
    await installPackageFixtures();
    page = await getMainWindow(app);
}

/** Opens the current project's template tab through its usual settings entry. */
async function openProjectTemplates() {
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    const drawer = page.getByRole('dialog', { name: 'Template migration Settings', exact: true });
    await drawer.getByTestId('tabProjectSettings_exportTemplates').click();
    return drawer;
}

/** Selects an option through the shared renderer select component.
 * @param drawer - Project settings dialog.
 * @param name - Visible option label.
 */
async function chooseProjectBuild(drawer: ReturnType<Page['getByRole']>, name: string) {
    await drawer.getByRole('button', { name: /^Export template build:/ }).click();
    await page.getByRole('option', { name, exact: true }).click();
}

test('saves local versions as named imports and switches parent and version links on Update', async () => {
    await app.close();
    await fs.rm(path.join(home, 'editor', 'editor_data', 'launcher_export_templates'), { recursive: true, force: true });
    if ((await fs.lstat(local).catch(() => null))?.isSymbolicLink()) await fs.unlink(local);
    else await fs.rm(local, { recursive: true, force: true });
    await fs.mkdir(path.join(local, '4.4.stable'), { recursive: true });
    await fs.mkdir(path.join(local, '4.3.stable.mono'), { recursive: true });
    await fs.writeFile(path.join(local, '4.4.stable', 'web_release.zip'), 'project custom build');
    await fs.writeFile(path.join(local, '4.3.stable.mono', 'linux_release.x86_64'), 'older dotnet');
    const originalTemplate = await fs.stat(path.join(local, '4.4.stable', 'web_release.zip'));
    await fs.mkdir(path.join(local, '__MACOSX'));
    await fs.writeFile(path.join(local, '__MACOSX', '._templates'), 'finder metadata');
    await fs.mkdir(path.join(root, '4.4.stable'), { recursive: true });
    await fs.writeFile(path.join(root, '4.4.stable', 'linux_release.x86_64'), 'shared official');
    const projectsFile = path.join(home, '.gd-launcher', 'projects.json');
    const saved = JSON.parse(await fs.readFile(projectsFile, 'utf8'));
    saved[0].exportTemplateMode = 'separate';
    delete saved[0].exportTemplateBuilds;
    await fs.writeFile(projectsFile, JSON.stringify(saved));
    await restartTemplatesApp();
    await page.getByTestId('btnExportTemplates').click();
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('button', { name: /Migrate projects/ }).click();
    const migration = page.getByTestId('templateMigrationModal');
    await migration.getByRole('button', { name: 'Template migration: Choose an option', exact: true }).click();
    await page.screenshot({ path: test.info().outputPath('template-migration-options.png') });
    await migration.getByRole('option', { name: 'Save as imported templates', exact: true }).click();
    await expect(migration.getByRole('option', { name: 'Keep export templates for this project only', exact: true })).toHaveCount(0);
    // A direct import migration must never connect the active parent to Official.
    await app.evaluate((_electron, active) => {
        const fs = process.getBuiltinModule('node:fs');
        const symlink = fs.promises.symlink;
        fs.promises.symlink = async (target, destination, type) => {
            if (String(destination) === active) throw new Error('unexpected parent link during import migration');
            return symlink(target, destination, type);
        };
        (globalThis as any).restoreMigrationSymlink = () => { fs.promises.symlink = symlink; };
    }, local);
    await migration.getByRole('button', { name: 'Apply changes', exact: true }).click();
    await waitForTemplateStage('complete');
    await app.evaluate(() => { (globalThis as any).restoreMigrationSymlink(); delete (globalThis as any).restoreMigrationSymlink; });
    await migration.getByRole('button', { name: 'Done', exact: true }).click();
    const registryPath = path.join(home, '.gd-launcher', 'export-templates', 'imported-templates.json');
    const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
    const build = registry.builds.find((item: { setId: string }) => item.setId === '4.4.stable');
    expect(registry.builds).toHaveLength(2);
    expect(registry.builds.every((item: { label: string }) => item.label === 'Template migration')).toBe(true);
    expect(registry.defaults).toBeUndefined();
    expect((await fs.lstat(local)).isSymbolicLink()).toBe(false);
    expect(await fs.readdir(local)).toEqual(['4.4.stable']);
    expect((await fs.lstat(path.join(local, '4.4.stable'))).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(path.join(local, '4.4.stable', 'web_release.zip'), 'utf8')).toBe('project custom build');
    expect((await fs.stat(path.join(local, '4.4.stable', 'web_release.zip'))).mode).toBe(originalTemplate.mode);
    expect(await fs.stat(path.join(home, '.gd-launcher', 'export-templates', 'saved-project-migration.json')).catch(() => null)).toBeNull();
    expect(await fs.readFile(path.join(root, '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('shared official');
    expect(await fs.stat(path.join(root, '4.4.stable', 'web_release.zip')).catch(() => null)).toBeNull();
    let drawer = await openProjectTemplates();
    await expect(drawer.getByRole('button', { name: /^Export template build:/ })).toHaveCount(1);
    await expect(drawer.getByRole('list', { name: 'Template files' })).toContainText('web_release.zip');
    await expect(drawer.getByRole('checkbox')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath('project-imported-selection.png') });
    await chooseProjectBuild(drawer, 'Official - 4.4.stable - Standard');
    expect((await fs.lstat(local)).isSymbolicLink()).toBe(false);
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    const discard = page.getByRole('dialog', { name: 'Unsaved changes', exact: true });
    await discard.getByRole('button', { name: 'Discard', exact: true }).click();
    drawer = await openProjectTemplates();
    await expect(drawer.getByRole('button', { name: /^Export template build:/ })).toContainText('Template migration');
    await chooseProjectBuild(drawer, 'Official - 4.4.stable - Standard');
    // Failed parent replacement must keep both the saved choice and the original view.
    await app.evaluate(() => {
        const fs = process.getBuiltinModule('node:fs');
        const rename = fs.promises.rename;
        fs.promises.rename = async (source, destination) => {
            if (String(source).endsWith('.export_templates.launcher-next')) {
                fs.promises.rename = rename;
                throw new Error('fixture link failure');
            }
            return rename(source, destination);
        };
    });
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer.getByRole('alert')).toBeVisible();
    expect(JSON.parse(await fs.readFile(projectsFile, 'utf8'))[0].exportTemplateBuilds['4.4.stable']).toBe(build.id);
    expect(await fs.readFile(path.join(local, '4.4.stable', 'web_release.zip'), 'utf8')).toBe('project custom build');
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).toBeHidden();
    expect((await fs.lstat(local)).isSymbolicLink()).toBe(true);
    expect(await fs.realpath(local)).toBe(await fs.realpath(root));
    drawer = await openProjectTemplates();
    await page.screenshot({ path: test.info().outputPath('project-official-selection.png') });
    await chooseProjectBuild(drawer, 'Template migration - 4.4.stable - Standard');
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).toBeHidden();
    await app.close();
    await restartTemplatesApp();
    drawer = await openProjectTemplates();
    await expect(drawer.getByRole('button', { name: /^Export template build:/ })).toContainText('Template migration');
    expect((await fs.lstat(local)).isSymbolicLink()).toBe(false);
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
});

test('imports do not change projects and Official file edits apply to shared storage', async () => {
    await page.getByTestId('btnExportTemplates').click();
    const archive = path.join(home, 'encrypted.tpz');
    await fs.writeFile(archive, storedZip({ 'templates/version.txt': '4.4.stable', 'templates/web_release.zip': 'new import' }));
    await chooseArchive(archive);
    await page.getByRole('button', { name: 'Import .tpz', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'Import export templates', exact: true });
    await modal.getByRole('button', { name: 'Choose TPZ file', exact: true }).click();
    await modal.getByRole('button', { name: 'Next', exact: true }).click();
    await modal.getByRole('textbox', { name: 'Name', exact: true }).fill('Encrypted');
    await expect(modal.getByRole('checkbox', { name: 'Use as default', exact: true })).toHaveCount(0);
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(modal).toBeHidden();
    expect(await fs.readFile(path.join(local, '4.4.stable', 'web_release.zip'), 'utf8')).toBe('project custom build');
    const drawer = await openProjectTemplates();
    await chooseProjectBuild(drawer, 'Official - 4.4.stable - Standard');
    const section = page.getByTestId('projectExportTemplates');
    await expect(section.getByRole('button', { name: 'Desktop', exact: true })).toHaveAttribute('aria-expanded', 'false');
    await section.getByRole('button', { name: 'Desktop', exact: true }).click();
    await section.getByRole('button', { name: 'Linux', exact: true }).click();
    await section.getByRole('button', { name: 'Linux x86_64', exact: true }).click();
    await section.getByRole('checkbox', { name: 'linux_debug.x86_64', exact: true }).check();
    await chooseProjectBuild(drawer, 'Encrypted - 4.4.stable - Standard');
    await expect(section.getByRole('checkbox', { name: 'linux_debug.x86_64', exact: true })).toBeHidden();
    await chooseProjectBuild(drawer, 'Official - 4.4.stable - Standard');
    await expect(section.getByRole('checkbox', { name: 'linux_debug.x86_64', exact: true })).toBeChecked();
    const originalViewport = page.viewportSize();
    await page.setViewportSize({ width: 1280, height: 500 });
    const selector = drawer.getByRole('button', { name: /^Export template build:/ });
    const selectorBefore = await selector.boundingBox();
    const treeArea = section.getByRole('list', { name: 'Template files', exact: true }).locator('..');
    await treeArea.evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await treeArea.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    expect(await selector.boundingBox()).toEqual(selectorBefore);
    await expect(drawer.getByRole('button', { name: 'Update', exact: true })).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath('project-official-tree-scroll.png') });
    if (originalViewport) await page.setViewportSize(originalViewport);

    expect(await fs.stat(path.join(root, '4.4.stable', 'linux_debug.x86_64')).catch(() => null)).toBeNull();
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).toBeHidden();
    expect(await fs.readFile(path.join(root, '4.4.stable', 'linux_debug.x86_64'), 'utf8')).toBe('official debug');
    expect(await fs.realpath(local)).toBe(await fs.realpath(root));
});

test('saves the chosen imported source without applying a hidden Official draft', async () => {
    const drawer = await openProjectTemplates();
    const section = page.getByTestId('projectExportTemplates');
    await section.getByRole('button', { name: 'Desktop', exact: true }).click();
    await section.getByRole('button', { name: 'Linux', exact: true }).click();
    await section.getByRole('button', { name: 'Linux x86_64', exact: true }).click();
    const checkbox = section.getByRole('checkbox', { name: 'linux_debug.x86_64', exact: true });
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await chooseProjectBuild(drawer, 'Encrypted - 4.4.stable - Standard');
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).toBeHidden();
    expect(await fs.readFile(path.join(root, '4.4.stable', 'linux_debug.x86_64'), 'utf8')).toBe('official debug');
    expect(await fs.readFile(path.join(local, '4.4.stable', 'web_release.zip'), 'utf8')).toBe('new import');
});

test('uses Official for a new editor version and restores remembered imports without hiding missing files', async () => {
    await app.close();
    const projectsFile = path.join(home, '.gd-launcher', 'projects.json');
    const registryPath = path.join(home, '.gd-launcher', 'export-templates', 'imported-templates.json');
    const registry = JSON.parse(await fs.readFile(registryPath, 'utf8'));
    const build = registry.builds.find((item: { label: string; setId: string }) => item.label === 'Template migration' && item.setId === '4.4.stable');
    let saved = JSON.parse(await fs.readFile(projectsFile, 'utf8'));
    saved[0].exportTemplateBuilds['4.4.stable'] = build.id;
    saved[0].release.version = '4.5-stable';
    await fs.writeFile(projectsFile, JSON.stringify(saved));
    await restartTemplatesApp();
    let drawer = await openProjectTemplates();
    await expect(drawer.getByRole('button', { name: /^Export template build:/ })).toContainText('Official - 4.5.stable - Standard');
    expect(await fs.realpath(local)).toBe(await fs.realpath(root));
    await drawer.getByRole('button', { name: /^Export template build:/ }).click();
    await expect(page.getByRole('option')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await app.close();
    saved = JSON.parse(await fs.readFile(projectsFile, 'utf8'));
    saved[0].release.version = '4.4-stable';
    await fs.writeFile(projectsFile, JSON.stringify(saved));
    await restartTemplatesApp();
    drawer = await openProjectTemplates();
    await expect(drawer.getByRole('button', { name: /^Export template build:/ })).toContainText('Template migration');
    expect(await fs.readFile(path.join(local, '4.4.stable', 'web_release.zip'), 'utf8')).toBe('project custom build');
    const files = path.join(home, '.gd-launcher', 'export-templates', 'imported', build.setId, build.directoryName);
    await fs.rename(files, `${files}-unavailable`);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(drawer.getByRole('alert')).toHaveText('Some files for this imported build are missing. Replace the package in Export Templates, or choose another build.');
    expect(JSON.parse(await fs.readFile(projectsFile, 'utf8'))[0].exportTemplateBuilds['4.4.stable']).toBe(build.id);
    await chooseProjectBuild(drawer, 'Official - 4.4.stable - Standard');
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).toBeHidden();
    expect(await fs.realpath(local)).toBe(await fs.realpath(root));
});
