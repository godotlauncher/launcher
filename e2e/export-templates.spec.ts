import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { crc32 } from 'node:zlib';
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
import { getMainWindow } from './splashscreen/getMainWindow';

let app: ElectronApplication;
let page: Page;
let home: string;
let root: string;
let local: string;
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
    app = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`],
        env: Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    });
    const packages = Object.values(catalogue.providers).flatMap((provider) => provider.releases).flatMap((release) => (release.templateAssets ?? []).map((asset) => ({
        url: asset.downloadUrl,
        bytes: storedZip({
            'templates/version.txt': `${release.tag.replace('-', '.')}${asset.flavor === 'dotnet' ? '.mono' : ''}`,
            'templates/linux_debug.x86_64': 'official debug',
            'templates/linux_release.x86_64': 'official release',
            'templates/macos.zip': 'other platform',
        }).toString('base64'),
    })));
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
            const state = globalThis as typeof globalThis & { templateHoldUrl?: string };
            if (state.templateHoldUrl === String(input)) await new Promise<void>((_resolve, reject) => {
                if (init?.signal?.aborted) reject(init.signal.reason);
                else init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
            });
            return new Response(new Uint8Array(archive.subarray(start, end)), { status: 206, headers: { ...headers, 'content-length': String(end - start), 'content-range': `bytes ${start}-${end - 1}/${archive.length}` } });
        };
    }, packages);
    page = await getMainWindow(app);
    await setAppLanguage(page, 'English');
    await page.getByTestId('btnExportTemplates').click();
});
test.afterAll(async () => {
    await app?.close();
    await fs.rm(home, { recursive: true, force: true });
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

test('imports a real archive, merges conflicts, links a project and removes only shared templates', async () => {
    await expect(page).toHaveURL(/#\/export-templates$/);
    await expect(
        page.getByText('No export templates installed', { exact: true }),
    ).toBeVisible();
    const archive = path.join(home, 'Templates caf\u00e9.tpz');
    await fs.writeFile(
        archive,
        storedZip({
            'templates/version.txt': '4.4.stable\n',
            'templates/windows_release_x86_64.exe': 'shared bytes',
            'templates/web_release.zip': 'web template',
        }),
    );
    await chooseArchive(archive);
    await page
        .getByRole('button', { name: 'Import .tpz', exact: true })
        .click();
    await expect(
        page.getByRole('region', { name: 'Review template changes' }),
    ).toBeVisible();
    const apply = page.getByRole('button', { name: 'Apply changes' });
    await expect(apply).toBeEnabled();
    await apply.click();
    await waitForTemplateStage('complete');
    expect(
        await fs.readFile(
            path.join(root, '4.4.stable', 'windows_release_x86_64.exe'),
            'utf8',
        ),
    ).toBe('shared bytes');
    expect(await fs.readFile(archive)).toEqual(
        storedZip({
            'templates/version.txt': '4.4.stable\n',
            'templates/windows_release_x86_64.exe': 'shared bytes',
            'templates/web_release.zip': 'web template',
        }),
    );
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
    await page.getByRole('button', { name: 'Review and connect' }).click();
    await expect(
        page.getByText('Ready for review', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('combobox')).toHaveCount(1);
    await expect(apply).toBeDisabled();
    await page.getByRole('combobox').selectOption('incoming');
    await apply.click();
    await waitForTemplateStage('complete');
    expect((await fs.lstat(local)).isSymbolicLink()).toBe(true);
    if (process.platform !== 'win32')
        expect((await fs.stat(path.join(root, '4.4.stable', 'version.txt'))).mode & 0o777).toBe(0o600);
    expect(
        await fs.readFile(
            path.join(root, '4.4.stable', 'windows_release_x86_64.exe'),
            'utf8',
        ),
    ).toBe('project custom bytes');
    expect(
        await fs.readFile(
            path.join(root, '4.4.stable', 'web_release.zip'),
            'utf8',
        ),
    ).toBe('web template');
    expect(await fs.readdir(path.join(home, 'editor', 'editor_data'))).toEqual([
        'export_templates',
    ]);
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

test('rejects changed files after review and unsafe archives without replacing existing files', async () => {
    const archive = path.join(home, 'Templates caf\u00e9.tpz');
    await chooseArchive(archive);
    await page
        .getByRole('button', { name: 'Import .tpz', exact: true })
        .click();
    await expect(
        page.getByText('Ready for review', { exact: true }),
    ).toBeVisible();
    await fs.mkdir(path.join(root, '4.4.stable'), { recursive: true });
    await fs.writeFile(
        path.join(root, '4.4.stable', 'new-file'),
        'external change',
    );
    await page.getByRole('button', { name: 'Apply changes' }).click();
    await waitForTemplateStage('error');
    expect(
        await fs.readFile(path.join(root, '4.4.stable', 'new-file'), 'utf8'),
    ).toBe('external change');
    const unsafe = path.join(home, 'unsafe.tpz');
    await fs.writeFile(
        unsafe,
        storedZip({
            '../outside': 'bad',
            'templates/version.txt': '4.4.stable',
        }),
    );
    await chooseArchive(unsafe);
    await page
        .getByRole('button', { name: 'Import .tpz', exact: true })
        .click();
    await waitForTemplateStage('error');
    await expect(
        fs.stat(
            path.join(
                home,
                '.gd-launcher',
                'godot',
                '.godot-launcher-template-work',
                'outside',
            ),
        ),
    ).rejects.toThrow();
    expect(
        await fs.readFile(path.join(root, '4.4.stable', 'new-file'), 'utf8'),
    ).toBe('external change');
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
    const fingerprint = (contents: string) =>
        createHash('sha256')
            .update(
                JSON.stringify([
                    [
                        'version.txt',
                        Buffer.byteLength(contents),
                        createHash('sha256').update(contents).digest('hex'),
                    ],
                ]),
            )
            .digest('hex');
    await fs.writeFile(
        path.join(work, 'journal.json'),
        JSON.stringify({
            phase: 'committing',
            sets: [
                {
                    id: set,
                    existed: true,
                    before: fingerprint('original'),
                    after: fingerprint('replacement'),
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
        page.getByRole('article', { name: set, exact: true }).getByText(
            'Files changed since review. Refresh and review them again before continuing.',
            { exact: true },
        ),
    ).toBeVisible();
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
});

test('cancels a reviewed package, keeps editions separate and refuses damaged contents', async () => {
    const archive = path.join(home, 'mono.tpz');
    const contents = storedZip({
        'templates/version.txt': '4.4.stable.mono\n',
        'templates/windows_release_x86_64.exe': 'dotnet template',
    });
    await fs.writeFile(archive, contents);
    await chooseArchive(archive);
    await page
        .getByRole('button', { name: 'Import .tpz', exact: true })
        .click();
    await expect(
        page.getByText('Ready for review', { exact: true }),
    ).toBeVisible();
    await page
        .getByRole('article', { name: '4.4.stable.mono', exact: true })
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
    await expect(
        page.getByText('Operation cancelled', { exact: true }),
    ).toBeHidden();
    await expect(
        page.getByRole('region', { name: 'Review template changes' }),
    ).toBeHidden();
    await expect(fs.stat(path.join(root, '4.4.stable.mono'))).rejects.toThrow();
    await page
        .getByRole('button', { name: 'Import .tpz', exact: true })
        .click();
    await expect(
        page.getByText('Ready for review', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Apply changes' }).click();
    await waitForTemplateStage('complete');
    expect(
        await fs.readFile(
            path.join(root, '4.4.stable.mono', 'windows_release_x86_64.exe'),
            'utf8',
        ),
    ).toBe('dotnet template');
    expect(
        await fs.readFile(path.join(root, '4.4.stable', 'new-file'), 'utf8'),
    ).toBe('external change');
    const corrupted = Buffer.from(contents);
    corrupted[corrupted.indexOf(Buffer.from('dotnet template'))] ^= 1;
    await fs.writeFile(archive, corrupted);
    await page
        .getByRole('button', { name: 'Import .tpz', exact: true })
        .click();
    await waitForTemplateStage('error');
    await expect(
        page.getByText(
            'The template archive is damaged or could not be read.',
            { exact: true },
        ),
    ).toBeVisible();
    expect(
        await fs.readFile(
            path.join(root, '4.4.stable.mono', 'windows_release_x86_64.exe'),
            'utf8',
        ),
    ).toBe('dotnet template');
});

test('restores both collections when the final project link cannot be created', async () => {
    await fs.unlink(local);
    const id = '4.6.stable';
    await fs.mkdir(path.join(local, id), {recursive: true});
    await fs.writeFile(path.join(local, id, 'version.txt'), id);
    await fs.writeFile(path.join(local, id, 'linux_release.x86_64'), 'local template');
    await fs.mkdir(path.join(root, id), {recursive: true});
    await fs.writeFile(path.join(root, id, 'web_release.zip'), 'existing web template');
    await page.getByRole('button', {name:'Refresh', exact:true}).click();
    await page.getByRole('button', {name:'Review and connect', exact:true}).click();
    await expect(page.getByText('Ready for review', {exact:true})).toBeVisible();
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
        expect((await fs.lstat(local)).isDirectory()).toBe(true);
        expect(await fs.readFile(path.join(local, id, 'linux_release.x86_64'), 'utf8')).toBe('local template');
        expect(await fs.readdir(path.join(root, id))).toEqual(['web_release.zip']);
        expect(await fs.readFile(path.join(root, id, 'web_release.zip'), 'utf8')).toBe('existing web template');
        expect(await fs.readdir(path.dirname(local))).toEqual(['export_templates']);
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
    const id = '4.6.stable';
    await fs.writeFile(path.join(root, id, 'version.txt'), id);
    await fs.writeFile(path.join(root, id, 'linux_release.x86_64'), 'shared template');
    const before = await fs.stat(path.join(root, id));
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByRole('button', { name: 'Review and connect', exact: true }).click();
    await expect(page.getByText('Ready for review', { exact: true })).toBeVisible();
    await page.getByRole('combobox').selectOption('shared');
    await page.getByRole('button', { name: 'Apply changes' }).click();
    await waitForTemplateStage('complete');
    expect((await fs.stat(path.join(root, id))).ino).toBe(before.ino);
    expect(await fs.readFile(path.join(root, id, 'linux_release.x86_64'), 'utf8')).toBe('shared template');
    expect((await fs.lstat(local)).isSymbolicLink()).toBe(true);
    expect(await fs.readdir(path.dirname(local))).toEqual(['export_templates']);

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

test('assesses templates through preload and remembers separate management without moving files', async () => {
    const existing = await fs.lstat(local).catch(() => null);
    if (existing?.isSymbolicLink()) await fs.unlink(local);
    const localSet = path.join(local, '4.4.stable');
    const sharedSet = path.join(root, '4.4.stable');
    await fs.mkdir(localSet, { recursive: true });
    await fs.mkdir(sharedSet, { recursive: true });
    await fs.writeFile(path.join(localSet, 'linux_release.x86_64'), 'private build');
    await fs.writeFile(path.join(sharedSet, 'linux_release.x86_64'), 'shared build');
    const result = await page.evaluate(async (projectPath) => {
        const bridge = window.__di_electron__!;
        const before = await bridge.invoke('exportTemplates.getMigrationAssessment');
        const inspected = await bridge.invoke('exportTemplates.inspectProjectTemplates', projectPath);
        const saved = await bridge.invoke('exportTemplates.keepProjectTemplatesSeparate', projectPath);
        const after = await bridge.invoke('exportTemplates.getMigrationAssessment');
        return { before, inspected, saved, after };
    }, path.join(home, 'project'));
    expect(result.before).toMatchObject({ success: true, data: { pendingCount: 1 } });
    expect(result.inspected).toMatchObject({
        success: true,
        data: { compared: true, provenance: 'unverified', files: expect.arrayContaining([
            expect.objectContaining({ path: '4.4.stable/linux_release.x86_64', state: 'different' }),
        ]) },
    });
    expect(result.saved).toMatchObject({ success: true, data: { state: 'separate', pending: false } });
    expect(result.after).toMatchObject({ success: true, data: { pendingCount: 0 } });
    const stored = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'projects.json'), 'utf8'));
    expect(stored[0].exportTemplateMode).toBe('separate');
    expect((await fs.lstat(local)).isSymbolicLink()).toBe(false);
    expect(await fs.readFile(path.join(localSet, 'linux_release.x86_64'), 'utf8')).toBe('private build');
    expect(await fs.readFile(path.join(sharedSet, 'linux_release.x86_64'), 'utf8')).toBe('shared build');
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
/** Builds a small ZIP with regular files for archive and transaction scenarios.
 * @param files - Archive paths and UTF-8 contents.
 */
function storedZip(files: Record<string, string>): Buffer {
    const localRecords: Buffer[] = [];
    const centralRecords: Buffer[] = [];
    let offset = 0;
    for (const [filename, text] of Object.entries(files)) {
        const name = Buffer.from(filename);
        const data = Buffer.from(text);
        const checksum = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50);
        local.writeUInt16LE(20, 4);
        local.writeUInt32LE(checksum, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        localRecords.push(Buffer.concat([local, name, data]));
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50);
        central.writeUInt16LE(0x0314, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt32LE(checksum, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
        central.writeUInt32LE(offset, 42);
        centralRecords.push(Buffer.concat([central, name]));
        offset += local.length + name.length + data.length;
    }
    const directory = Buffer.concat(centralRecords);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(centralRecords.length, 8);
    end.writeUInt16LE(centralRecords.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...localRecords, directory, end]);
}

/** Waits on the real preload transport after the global completion panel was removed.
 * @param stage - Expected terminal state of the most recently submitted operation.
 */
async function waitForTemplateStage(stage: string): Promise<void> {
    await expect.poll(async () => page.evaluate(async () => {
        const result = await window.__di_electron__?.invoke('exportTemplates.getJobs') as { success: boolean; data: { stage: string }[] };
        return result.data[result.data.length - 1]?.stage;
    })).toBe(stage);
}
