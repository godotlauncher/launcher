import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Locator,
    type Page,
    test,
} from './support/electron.fixture';
import { getMainWindow } from './splashscreen/getMainWindow';
import { applyTheme, createFixtureHome } from './support/e2e-fixture-runtime';
import { THEMES } from './support/e2e-fixture-theme';

let app: ElectronApplication;
let page: Page;
let home: string;
test.describe.configure({ mode: 'serial' });
test.setTimeout(60_000);

test.beforeAll(async () => {
    home = await createFixtureHome();
    const cataloguePath = path.join(
        home,
        '.gd-launcher',
        'editor-catalog.json',
    );
    const catalogue = JSON.parse(await fs.readFile(cataloguePath, 'utf8'));
    for (const provider of Object.values(catalogue.providers) as any[]) {
        provider.templateMetadataRefreshed = true;
        for (const release of provider.releases) {
            release.templateAssets = [
                {
                    id: `${release.id}:templates:gdscript`,
                    name: 'export_templates.tpz',
                    flavor: 'gdscript',
                    downloadUrl: 'https://example.invalid/templates.tpz',
                    sizeBytes: 512 * 1024 ** 2,
                },
            ];
        }
    }
    await fs.writeFile(cataloguePath, JSON.stringify(catalogue));
    const prefsPath = path.join(home, '.gd-launcher', 'prefs.json');
    const prefs = JSON.parse(await fs.readFile(prefsPath, 'utf8'));
    prefs.language = 'en';
    prefs.export_template_migration_offered = true;
    await fs.writeFile(prefsPath, JSON.stringify(prefs));
    await fs.writeFile(path.join(home, '.gd-launcher', 'projects.json'), '[]');
    const env: Record<string, string> = {
        ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
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
        env,
    });
    page = await getMainWindow(app);
    await expect(page.getByTestId('btnHelp')).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows().find((win) =>
            win.webContents.getURL().startsWith('http://localhost:5123'),
        );
        if (!main) throw new Error('Main window missing');
        main.setSize(1024, 600);
    });
});
test.afterEach(async ({}, info) => {
    if (info.status !== info.expectedStatus)
        await page.screenshot({ path: info.outputPath('failure.png') });
});
test.afterAll(async () => {
    try {
        await app?.close();
    } finally {
        if (home) await fs.rm(home, { recursive: true, force: true });
    }
});

/** Mocks file discovery and submission behind Electron's real preload transport.
 * @param scenario - Failures or paused work to display in the production drawer.
 */
