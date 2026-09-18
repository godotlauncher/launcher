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
let launchEnv: Record<string, string>;
let packages: { url: string; bytes: string }[];
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
    await expect(page.getByTestId('templateMigrationModal').getByRole('combobox')).toHaveCount(1);
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

test('rejects changed files after review and unsafe archives without replacing existing files', async () => {
    const archive = path.join(home, 'Templates caf\u00e9.tpz');
    await chooseArchive(archive);
    await page
        .getByRole('button', { name: 'Import .tpz', exact: true })
        .click();
    await expect(
        page.getByRole('status').filter({ hasText: 'Ready for review' }).first(),
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
        page.getByRole('status').filter({ hasText: 'Ready for review' }).first(),
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
        page.getByRole('status').filter({ hasText: 'Ready for review' }).first(),
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

/** Opens the migration modal and selects the missing-files policy. */
async function openMigrationChoices(): Promise<void> {
    await page.getByRole('button', { name: /Migrate projects/ }).click();
    const modal = page.getByTestId('templateMigrationModal');
    await modal.getByRole('combobox', { name: 'Template migration: Choose an option', exact: true }).selectOption('share-project');
}

test('manages separate project files and reconnects with the chosen merge policy', async () => {
    await fs.rm(path.join(root, '4.4.stable'), { recursive: true, force: true });
    await fs.mkdir(path.join(root, '4.4.stable'));
    await fs.writeFile(path.join(root, '4.4.stable', 'linux_release.x86_64'), 'shared build');
    if ((await fs.lstat(local).catch(() => null))?.isSymbolicLink()) await fs.unlink(local);
    else await fs.rm(local, { recursive: true, force: true });
    await fs.mkdir(path.join(local, '4.4.stable'), { recursive: true });
    await fs.writeFile(path.join(local, '4.4.stable', 'linux_release.x86_64'), 'private build');
    await page.evaluate(async projectPath => window.__di_electron__!.invoke('exportTemplates.keepProjectTemplatesSeparate', projectPath), path.join(home, 'project'));
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    await page.getByTestId('tabProjectSettings_exportTemplates').click();
    const section = page.getByTestId('projectExportTemplates');
    await expect(section.getByRole('heading', { name: 'Using dedicated export templates' })).toBeVisible();
    await section.getByRole('button', { name: 'Switch to shared export templates', exact: true }).click();
    await section.getByRole('combobox').selectOption('use-shared');
    await section.getByRole('button', { name: 'Switch to shared', exact: true }).click();
    await expect(section.getByRole('heading', { name: 'Using shared export templates' })).toBeVisible();
    await expect(section).toHaveAttribute('aria-busy', 'false');
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('project-shared-templates-manage.png') });
    await section.getByRole('button', { name: 'Manage', exact: true }).click();
    await expect(page.getByTestId('templateDownloadDrawer')).toBeVisible();
    await expect(page.getByTestId('templateDownloadDrawer')).toHaveAccessibleName('Manage templates 4.4.stable - Standard');
    await page.keyboard.press('Escape');
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    await page.getByTestId('tabProjectSettings_exportTemplates').click();
    await section.getByRole('button', { name: 'Use dedicated export templates', exact: true }).click();
    await expect(section.getByRole('heading', { name: 'Using dedicated export templates' })).toBeVisible();
    expect((await fs.lstat(local)).isSymbolicLink()).toBe(false);
    expect(await fs.readFile(path.join(local, '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('shared build');
    expect(await fs.readdir(local)).toEqual(['4.4.stable']);
    await expect(section.getByRole('button', { name: 'Linux', exact: true })).toBeVisible();
    await section.getByRole('button', { name: 'Linux', exact: true }).click();
    await section.getByRole('button', { name: 'Linux x86_64', exact: true }).click();
    await section.getByRole('checkbox', { name: 'linux_release.x86_64', exact: true }).uncheck();
    await section.getByRole('checkbox', { name: 'linux_debug.x86_64', exact: true }).check();
    await page.screenshot({ path: test.info().outputPath('project-local-templates.png') });
    await page.getByRole('button', { name: 'Update', exact: true }).click();
    await expect.poll(async () => fs.readFile(path.join(local, '4.4.stable', 'linux_debug.x86_64'), 'utf8').catch(() => '')).toBe('official debug');
    await expect(fs.stat(path.join(local, '4.4.stable', 'linux_release.x86_64'))).rejects.toThrow();
    expect(await fs.readFile(path.join(root, '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('shared build');
    await expect(fs.stat(path.join(root, '4.4.stable', 'linux_debug.x86_64'))).rejects.toThrow();
    await expect(section).toBeHidden();
    await page.getByTestId('btnProjectSettings').click();
    await page.getByTestId('tabProjectSettings_exportTemplates').click();
    await expect(section.getByRole('button', { name: 'Switch to shared export templates', exact: true })).toBeEnabled();
    await section.getByRole('button', { name: 'Switch to shared export templates', exact: true }).click();
    await section.getByRole('combobox').selectOption('share-project');
    await page.screenshot({ path: test.info().outputPath('project-reconnect-templates.png') });
    await section.getByRole('button', { name: 'Switch to shared', exact: true }).click();
    await expect(section.getByRole('heading', { name: 'Using shared export templates' })).toBeVisible();
    expect((await fs.lstat(local)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(path.join(root, '4.4.stable', 'linux_debug.x86_64'), 'utf8')).toBe('official debug');
    expect(await fs.readFile(path.join(root, '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('shared build');
    const saved = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'projects.json'), 'utf8'));
    expect(saved[0].exportTemplateMode).toBe('shared');
    await page.screenshot({ path: test.info().outputPath('project-shared-templates.png') });
    await page.keyboard.press('Escape');
});

test('detaches an empty shared version and reconnects without requiring a file decision', async () => {
    await fs.rm(path.join(root, '4.4.stable'), { recursive: true });
    await page.getByTestId('btnProjectSettings').click();
    await page.getByTestId('tabProjectSettings_exportTemplates').click();
    let section = page.getByTestId('projectExportTemplates');
    await expect(section.getByText('No export templates installed for this Godot version.')).toBeVisible();
    await section.getByRole('button', { name: 'Use dedicated export templates', exact: true }).click();
    await expect(section.getByRole('heading', { name: 'Using dedicated export templates' })).toBeVisible();
    expect(await fs.readdir(local)).toEqual([]);
    await app.close();
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env: launchEnv });
    await installPackageFixtures();
    page = await getMainWindow(app);
    section = page.getByTestId('projectExportTemplates');
    await page.getByTestId('btnProjectSettings').click();
    await page.getByTestId('tabProjectSettings_exportTemplates').click();
    await expect(section.getByRole('heading', { name: 'Using dedicated export templates' })).toBeVisible();
    await section.getByRole('button', { name: 'Switch to shared export templates', exact: true }).click();
    await expect(section.getByRole('heading', { name: 'Using shared export templates' })).toBeVisible();
    await expect(section.getByRole('combobox')).toHaveCount(0);
    expect((await fs.lstat(local)).isSymbolicLink()).toBe(true);
});

/** Installs deterministic template responses in the Electron main process. */
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

test('rolls back a failed detachment and lets the project retry', async () => {
    const section = page.getByTestId('projectExportTemplates');
    const target = path.join(await fs.realpath(path.dirname(local)), 'export_templates');
    await app.evaluate(async (_electron, localPath) => {
        const { promises } = process.getBuiltinModule('node:fs');
        const state = globalThis as typeof globalThis & { templateRename?: typeof promises.rename };
        state.templateRename = promises.rename;
        promises.rename = async (source, destination) => {
            if (String(destination) === localPath && String(source).includes('.launcher-new-')) throw new Error('Fixture swap failure');
            return state.templateRename!(source, destination);
        };
    }, target);
    try {
        await section.getByRole('button', { name: 'Use dedicated export templates', exact: true }).click();
        await expect(section.getByRole('alert')).toBeVisible();
        expect((await fs.lstat(local)).isSymbolicLink()).toBe(true);
        expect(await fs.readdir(path.dirname(local))).toEqual(['export_templates']);
    } finally {
        await app.evaluate(async () => {
            const { promises } = process.getBuiltinModule('node:fs');
            const state = globalThis as typeof globalThis & { templateRename?: typeof promises.rename };
            if (state.templateRename) promises.rename = state.templateRename;
            delete state.templateRename;
        });
    }
    await section.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(section.getByRole('heading', { name: 'Using dedicated export templates' })).toBeVisible();
    expect((await fs.lstat(local)).isDirectory()).toBe(true);
    await expect(section.getByRole('alert')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(section).toBeHidden();
});

test('removes one selected file without replacing the files kept in that version', async () => {
    const id = '4.8.stable';
    const directory = path.join(root, id);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'keep.zip'), 'keep unchanged');
    await fs.writeFile(path.join(directory, 'remove.zip'), 'remove');
    const before = await fs.stat(path.join(directory, 'keep.zip'));
    const result = await page.evaluate(async setId => {
        const bridge = window.__di_electron__!;
        const loaded = await bridge.invoke('exportTemplates.getLocalPackage', setId) as { data: { token: string } };
        return bridge.invoke('exportTemplates.savePackage', loaded.data.token, ['keep.zip']);
    }, id);
    expect(result).toMatchObject({ success: true });
    await waitForTemplateStage('complete');
    const after = await fs.stat(path.join(directory, 'keep.zip'));
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(await fs.readdir(directory)).toEqual(['keep.zip']);
});

test('preserves unsaved project export template choices until they are explicitly discarded', async () => {
    if ((await fs.lstat(local).catch(() => null))?.isSymbolicLink()) await fs.unlink(local);
    else await fs.rm(local, { recursive: true, force: true });
    await fs.mkdir(path.join(local, '4.4.stable'), { recursive: true });
    await fs.writeFile(path.join(local, '4.4.stable', 'linux_release.x86_64'), 'private build');
    await page.evaluate(async projectPath => window.__di_electron__!.invoke('exportTemplates.keepProjectTemplatesSeparate', projectPath), path.join(home, 'project'));
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    await page.getByTestId('tabProjectSettings_exportTemplates').click();
    const section = page.getByTestId('projectExportTemplates');
    await section.getByRole('button', { name: 'Linux', exact: true }).click();
    await section.getByRole('button', { name: 'Linux x86_64', exact: true }).click();
    const file = section.getByRole('checkbox', { name: 'linux_release.x86_64', exact: true });
    await file.uncheck();
    await expect(section.getByText('Removed export template files will no longer be available to this project.')).toBeVisible();
    await expect(section.getByText('Removed files will no longer be available to projects using these shared templates.')).toHaveCount(0);
    await page.getByTestId('tabProjectSettings_project').click();
    await page.getByTestId('tabProjectSettings_exportTemplates').click();
    await expect(file).not.toBeChecked();
    const confirmation = page.getByRole('dialog', { name: 'Unsaved changes', exact: true });
    const drawer = page.getByRole('dialog', { name: 'Template migration Settings', exact: true });
    for (const close of [
        () => drawer.getByRole('button', { name: 'Close', exact: true }).click(),
        () => drawer.getByRole('button', { name: 'Close drawer', exact: true }).click(),
        () => page.keyboard.press('Escape'),
        () => page.getByTestId('drawerBackdrop').click({ position: { x: 10, y: 10 } }),
    ]) {
        await close();
        await expect(confirmation).toBeVisible();
        await confirmation.getByRole('button', { name: 'Back', exact: true }).click();
        await expect(confirmation).toBeHidden();
        await expect(file).not.toBeChecked();
    }
    await page.getByTestId('tabProjectSettings_project').click();
    await page.keyboard.press('Escape');
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByTestId('tabProjectSettings_project')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('tabProjectSettings_exportTemplates').click();
    await expect(file).not.toBeChecked();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: test.info().outputPath('project-template-unsaved.png') });
    await confirmation.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(drawer).toBeHidden();
    expect(await fs.readFile(path.join(local, '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('private build');
    await page.getByTestId('btnProjectSettings').click();
    await page.getByTestId('tabProjectSettings_exportTemplates').click();
    await section.getByRole('button', { name: 'Linux', exact: true }).click();
    await section.getByRole('button', { name: 'Linux x86_64', exact: true }).click();
    await expect(file).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(confirmation).toBeHidden();
});

test('reviews every dedicated version before switching to shared', async () => {
    if ((await fs.lstat(local).catch(() => null))?.isSymbolicLink()) await fs.unlink(local);
    else await fs.rm(local, { recursive: true, force: true });
    for (const id of ['4.4.stable', '4.3.stable', '4.3.stable.mono', '4.2.stable']) {
        await fs.mkdir(path.join(local, id), { recursive: true });
    }
    await fs.writeFile(path.join(local, '4.4.stable', 'linux_release.x86_64'), 'dedicated current');
    await fs.writeFile(path.join(local, '4.4.stable', 'web_release.zip'), 'current web to merge');
    await fs.writeFile(path.join(local, '4.3.stable', 'private.zip'), 'discard this version');
    await fs.writeFile(path.join(local, '4.3.stable.mono', 'custom.zip'), 'older dotnet to merge');
    await fs.writeFile(path.join(local, '4.3.stable.mono', 'web_release.zip'), 'dedicated dotnet web');
    for (const id of ['4.4.stable', '4.3.stable', '4.3.stable.mono']) {
        await fs.rm(path.join(root, id), { recursive: true, force: true });
        await fs.mkdir(path.join(root, id), { recursive: true });
    }
    await fs.writeFile(path.join(root, '4.4.stable', 'linux_release.x86_64'), 'shared current wins');
    await fs.writeFile(path.join(root, '4.3.stable', 'keep.zip'), 'shared discarded version stays');
    await fs.writeFile(path.join(root, '4.3.stable.mono', 'web_release.zip'), 'shared dotnet wins');
    await page.evaluate(async projectPath => window.__di_electron__!.invoke('exportTemplates.keepProjectTemplatesSeparate', projectPath), path.join(home, 'project'));
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    const drawer = page.getByRole('dialog', { name: 'Template migration Settings', exact: true });
    await drawer.getByTestId('tabProjectSettings_exportTemplates').click();
    const section = drawer.getByTestId('projectExportTemplates');
    await section.getByRole('button', { name: 'Switch to shared export templates', exact: true }).click();
    const current = section.getByRole('combobox', { name: '4.4.stable - Standard: export template action', exact: true });
    const older = section.getByRole('combobox', { name: '4.3.stable - Standard: export template action', exact: true });
    const dotnet = section.getByRole('combobox', { name: '4.3.stable - .NET: export template action', exact: true });
    await expect(section.getByRole('combobox')).toHaveCount(3);
    for (const select of [current, older, dotnet]) await expect(select).toHaveValue('share-project');
    await older.selectOption('use-shared');
    await section.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect((await fs.lstat(local)).isDirectory()).toBe(true);
    expect(await fs.readFile(path.join(local, '4.3.stable', 'private.zip'), 'utf8')).toBe('discard this version');
    await section.getByRole('button', { name: 'Switch to shared export templates', exact: true }).click();
    await expect(older).toHaveValue('share-project');
    await older.selectOption('use-shared');
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('project-switch-all-versions.png') });
    await section.getByRole('button', { name: 'Switch to shared', exact: true }).click();
    await expect(section.getByRole('heading', { name: 'Using shared export templates' })).toBeVisible();
    await expect(section).toHaveAttribute('aria-busy', 'false');
    expect((await fs.lstat(local)).isSymbolicLink()).toBe(true);
    expect(await fs.readFile(path.join(root, '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('shared current wins');
    expect(await fs.readFile(path.join(root, '4.4.stable', 'web_release.zip'), 'utf8')).toBe('current web to merge');
    expect(await fs.readdir(path.join(root, '4.3.stable'))).toEqual(['keep.zip']);
    expect(await fs.readFile(path.join(root, '4.3.stable.mono', 'custom.zip'), 'utf8')).toBe('older dotnet to merge');
    expect(await fs.readFile(path.join(root, '4.3.stable.mono', 'web_release.zip'), 'utf8')).toBe('shared dotnet wins');
    const jobs = await page.evaluate(async () => window.__di_electron__!.invoke('exportTemplates.getJobs')) as { data: { setIds: string[]; stage: string }[] };
    expect(jobs.data.find(job => job.stage === 'complete')?.setIds).toEqual(expect.arrayContaining(['4.4.stable', '4.3.stable', '4.3.stable.mono']));
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
});

test('confirms per-version deletion and applies it only with Update', async () => {
    if ((await fs.lstat(local).catch(() => null))?.isSymbolicLink()) await fs.unlink(local);
    else await fs.rm(local, { recursive: true, force: true });
    await fs.mkdir(path.join(local, '4.4.stable'), { recursive: true });
    await fs.mkdir(path.join(local, '4.3.stable', 'custom'), { recursive: true });
    await fs.mkdir(path.join(root, '4.3.stable'), { recursive: true });
    await fs.writeFile(path.join(local, '4.4.stable', 'linux_release.x86_64'), 'current private build');
    await fs.writeFile(path.join(local, '4.3.stable', 'custom', 'encrypted.zip'), 'old custom build');
    await fs.writeFile(path.join(root, '4.3.stable', 'web_release.zip'), 'shared build');
    await page.evaluate(async projectPath => window.__di_electron__!.invoke('exportTemplates.keepProjectTemplatesSeparate', projectPath), path.join(home, 'project'));
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    const drawer = page.getByRole('dialog', { name: 'Template migration Settings', exact: true });
    await drawer.getByTestId('tabProjectSettings_exportTemplates').click();
    const section = drawer.getByTestId('projectExportTemplates');
    const oldVersion = section.getByRole('article', { name: '4.3.stable', exact: true });
    const currentVersion = section.getByRole('article', { name: '4.4.stable', exact: true });
    const removeOld = oldVersion.getByRole('button', { name: 'Delete export templates for 4.3.stable - Standard', exact: true });
    const confirmation = page.getByRole('dialog', { name: /^Delete .+ export templates\?$/ });
    await removeOld.click();
    await expect(confirmation).toContainText('4.3.stable - Standard');
    await expect(confirmation).toContainText('when you press Update');
    await expect(confirmation.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(confirmation.getByRole('button', { name: 'Delete', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(confirmation).toBeHidden();
    await expect(drawer).toBeVisible();
    await expect(removeOld).toBeFocused();
    await expect(drawer.getByRole('button', { name: 'Update', exact: true })).toBeDisabled();

    await removeOld.click();
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('delete-project-version-confirmation.png') });
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(confirmation).toBeHidden();
    await expect(oldVersion.getByText('Will be deleted on Update')).toBeVisible();
    await expect(oldVersion.locator('button[aria-expanded]')).toBeFocused();
    await expect(oldVersion.getByRole('img', { name: 'Unsaved changes', exact: true })).toBeVisible();
    expect(await fs.readFile(path.join(local, '4.3.stable', 'custom', 'encrypted.zip'), 'utf8')).toBe('old custom build');
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('dialog', { name: 'Unsaved changes', exact: true }).getByRole('button', { name: 'Discard', exact: true }).click();
    await page.getByTestId('btnProjectSettings').click();
    await drawer.getByTestId('tabProjectSettings_exportTemplates').click();
    await expect(oldVersion.getByText('Will be deleted on Update')).toBeHidden();
    await expect(removeOld).toBeEnabled();
    await currentVersion.getByRole('button', { name: 'Linux', exact: true }).click();
    await currentVersion.getByRole('button', { name: 'Linux x86_64', exact: true }).click();
    const addition = currentVersion.getByRole('checkbox', { name: 'linux_debug.x86_64', exact: true });
    await addition.check();
    await currentVersion.getByRole('button', { name: 'Delete export templates for 4.4.stable - Standard', exact: true }).click();
    await expect(confirmation).toContainText("This project's selected editor will have no export templates for this version.");
    await expect(confirmation).toContainText('Pending additions for this version will also be discarded.');
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(addition).toBeChecked();
    await removeOld.click();
    await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(confirmation).toBeHidden();
    await expect(addition).toBeChecked();
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('delete-project-version-pending.png') });
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).toBeHidden();
    expect(await fs.stat(path.join(local, '4.3.stable')).catch(() => null)).toBeNull();
    expect(await fs.readFile(path.join(local, '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('current private build');
    expect(await fs.readFile(path.join(local, '4.4.stable', 'linux_debug.x86_64'), 'utf8')).toBe('official debug');
    expect(await fs.readFile(path.join(root, '4.3.stable', 'web_release.zip'), 'utf8')).toBe('shared build');
    await page.getByTestId('btnProjectSettings').click();
    await drawer.getByTestId('tabProjectSettings_exportTemplates').click();
    await expect(oldVersion).toBeHidden();
    await expect(currentVersion).toBeVisible();
    await drawer.getByRole('button', { name: 'Close', exact: true }).click();
});

test('updates version-bound template selections and the editor together from the side menu', async () => {
    if ((await fs.lstat(local).catch(() => null))?.isSymbolicLink()) await fs.unlink(local);
    else await fs.rm(local, { recursive: true, force: true });
    await fs.mkdir(path.join(local, '4.4.stable'), { recursive: true });
    await fs.writeFile(path.join(local, '4.4.stable', 'linux_release.x86_64'), 'remove from old version');
    await fs.writeFile(path.join(local, '4.4.stable', 'custom.zip'), 'keep this custom file');
    await page.evaluate(async projectPath => window.__di_electron__!.invoke('exportTemplates.keepProjectTemplatesSeparate', projectPath), path.join(home, 'project'));
    const saved = JSON.parse(await fs.readFile(path.join(home, '.gd-launcher', 'projects.json'), 'utf8'))[0];
    await app.evaluate(({ ipcMain }, { saved, local }) => {
        const next = { ...saved.release, version: '4.5-stable', name: '4.5-stable', version_number: 4.5, valid: true, editor_path: saved.launch_path, mono: false };
        for (const channel of ['editorInstalls.getInstalledEditors', 'editorInstalls.revalidateInstalledEditors']) {
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, () => ({ success: true, data: [next] }));
        }
        ipcMain.removeHandler('projects.setProjectEditor');
        ipcMain.handle('projects.setProjectEditor', async (_event, project, release) => {
            const fs = process.getBuiltinModule('node:fs');
            const path = process.getBuiltinModule('node:path');
            (globalThis as typeof globalThis & { templateEditorSave?: unknown }).templateEditorSave = {
                version: release.version,
                oldFileRemoved: !fs.existsSync(path.join(local, '4.4.stable', 'linux_release.x86_64')),
                newFileAdded: fs.existsSync(path.join(local, '4.5.stable', 'linux_debug.x86_64')),
            };
            return { success: true, data: { success: true, projects: [{ ...project, release, version: release.version, version_number: release.version_number }] } };
        });
    }, { saved, local });
    await page.reload();
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    const drawer = page.getByRole('dialog', { name: 'Template migration Settings', exact: true });
    await page.getByTestId('tabProjectSettings_exportTemplates').click();
    const section = page.getByTestId('projectExportTemplates');
    const oldVersion = section.getByRole('article', { name: '4.4.stable', exact: true });
    await oldVersion.getByRole('button', { name: 'Linux', exact: true }).click();
    await oldVersion.getByRole('button', { name: 'Linux x86_64', exact: true }).click();
    await oldVersion.getByRole('checkbox', { name: 'linux_release.x86_64', exact: true }).uncheck();
    await expect(drawer.getByRole('button', { name: 'Update', exact: true })).toBeEnabled();
    await page.getByTestId('tabProjectSettings_project').click();
    await drawer.getByTestId('selectProjectGodotEditor').click();
    await drawer.getByRole('option', { name: /4.5-stable/ }).click();
    await expect(drawer.getByRole('button', { name: 'Update', exact: true })).toBeEnabled();
    await page.getByTestId('tabProjectSettings_exportTemplates').click();
    const newVersion = section.getByRole('article', { name: '4.5.stable', exact: true });
    await expect(newVersion.getByText('Selected editor', { exact: true })).toBeVisible();
    await expect(oldVersion.getByRole('checkbox', { name: 'linux_release.x86_64', exact: true })).not.toBeChecked();
    await newVersion.getByRole('button').first().click();
    await newVersion.getByRole('button', { name: 'Linux', exact: true }).click();
    await newVersion.getByRole('button', { name: 'Linux x86_64', exact: true }).click();
    await newVersion.getByRole('checkbox', { name: 'linux_debug.x86_64', exact: true }).check();
    await page.screenshot({ path: test.info().outputPath('project-version-collection.png') });
    await page.getByTestId('tabProjectSettings_project').click();
    await expect(drawer.getByRole('button', { name: 'Update', exact: true })).toBeEnabled();
    await drawer.getByRole('button', { name: 'Update', exact: true }).click();
    await expect(drawer).toBeHidden();
    expect(await app.evaluate(() => (globalThis as typeof globalThis & { templateEditorSave?: unknown }).templateEditorSave)).toEqual({ version: '4.5-stable', oldFileRemoved: true, newFileAdded: true });
    expect(await fs.readFile(path.join(local, '4.4.stable', 'custom.zip'), 'utf8')).toBe('keep this custom file');
    expect(await fs.readFile(path.join(local, '4.5.stable', 'linux_debug.x86_64'), 'utf8')).toBe('official debug');
});

test('keeps separate project download progress in its settings drawer', async () => {
    const bytes = storedZip({
        'templates/version.txt': '4.4.stable',
        'templates/linux_debug.x86_64': 'debug'.repeat(65536),
        'templates/linux_release.x86_64': 'official release',
    }).toString('base64');
    for (const asset of packages) {
        if (asset.url === 'https://example.invalid/templates/4.4-stable/gdscript.tpz') asset.bytes = bytes;
    }
    await app.close();
    app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`], env: launchEnv });
    await installPackageFixtures();
    page = await getMainWindow(app);
    await fs.mkdir(path.join(root, '4.4.stable'), { recursive: true });
    await fs.writeFile(path.join(root, '4.4.stable', 'linux_release.x86_64'), 'shared build');
    if ((await fs.lstat(local).catch(() => null))?.isSymbolicLink()) await fs.unlink(local);
    else await fs.rm(local, { recursive: true, force: true });
    await fs.mkdir(path.join(local, '4.4.stable'), { recursive: true });
    await fs.writeFile(path.join(local, '4.4.stable', 'linux_release.x86_64'), 'private build');
    await page.evaluate(async projectPath => window.__di_electron__!.invoke('exportTemplates.keepProjectTemplatesSeparate', projectPath), path.join(home, 'project'));
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectSettings').click();
    await page.getByTestId('tabProjectSettings_exportTemplates').click();
    const section = page.getByTestId('projectExportTemplates');
    await section.getByRole('button', { name: 'Linux', exact: true }).click();
    await section.getByRole('button', { name: 'Linux x86_64', exact: true }).click();
    await section.getByRole('checkbox', { name: 'linux_debug.x86_64', exact: true }).check();
    await app.evaluate(() => {
        (globalThis as typeof globalThis & { templateHoldUrl?: string }).templateHoldUrl = 'https://example.invalid/templates/4.4-stable/gdscript.tpz';
        (globalThis as typeof globalThis & { templateHoldPayload?: boolean }).templateHoldPayload = true;
    });
    try {
        await page.getByRole('button', { name: 'Update', exact: true }).click();
        await expect(section.getByRole('status')).toHaveText('Downloading templates');
        await expect(section.getByRole('progressbar', { name: 'Download templates' })).toBeInViewport();
        await expect(section.getByRole('checkbox', { name: 'linux_debug.x86_64', exact: true })).toBeDisabled();
        await expect(section).toHaveAttribute('aria-busy', 'true');
        await expect(page.getByTestId('btnExportTemplates').getByRole('status')).toBeHidden();
        await page.screenshot({ path: test.info().outputPath('project-template-progress.png') });
        await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
        await page.getByTestId('tabProjectSettings_project').click();
        await expect(page.getByRole('button', { name: 'Update', exact: true })).toBeDisabled();
        await page.getByTestId('tabProjectSettings_exportTemplates').click();
        await expect(section.getByRole('progressbar', { name: 'Download templates' })).toBeInViewport();
        await section.getByRole('button', { name: 'Cancel', exact: true }).click();
        await waitForTemplateStage('cancelled');
        await expect(section.getByRole('progressbar')).toBeHidden();
        expect(await fs.readFile(path.join(local, '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('private build');
        expect(await fs.readFile(path.join(root, '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('shared build');
        await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeEnabled();
        await page.keyboard.press('Escape');
    } finally {
        await app.evaluate(() => {
            delete (globalThis as typeof globalThis & { templateHoldUrl?: string }).templateHoldUrl;
            delete (globalThis as typeof globalThis & { templateHoldPayload?: boolean }).templateHoldPayload;
        });
    }
});