async function configure(
    scenario: {
        loadError?: string;
        localError?: boolean;
        localOnly?: boolean;
        saveError?: boolean;
        holdLoad?: boolean;
        holdSave?: boolean;
        fullStartError?: string;
    } = {},
) {
    await app.evaluate(({ ipcMain }, options) => {
        const state = globalThis as any;
        state.downloadScenario = options;
        state.packageReads = 0;
        state.savedSelections = [];
        state.fullDownloads = [];
        state.fullJob = undefined;
        state.fullCancelError = false;
        const success = (data?: unknown) => ({ success: true, data });
        const failure = (key = 'failed') => ({
            success: false,
            error: { type: 'Error', message: `exportTemplates:errors.${key}` },
        });
        const local = ['linux_debug.x86_64'];
        const additional = Array.from(
            { length: 40 },
            (_, i) => `custom_template_${i + 1}.bin`,
        );
        const files = [
            'linux_debug.x86_64',
            'linux_release.x86_64',
            'android_release.apk',
            'web_release.zip',
            ...additional,
        ];
        const packageInfo = {
            token: 'drawer-package',
            localFiles: local,
            files: files.map((path) => ({
                path,
                sizeBytes: 1024,
                downloadBytes: 1024,
            })),
        };
        const handlers: Record<string, (...args: any[]) => any> = {
            getInventory: () =>
                success({
                    root: '/Library/Godot/export_templates',
                    sets: [
                        {
                            id: '4.6.stable',
                            version: '4.6.stable',
                            edition: 'standard',
                            sizeBytes: 1024,
                            fileCount: 1,
                            files: local,
                            platforms: ['linux'],
                            projects: ['test'],
                        },
                    ],
                    connections: [],
                    recoveries: [],
                    issues: [],
                    totalBytes: 1024,
                    job: null,
                }),
            getJobs: () => success(state.fullJob ? [state.fullJob] : []),
            downloadFullPackage: (_event, releaseId, assetId) => {
                state.fullDownloads.push({ releaseId, assetId });
                if (state.downloadScenario.fullStartError) return failure(state.downloadScenario.fullStartError);
                state.fullJob = { id: `full-download-${state.fullDownloads.length}`, setIds: ['4.6.stable'], kind: 'update', stage: 'downloading', receivedBytes: 128 * 1024 ** 2, totalBytes: 512 * 1024 ** 2, fullPackage: { releaseId, assetId } };
                return success(state.fullJob.id);
            },
            cancel: () => {
                if (state.fullCancelError) return failure('downloadNetwork');
                state.fullJob.stage = 'cancelled';
                return success();
            },
            getImportedTemplates: () =>
                success({
                    schemaVersion: 1,
                    builds: [],
                    usage: {},
                    references: {},
                }),
            getPackage: async () => {
                state.packageReads++;
                if (state.downloadScenario.holdLoad)
                    await new Promise<void>((resolve) => {
                        state.finishPackageLoad = resolve;
                    });
                if (
                    state.downloadScenario.loadError ||
                    state.downloadScenario.localOnly
                )
                    return failure(state.downloadScenario.loadError ?? 'range');
                return success(packageInfo);
            },
            getLocalPackage: () =>
                state.downloadScenario.localError
                    ? failure()
                    : success({ ...packageInfo, localFiles: files }),
            savePackage: async (_event, token, selected) => {
                state.savedSelections.push({ token, selected });
                if (state.downloadScenario.holdSave)
                    await new Promise<void>((resolve) => {
                        state.finishPackageSave = resolve;
                    });
                return state.downloadScenario.saveError ? failure() : success();
            },
        };
        for (const [name, handler] of Object.entries(handlers)) {
            const channel = `exportTemplates.${name}`;
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, handler);
        }
    }, scenario);
}

/** Opens Download or Manage through the real export template library.
 * @param manage - Whether to manage the installed set rather than pick a version.
 */
async function open(manage = false) {
    await page.getByTestId('btnExportTemplates').click();
    await page
        .getByRole('button', {
            name: manage ? 'Manage templates 4.6.stable' : 'Download templates',
            exact: true,
        })
        .click();
    const drawer = page.getByTestId('templateDownloadDrawer');
    await visibleWithoutScrolling(
        drawer.getByRole('button', { name: 'Close', exact: true }),
    );
    if (!manage) {
        await page.getByTestId('templateVersionPicker').click();
        const picker = page.getByTestId('templateVersionPopover');
        await picker.getByRole('button', { name: 'All', exact: true }).click();
        await picker.getByRole('textbox').fill('4.6');
        await picker
            .getByRole('button', { name: '4.6-stable Standard', exact: true })
            .click();
    }
    return drawer;
}

/** Expands the Linux files and selects a new template.
 * @param drawer - Open production drawer.
 */
async function addLinux(drawer: Locator) {
    const tree = drawer.getByTestId('templateFileTree');
    await tree.getByRole('button', { name: 'Linux', exact: true }).click();
    await tree
        .getByRole('button', { name: 'Linux x86_64', exact: true })
        .click();
    await tree
        .getByRole('checkbox', { name: 'linux_release.x86_64', exact: true })
        .check();
    return tree;
}

/** Saves a matching screenshot without hover or scroll differences.
 * @param name - Review image basename.
 */
async function capture(name: string) {
    // Native progress transitions do not settle through Playwright's animation option.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    if (await page.getByTestId('templateFileTree').count()) await page.getByTestId('templateFileTree').evaluate((element) => { element.scrollTop = 0; });
    await page.mouse.move(0, 0);
    await page.screenshot({
        path: test.info().outputPath(`${name}.png`),
        animations: 'disabled',
    });
}

/** Checks visibility and actual clipping, including all scrollable ancestors.
 * @param locator - Essential message or action which must not require scrolling.
 */
async function visibleWithoutScrolling(locator: Locator) {
    await expect(locator).toBeVisible();
    const drawer = page.getByTestId('templateDownloadDrawer');
    if (await drawer.count()) {
        const footer = drawer.locator('footer');
        await expect(footer.getByRole('alert')).toHaveCount(0);
        await expect(footer.getByRole('status')).toHaveCount(0);
        await expect(footer.getByRole('progressbar')).toHaveCount(0);
        const files = drawer.getByRole('region', { name: 'Template files', exact: true });
        if (await drawer.getByRole('alert').count()) await expect(files.getByRole('alert').first()).toBeVisible();
        if (await drawer.getByTestId('templateFullDownload').count()) {
            await expect(files.getByTestId('templateFullDownload')).toBeVisible();
            await expect(files.getByRole('button')).toHaveCount(0);
            await expect(footer.getByRole('button').first()).toBeVisible();
        }
    }
    await expect
        .poll(() =>
            locator.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                if (
                    rect.top < 0 ||
                    rect.bottom > innerHeight ||
                    rect.left < 0 ||
                    rect.right > innerWidth
                )
                    return `viewport: ${JSON.stringify(rect.toJSON())}, ${innerWidth}x${innerHeight}`;
                for (
                    let parent = element.parentElement;
                    parent;
                    parent = parent.parentElement
                ) {
                    if (parent instanceof HTMLDialogElement) break;
                    if (
                        /(auto|scroll|hidden|clip)/.test(
                            getComputedStyle(parent).overflowY,
                        )
                    ) {
                        const bounds = parent.getBoundingClientRect();
                        if (
                            rect.top < bounds.top - 1 ||
                            rect.bottom > bounds.bottom + 1
                        )
                            return `clipped by ${parent.tagName}: child ${JSON.stringify(rect.toJSON())}, parent ${JSON.stringify(bounds.toJSON())}`;
                    }
                }
                return 'visible';
            }),
        )
        .toBe('visible');
}

for (const theme of THEMES) {
    test.describe(theme.name, () => {
        test.beforeEach(async () => {
            await configure();
            await page.reload();
            await applyTheme(page, theme);
            await expect(page.locator('html')).toHaveAttribute(
                'data-theme',
                theme.name,
            );
        });
        test('cancels selected template files from the end of the progress bar at 600px', async () => {
            await app.evaluate(() => {
                (globalThis as any).fullJob = { id: 'selected-download', setIds: ['4.6.stable'], kind: 'update',
                    stage: 'downloading', receivedBytes: 32 * 1024 ** 2, totalBytes: 64 * 1024 ** 2 };
            });
            await page.getByTestId('btnExportTemplates').click();
            const row = page.getByRole('article', { name: '4.6.stable', exact: true });
            const cancel = row.getByRole('button', { name: 'Cancel template download', exact: true });
            await visibleWithoutScrolling(cancel);
            await expect(row.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
            await expect(row).toContainText('32 MiB / 64 MiB');
            const barBox = await row.getByRole('progressbar').boundingBox();
            const cancelBox = await cancel.boundingBox();
            expect(barBox).not.toBeNull(); expect(cancelBox).not.toBeNull();
            expect(cancelBox!.x).toBeGreaterThanOrEqual(barBox!.x + barBox!.width);
            expect(Math.abs(cancelBox!.y + cancelBox!.height / 2 - barBox!.y - barBox!.height / 2)).toBeLessThanOrEqual(1);
            await capture(`selected-download-${theme.name}`);
            await app.evaluate(() => { (globalThis as any).fullJob.stage = 'applying'; });
            await expect(cancel).toHaveCount(0);
            await expect(row.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
            await app.evaluate(() => { (globalThis as any).fullJob.stage = 'downloading'; });
            await cancel.click();
            await expect(cancel).toHaveCount(0);
            expect(await app.evaluate(() => (globalThis as any).fullJob.stage)).toBe('cancelled');
            await expect(row).toContainText('1 file');
            await expect(row.getByRole('progressbar')).toHaveCount(0);
        });

        test('keeps the full-package offer, download, extraction and completion visible at 600px', async () => {
            await configure({ loadError: 'downloadPartial' });
            const drawer = await open();
            const start = drawer.getByRole('button', { name: 'Download full package', exact: true });
            await visibleWithoutScrolling(start);
            await visibleWithoutScrolling(drawer.getByText('Full package: 512 MiB'));
            await expect(drawer.getByRole('region', { name: 'Template files', exact: true }).getByRole('alert')).toHaveText('Unable to load the template file list.');
            await expect(drawer.locator('footer').getByRole('button', { name: 'Download full package', exact: true })).toBeVisible();
            await capture(`full-offer-${theme.name}`);
            await start.click();
            const full = drawer.getByTestId('templateFullDownload');
            await expect(full.getByRole('status')).toHaveText('Downloading full package');
            await visibleWithoutScrolling(full.getByRole('progressbar'));
            await visibleWithoutScrolling(full.getByText('128 MiB / 512 MiB'));
            const cancel = drawer.getByRole('button', {name:'Cancel',exact:true});
            await visibleWithoutScrolling(cancel);
            await expect(cancel).toBeEnabled();
            await expect(drawer.getByRole('button',{name:'Close',exact:true})).toBeDisabled();
            await expect(page.getByTestId('templateVersionPicker')).toBeDisabled();
            await page.keyboard.press('Escape');
            await expect(full).toBeVisible();
            await capture(`full-downloading-${theme.name}`);
            await app.evaluate(() => { const job = (globalThis as any).fullJob; Object.assign(job,{stage:'preparing',receivedBytes:1024 ** 3,totalBytes:2 * 1024 ** 3}); job.fullPackage.extracting=true; });
            await expect(full.getByRole('status')).toHaveText('Extracting templates');
            await visibleWithoutScrolling(full.getByText('1 GiB / 2 GiB'));
            await visibleWithoutScrolling(cancel);
            await capture(`full-extracting-${theme.name}`);
            await app.evaluate(() => { const job = (globalThis as any).fullJob; job.stage='applying'; job.totalBytes=undefined; });
            await expect(full.getByRole('status')).toHaveText('Installing templates');
            await expect(cancel).toBeDisabled();
            await visibleWithoutScrolling(cancel);
            await app.evaluate(() => { (globalThis as any).fullJob.stage='complete'; });
            await expect(full.getByRole('status')).toHaveText('Templates installed.');
            await visibleWithoutScrolling(drawer.getByRole('button',{name:'Done',exact:true}));
            await capture(`full-complete-${theme.name}`);
            await drawer.getByRole('button',{name:'Done',exact:true}).click();
            await expect(drawer).toHaveCount(0);
        });
        test('keeps full-package errors and retry actions visible at 600px', async () => {
            await configure({ loadError:'downloadPartial' });
            const drawer = await open();
            await drawer.getByRole('button',{name:'Download full package',exact:true}).click();
            const full = drawer.getByTestId('templateFullDownload');
            await expect(full.getByRole('status')).toHaveText('Downloading full package');
            await app.evaluate(() => { Object.assign((globalThis as any).fullJob,{stage:'error',error:'exportTemplates:errors.downloadNetwork'}); });
            await expect(full.getByRole('alert')).toContainText('Download connection failed.');
            for (const name of ['Retry','Import .tpz','Done']) await visibleWithoutScrolling(drawer.getByRole('button',{name,exact:true}));
            await visibleWithoutScrolling(full.getByRole('alert'));
            await capture(`full-error-${theme.name}`);
            await drawer.getByRole('button',{name:'Retry',exact:true}).click();
            await expect(full.getByRole('status')).toHaveText('Downloading full package');
            expect(await app.evaluate(() => (globalThis as any).fullDownloads.length)).toBe(2);
            await drawer.getByRole('button',{name:'Cancel',exact:true}).click();
            await expect(full.getByRole('status')).toHaveText('Download cancelled.');
            await visibleWithoutScrolling(drawer.getByRole('button',{name:'Retry',exact:true}));
            await capture(`full-cancelled-${theme.name}`);
            await drawer.getByRole('button',{name:'Done',exact:true}).click();
        });
        test('keeps cancellation failure actionable without treating an active download as stopped', async () => {
            await configure({loadError:'downloadPartial'});
            const drawer = await open();
            await drawer.getByRole('button',{name:'Download full package',exact:true}).click();
            const full = drawer.getByTestId('templateFullDownload');
            await expect(full.getByRole('status')).toHaveText('Downloading full package');
            await app.evaluate(()=> { (globalThis as any).fullCancelError=true; });
            await drawer.getByRole('button',{name:'Cancel',exact:true}).click();
            await expect(full.getByRole('alert')).toHaveText('Cancellation not confirmed.');
            await visibleWithoutScrolling(full.getByRole('alert'));
            await visibleWithoutScrolling(drawer.getByRole('button',{name:'Cancel',exact:true}));
            await expect(drawer.getByRole('button',{name:'Close',exact:true})).toBeDisabled();
            await expect(drawer.getByRole('button',{name:'Retry',exact:true})).toHaveCount(0);
            await app.evaluate(()=> { (globalThis as any).fullCancelError=false; });
            await drawer.getByRole('button',{name:'Cancel',exact:true}).click();
            await expect(full.getByRole('status')).toHaveText('Download cancelled.');
            await drawer.getByRole('button',{name:'Done',exact:true}).click();
        });
        test('shows a full-package submission failure with a working retry at 600px', async () => {
            await configure({loadError:'downloadPartial',fullStartError:'downloadServer'});
            const drawer = await open();
            await drawer.getByRole('button',{name:'Download full package',exact:true}).click();
            const full = drawer.getByTestId('templateFullDownload');
            await expect(full.getByRole('alert')).toHaveText('The download server returned an error.');
            await visibleWithoutScrolling(full.getByRole('alert'));
            await visibleWithoutScrolling(drawer.getByRole('button',{name:'Retry',exact:true}));
            await app.evaluate(()=> { (globalThis as any).downloadScenario.fullStartError=undefined; });
            await drawer.getByRole('button',{name:'Retry',exact:true}).click();
            await expect(full.getByRole('status')).toHaveText('Downloading full package');
            await drawer.getByRole('button',{name:'Cancel',exact:true}).click();
            await expect(full.getByRole('status')).toContainText('Download cancelled');
            await drawer.getByRole('button',{name:'Done',exact:true}).click();
        });
        test('keeps the Manage full-package fallback visible and protects unsaved file choices', async () => {
            await configure({loadError:'downloadPartial'});
            const drawer=await open(true);
            const start=drawer.getByRole('button',{name:'Download full package',exact:true});
            await visibleWithoutScrolling(start);
            await expect(start).toBeEnabled();
            const tree=drawer.getByTestId('templateFileTree');
            await tree.getByRole('checkbox',{name:'Desktop',exact:true}).uncheck();
            await expect(start).toBeDisabled();
            await expect(drawer.getByText('Full package: 512 MiB', { exact: true })).toHaveCount(0);
            await visibleWithoutScrolling(drawer.getByText('Save or undo changes before retrying.'));
            await visibleWithoutScrolling(drawer.getByRole('button',{name:'Save changes',exact:true}));
            await tree.getByRole('checkbox',{name:'Desktop',exact:true}).check();
            await expect(start).toBeEnabled();
            await visibleWithoutScrolling(drawer.getByText('Full package: 512 MiB', { exact: true }));
            await expect(drawer.getByText('Save or undo changes before retrying.', { exact: true })).toHaveCount(0);
            await start.click();
            const full=drawer.getByTestId('templateFullDownload');
            await expect(full.getByRole('status')).toHaveText('Downloading full package');
            await visibleWithoutScrolling(drawer.getByRole('button',{name:'Cancel',exact:true}));
            await drawer.getByRole('button',{name:'Cancel',exact:true}).click();
            await expect(full.getByRole('status')).toContainText('Download cancelled');
            await drawer.getByRole('button',{name:'Done',exact:true}).click();
        });
        test('offers another version and TPZ import after an unreadable full package', async () => {
            await configure({loadError:'downloadPartial'});
            const drawer=await open();
            await drawer.getByRole('button',{name:'Download full package',exact:true}).click();
            const full=drawer.getByTestId('templateFullDownload');
            await expect(full.getByRole('status')).toHaveText('Downloading full package');
            await app.evaluate(()=>{Object.assign((globalThis as any).fullJob,{stage:'error',error:'exportTemplates:errors.identity'});});
            await expect(full.getByRole('alert')).toContainText('Invalid or unreadable template package.');
            await visibleWithoutScrolling(drawer.getByRole('button',{name:'Choose another version',exact:true}));
            await visibleWithoutScrolling(drawer.getByRole('button',{name:'Import .tpz',exact:true}));
            await drawer.getByRole('button',{name:'Choose another version',exact:true}).click();
            await expect(page.getByTestId('templateVersionPopover')).toBeVisible();
            await page.keyboard.press('Escape');
            await drawer.getByRole('button',{name:'Close',exact:true}).click();
        });
        test('keeps Download load errors and Retry visible at 600px', async () => {
            await configure({ loadError: 'range' });
            const drawer = await open();
            await visibleWithoutScrolling(drawer.getByRole('alert'));
            await expect(drawer.getByRole('alert')).toContainText(
                'Unable to load the template file list.',
            );
            const retry = drawer.getByRole('button', {
                name: 'Retry',
                exact: true,
            });
            await visibleWithoutScrolling(retry);
            const save = drawer.getByRole('button', {
                name: 'Save changes',
                exact: true,
            });
            await expect(save).toHaveCount(0);
            await capture(`download-error-${theme.name}`);
            await app.evaluate(() => {
                (globalThis as any).downloadScenario.loadError = undefined;
            });
            await retry.click();
            await expect(drawer.getByRole('alert')).toHaveCount(0);
            await addLinux(drawer);
            await expect(save).toBeEnabled();
            await capture(`download-review-${theme.name}`);
        });
        for (const scenario of [
            {
                key: 'downloadNetwork',
                message:
                    'Download connection failed.',
                action: 'Retry',
            },
            {
                key: 'downloadServer',
                message:
                    'The download server returned an error.',
                action: 'Retry',
            },
            {
                key: 'downloadChanged',
                message:
                    'Template package changed.',
                action: 'Refresh file list',
            },
            {
                key: 'downloadUnavailable',
                message:
                    'Template package unavailable.',
                action: 'Choose another version',
            },
            {
                key: 'downloadInvalid',
                message:
                    'Invalid or unreadable template package.',
                action: 'Choose another version',
            },
            {
                key: 'unrecognised-internal-detail',
                message: 'Unable to load template files.',
                action: 'Retry',
            },
        ]) {
            test(`shows the right recovery action for ${scenario.key} at 600px`, async () => {
                await configure({ loadError: scenario.key });
                const drawer = await open();
                await expect(drawer.getByRole('alert')).toHaveText(
                    scenario.message,
                );
                await expect(drawer.getByRole('button', {name:'Download full package',exact:true})).toHaveCount(0);
                await visibleWithoutScrolling(drawer.getByRole('alert'));
                const action = drawer.getByRole('button', {
                    name: scenario.action,
                    exact: true,
                });
                await visibleWithoutScrolling(action);
                await visibleWithoutScrolling(
                    drawer.getByRole('button', {
                        name: 'Import .tpz',
                        exact: true,
                    }),
                );
                await expect(
                    drawer.getByRole('button', {
                        name: 'Save changes',
                        exact: true,
                    }),
                ).toHaveCount(0);
                await expect(
                    drawer.getByText('Files to add: 0; to remove: 0', {
                        exact: true,
                    }),
                ).toHaveCount(0);
                await capture(`download-${scenario.key}-${theme.name}`);
                await app.evaluate(() => {
                    (globalThis as any).downloadScenario.loadError = undefined;
                });
                await action.click();
                if (scenario.action === 'Choose another version') {
                    const picker = page.getByTestId('templateVersionPopover');
                    await expect(picker).toBeVisible();
                    await picker
                        .getByRole('button', { name: 'All', exact: true })
                        .click();
                    await picker.getByRole('textbox').fill('4.6');
                    await picker
                        .getByRole('button', {
                            name: '4.6-stable Standard',
                            exact: true,
                        })
                        .click();
                }
                await expect(drawer.getByRole('alert')).toHaveCount(0);
                await addLinux(drawer);
                await expect(
                    drawer.getByRole('button', {
                        name: 'Save changes',
                        exact: true,
                    }),
                ).toBeEnabled();
                expect(
                    await app.evaluate(
                        () => (globalThis as any).savedSelections,
                    ),
                ).toEqual([]);
            });
        }

        test('keeps Manage usable and can recover the online list or choose another version', async () => {
            await configure({ loadError: 'downloadNetwork' });
            const drawer = await open(true);
            await expect(drawer.getByRole('alert')).toHaveText(
                'Unable to load the online file list. Showing installed files.',
            );
            const retry = drawer.getByRole('button', {
                name: 'Retry',
                exact: true,
            });
            await visibleWithoutScrolling(retry);
            await expect(retry).toBeEnabled();
            await capture(`manage-download-network-${theme.name}`);
            await app.evaluate(() => {
                (globalThis as any).downloadScenario.loadError = undefined;
            });
            await retry.click();
            await expect(drawer.getByRole('alert')).toHaveCount(0);
            await expect(
                drawer.getByText('Only installed files are available.', {
                    exact: true,
                }),
            ).toHaveCount(0);
            await drawer
                .getByRole('button', { name: 'Close', exact: true })
                .click();
            await expect(drawer).toBeHidden();
            await configure({ loadError: 'downloadUnavailable' });
            const manage = await open(true);
            const choose = manage.getByRole('button', {
                name: 'Choose another version',
                exact: true,
            });
            await expect(choose).toBeEnabled();
            await app.evaluate(() => {
                (globalThis as any).downloadScenario.loadError = undefined;
            });
            await choose.click();
            await expect(manage).toHaveAccessibleName('Add Export Template');
            const picker = page.getByTestId('templateVersionPopover');
            await expect(picker).toBeVisible();
            await picker
                .getByRole('button', { name: 'All', exact: true })
                .click();
            await picker.getByRole('textbox').fill('4.6');
            await picker
                .getByRole('button', {
                    name: '4.6-stable Standard',
                    exact: true,
                })
                .click();
            await expect(manage.getByRole('alert')).toHaveCount(0);
            await addLinux(manage);
            await expect(
                manage.getByRole('button', {
                    name: 'Save changes',
                    exact: true,
                }),
            ).toBeEnabled();
        });

        test('opens TPZ import from the error footer', async () => {
            await configure({ loadError: 'downloadUnavailable' });
            const drawer = await open();
            await drawer
                .getByRole('button', { name: 'Import .tpz', exact: true })
                .click();
            await expect(drawer).toBeHidden();
            const modal = page.getByTestId('templateImportModal');
            await expect(modal).toBeVisible();
            await visibleWithoutScrolling(
                modal.getByRole('button', {
                    name: 'Choose TPZ file',
                    exact: true,
                }),
            );
        });

        test('keeps save errors, removal warnings and choices visible while the file list scrolls', async () => {
            await configure({ saveError: true });
            const drawer = await open();
            const tree = await addLinux(drawer);
            await tree
                .getByRole('checkbox', {
                    name: 'linux_debug.x86_64',
                    exact: true,
                })
                .uncheck();
            const save = drawer.getByRole('button', {
                name: 'Save changes',
                exact: true,
            });
            await save.click();
            const notice = drawer.getByText(
                'Removing files affects all projects using these templates.',
                { exact: true },
            );
            await visibleWithoutScrolling(notice);
            await visibleWithoutScrolling(drawer.getByRole('alert'));
            await visibleWithoutScrolling(save);
            await expect(save).toBeEnabled();
            await expect(
                tree.getByRole('checkbox', {
                    name: 'linux_release.x86_64',
                    exact: true,
                }),
            ).toBeChecked();
            await expect(
                tree.getByRole('checkbox', {
                    name: 'linux_debug.x86_64',
                    exact: true,
                }),
            ).not.toBeChecked();
            expect(
                await tree.evaluate(
                    (element) => element.scrollHeight > element.clientHeight,
                ),
            ).toBe(true);
            await tree.evaluate((element) => {
                element.scrollTop = element.scrollHeight;
            });
            await visibleWithoutScrolling(drawer.getByRole('alert'));
            await visibleWithoutScrolling(notice);
            await visibleWithoutScrolling(save);
            const reads = await app.evaluate(
                () => (globalThis as any).packageReads,
            );
            await page.evaluate(() => window.dispatchEvent(new Event('focus')));
            expect(
                await app.evaluate(() => (globalThis as any).packageReads),
            ).toBe(reads);
            await expect(
                drawer.getByRole('button', { name: 'Retry', exact: true }),
            ).toHaveCount(0);
            await expect(drawer.getByRole('region', { name: 'Template files', exact: true }).getByRole('alert')).toHaveText('Unable to save template changes.');
            await capture(`download-save-error-${theme.name}`);
            await app.evaluate(() => {
                (globalThis as any).downloadScenario.saveError = false;
            });
            await save.click();
            await expect(drawer).toBeHidden();
            const submitted = await app.evaluate(
                () => (globalThis as any).savedSelections,
            );
            expect(submitted).toHaveLength(2);
            expect(submitted[1]).toEqual(submitted[0]);
            expect(submitted[1]).toEqual({
                token: 'drawer-package',
                selected: ['linux_release.x86_64'],
            });
        });
        test('keeps Manage offline guidance and removal actions outside the long list', async () => {
            await configure({ localOnly: true });
            const drawer = await open(true);
            const notice = drawer.getByRole('alert');
            await expect(notice).toHaveText('Unable to load the online file list. Showing installed files.');
            await expect(drawer.getByText('Only installed files are available.', { exact: true })).toHaveCount(0);
            await visibleWithoutScrolling(drawer.getByText('Full package: 512 MiB', { exact: true }));
            await expect(drawer.getByText('Save or undo changes before retrying.', { exact: true })).toHaveCount(0);
            await capture(`manage-offline-ready-${theme.name}`);
            await visibleWithoutScrolling(notice);
            const tree = drawer.getByTestId('templateFileTree');
            await tree
                .getByRole('checkbox', {
                    name: 'Other files',
                    exact: true,
                })
                .uncheck();
            await visibleWithoutScrolling(
                drawer.getByRole('button', {
                    name: 'Save changes',
                    exact: true,
                }),
            );
            const retry = drawer.getByRole('button', {
                name: 'Retry',
                exact: true,
            });
            await expect(retry).toBeDisabled();
            await visibleWithoutScrolling(
                drawer.getByText(
                    'Save or undo changes before retrying.',
                    { exact: true },
                ),
            );
            await visibleWithoutScrolling(drawer.getByRole('alert'));
            await expect(drawer.getByText('Full package: 512 MiB', { exact: true })).toHaveCount(0);
            await expect(drawer.getByText('Adds missing templates for all platforms. Existing files are kept.', { exact: true })).toHaveCount(0);
            await expect(drawer.getByText('Files to add: 0; to remove: 40', { exact: true })).toBeVisible();
            expect((await tree.boundingBox())!.height).toBeGreaterThan(240);
            await capture(`manage-offline-${theme.name}`);
            await tree.evaluate((element) => {
                element.scrollTop = element.scrollHeight;
            });
            await visibleWithoutScrolling(notice);
            await visibleWithoutScrolling(
                drawer.getByText(
                    'Removing files affects all projects using these templates.',
                    { exact: true },
                ),
            );
            await drawer
                .getByRole('button', { name: 'Close', exact: true })
                .click();
            await expect(drawer).toBeHidden();
            await configure({ localOnly: true, localError: true });
            const failed = await open(true);
            await visibleWithoutScrolling(failed.getByRole('alert'));
            await visibleWithoutScrolling(
                failed.getByRole('button', { name: 'Retry', exact: true }),
            );
            await expect(
                failed.getByRole('button', {
                    name: 'Save changes',
                    exact: true,
                }),
            ).toHaveCount(0);
            await capture(`manage-error-${theme.name}`);
        });
        test('shows loading and saving feedback with actions visible and edits disabled during submission', async () => {
            await configure({ holdLoad: true, holdSave: true });
            const drawer = await open();
            await visibleWithoutScrolling(
                drawer.getByText('Loading template files...', { exact: true }),
            );
            const save = drawer.getByRole('button', {
                name: 'Save changes',
                exact: true,
            });
            await visibleWithoutScrolling(save);
            await expect(save).toBeDisabled();
            await app.evaluate(() => {
                (globalThis as any).downloadScenario.holdLoad = false;
                (globalThis as any).finishPackageLoad();
            });
            const tree = await addLinux(drawer);
            await save.click();
            await expect(save).toBeDisabled();
            await expect(save.locator('.loading')).toBeVisible();
            await expect(
                page.getByTestId('templateVersionPicker'),
            ).toBeDisabled();
            await expect(
                tree.getByRole('checkbox', {
                    name: 'linux_release.x86_64',
                    exact: true,
                }),
            ).toBeDisabled();
            const reads = await app.evaluate(
                () => (globalThis as any).packageReads,
            );
            await page.evaluate(() => window.dispatchEvent(new Event('focus')));
            expect(
                await app.evaluate(() => (globalThis as any).packageReads),
            ).toBe(reads);
            await app.evaluate(() => {
                (globalThis as any).finishPackageSave();
            });
            await expect(drawer).toBeHidden();
        });
    });
}
