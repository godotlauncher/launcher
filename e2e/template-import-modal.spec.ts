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

/** Installs mocked template responses behind the real Electron preload transport.
 * @param scenario - Package identity and injected preparation or save failure.
 */
async function configure(
    scenario: {
        setId?: string;
        chooseError?: string;
        prepareError?: string;
        saveError?: string;
        holdPrepare?: boolean;
        holdSave?: boolean;
    } = {},
) {
    await app.evaluate(({ ipcMain }, options) => {
        const state = globalThis as any;
        state.importScenario = options;
        state.importSaveCalls = 0;
        const success = (data?: unknown) => ({ success: true, data });
        const failure = (key: string) => ({
            success: false,
            error: { type: 'Error', message: `exportTemplates:${key}` },
        });
        const build = {
            id: 'import-modal-build',
            revision: 'revision',
            directoryName: 'Test build',
            label: 'Test build',
            setId: '4.7.2.stable.mono',
            importedAt: '',
            archiveName: '',
            files: ['linux_release.x86_64'],
            sizeBytes: 2048,
            available: true,
        };
        const handlers: Record<string, (...args: any[]) => any> = {
            getImportedTemplates: () =>
                success({
                    schemaVersion: 1,
                    builds: [build],
                    usage: {
                        [build.id]: Array.from(
                            { length: 40 },
                            (_, i) => `Project ${i + 1} with a long name`,
                        ),
                    },
                    references: { [build.id]: [] },
                }),
            chooseTemplateImport: () =>
                state.importScenario.chooseError
                    ? failure(state.importScenario.chooseError)
                    : success({
                          token: 'selected-package',
                          sourcePath: '/fixture/templates.tpz',
                          archiveName:
                              'Godot_export_templates_with_a_long_but_readable_filename.tpz',
                      }),
            prepareTemplateImport: async () => {
                if (state.importScenario.holdPrepare)
                    await new Promise<void>((resolve) => {
                        state.finishImportPrepare = resolve;
                    });
                if (state.importScenario.prepareError)
                    return failure(state.importScenario.prepareError);
                return success({
                    token: 'selected-package',
                    archiveName:
                        'Godot_export_templates_with_a_long_but_readable_filename.tpz',
                    setId: state.importScenario.setId ?? '4.7.2.stable.mono',
                    files: Array.from(
                        { length: 100 },
                        (_, i) => `platform_${i}/template_debug.x86_64`,
                    ),
                    sizeBytes: 2_000_000_000,
                });
            },
            getTemplateImportProgress: () =>
                success({ completedBytes: 1024, totalBytes: 4096 }),
            discardTemplateImport: () => success(),
            installTemplateImport: async () => {
                state.importSaveCalls++;
                if (state.importScenario.holdSave)
                    await new Promise<void>((resolve) => {
                        state.finishImportSave = resolve;
                    });
                return state.importScenario.saveError
                    ? failure(state.importScenario.saveError)
                    : success(build.id);
            },
        };
        for (const [name, handler] of Object.entries(handlers)) {
            const channel = `exportTemplates.${name}`;
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, handler);
        }
    }, scenario);
}

/** Opens the actual Import or Replace modal from the production library.
 * @param replacement - Whether to replace the existing mocked build.
 */
async function open(replacement = false) {
    await page.getByTestId('btnExportTemplates').click();
    if (replacement)
        await page
            .getByRole('article', { name: 'Test build', exact: true })
            .getByRole('button', { name: 'Replace TPZ', exact: true })
            .click();
    else
        await page
            .getByRole('button', { name: 'Import .tpz', exact: true })
            .click();
    const modal = page.getByTestId('templateImportModal');
    await expect(modal).toBeVisible();
    await modal
        .getByRole('button', { name: 'Choose TPZ file', exact: true })
        .click();
    await modal.getByRole('button', { name: 'Next', exact: true }).click();
    await expect
        .poll(() =>
            modal
                .locator(':scope > section')
                .evaluate((element) =>
                    Number(getComputedStyle(element).opacity),
                ),
        )
        .toBe(1);
    return modal;
}

/** Checks visibility and actual clipping, including all scrollable ancestors.
 * @param locator - Essential message or action which must not require scrolling.
 */
async function visibleWithoutScrolling(locator: Locator) {
    await expect(locator).toBeVisible();
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
        test('keeps import validation, save errors and actions visible while details scroll', async () => {
            await configure({ saveError: 'errors.space', holdPrepare: true });
            const modal = await open();
            await visibleWithoutScrolling(modal.getByRole('status'));
            await expect(modal.getByRole('status')).toContainText('Extracting export templates...');
            await visibleWithoutScrolling(
                modal.getByRole('button', { name: 'Cancel', exact: true }),
            );
            await app.evaluate(() => (globalThis as any).finishImportPrepare());
            const name = modal.getByRole('textbox', {
                name: 'Name',
                exact: true,
            });
            await expect(name).toBeVisible();
            await visibleWithoutScrolling(name);
            await visibleWithoutScrolling(modal.getByRole('alert'));
            await expect(
                modal.getByRole('button', { name: 'Save', exact: true }),
            ).toBeDisabled();
            await name.fill('My templates');
            await expect(modal.getByRole('alert')).toHaveCount(0);
            await modal.getByText('Package details', { exact: true }).click();
            const details = modal.getByTestId('templateImportDetails');
            expect(
                await details.evaluate(
                    (element) => element.scrollHeight > element.clientHeight,
                ),
            ).toBe(true);
            await details.evaluate((element) => {
                element.scrollTop = element.scrollHeight;
            });
            await visibleWithoutScrolling(name);
            await visibleWithoutScrolling(
                modal.getByRole('button', { name: 'Save', exact: true }),
            );
            await modal
                .getByRole('button', { name: 'Save', exact: true })
                .click();
            await expect(modal.getByRole('alert')).toContainText(
                'not enough free space',
            );
            await visibleWithoutScrolling(modal.getByRole('alert'));
            await visibleWithoutScrolling(
                modal.getByRole('button', { name: 'Save', exact: true }),
            );
            await page.screenshot({
                path: test.info().outputPath(`import-error-${theme.name}.png`),
                animations: 'disabled',
            });
            await name.fill('Retained name');
            await app.evaluate(() => {
                (globalThis as any).importScenario.saveError =
                    'library.duplicateLabel';
            });
            await modal
                .getByRole('button', { name: 'Save', exact: true })
                .click();
            await expect(modal.getByRole('alert')).toContainText(
                'already used',
            );
            await name.fill('Different name');
            await expect(modal.getByRole('alert')).toHaveCount(0);
            await app.evaluate(() => {
                (globalThis as any).importScenario.saveError = undefined;
            });
            await modal
                .getByRole('button', { name: 'Save', exact: true })
                .click();
            await expect(modal).toBeHidden();
        });
        test('uses a compact invalid-file view and can choose a new file', async () => {
            await configure({ prepareError: 'errors.archive' });
            const modal = await open();
            await expect(
                modal.getByRole('heading', {
                    name: 'This file cannot be imported',
                }),
            ).toBeVisible();
            await visibleWithoutScrolling(modal.getByRole('alert'));
            await visibleWithoutScrolling(
                modal.getByRole('button', {
                    name: 'Choose another file',
                    exact: true,
                }),
            );
            await expect(
                modal.getByRole('button', { name: 'Save', exact: true }),
            ).toHaveCount(0);
            await app.evaluate(() => {
                (globalThis as any).importScenario.prepareError = undefined;
            });
            await modal
                .getByRole('button', {
                    name: 'Choose another file',
                    exact: true,
                })
                .click();
            await modal
                .getByRole('button', { name: 'Next', exact: true })
                .click();
            await expect(
                modal.getByRole('textbox', { name: 'Name', exact: true }),
            ).toBeVisible();
            await modal
                .getByRole('button', { name: 'Cancel', exact: true })
                .click();
        });
        test('explains replacement edition and version mismatches without a Save button', async () => {
            for (const setId of ['4.7.2.stable', '4.7.1.stable.mono']) {
                await configure({ setId });
                const modal = await open(true);
                await visibleWithoutScrolling(
                    modal.getByRole('heading', {
                        name: 'This file cannot replace these templates',
                    }),
                );
                await visibleWithoutScrolling(
                    modal.getByText('Existing build', { exact: true }),
                );
                await visibleWithoutScrolling(
                    modal.getByText('Selected file', { exact: true }),
                );
                await expect(modal.getByRole('alert')).toContainText(
                    'This build needs 4.7.2.stable - .NET templates.',
                );
                await visibleWithoutScrolling(modal.getByRole('alert'));
                await visibleWithoutScrolling(
                    modal.getByRole('button', {
                        name: 'Choose another file',
                        exact: true,
                    }),
                );
                await expect(
                    modal.getByRole('button', { name: 'Save', exact: true }),
                ).toHaveCount(0);
                await expect(modal.getByRole('textbox')).toHaveCount(0);
                await expect(
                    modal.getByText('Package details', { exact: true }),
                ).toHaveCount(0);
                expect(
                    await app.evaluate(
                        () => (globalThis as any).importSaveCalls,
                    ),
                ).toBe(0);
                await page.screenshot({
                    path: test
                        .info()
                        .outputPath(
                            `replacement-mismatch-${setId}-${theme.name}.png`,
                        ),
                    animations: 'disabled',
                });
                if (setId === '4.7.2.stable') {
                    await app.evaluate(() => {
                        (globalThis as any).importScenario.chooseError =
                            'errors.failed';
                    });
                    await modal
                        .getByRole('button', {
                            name: 'Choose another file',
                            exact: true,
                        })
                        .click();
                    await expect(modal.getByRole('alert')).toContainText(
                        'The operation could not complete.',
                    );
                    await visibleWithoutScrolling(modal.getByRole('alert'));
                    await app.evaluate(() => {
                        (globalThis as any).importScenario.chooseError =
                            undefined;
                        (globalThis as any).importScenario.setId =
                            '4.7.2.stable.mono';
                    });
                    await modal
                        .getByRole('button', {
                            name: 'Choose another file',
                            exact: true,
                        })
                        .click();
                    await modal
                        .getByRole('button', { name: 'Next', exact: true })
                        .click();
                    await expect(
                        modal.getByRole('button', {
                            name: 'Save',
                            exact: true,
                        }),
                    ).toBeEnabled();
                }
                await modal
                    .getByRole('button', { name: 'Cancel', exact: true })
                    .click();
            }
        });
        test('keeps replacement controls visible with long lists, save errors and recovery', async () => {
            await configure({ saveError: 'errors.failed', holdSave: true });
            const modal = await open(true);
            await modal.getByText('Package details', { exact: true }).click();
            await modal
                .getByText('Affected projects (40)', { exact: true })
                .click();
            await modal
                .getByTestId('templateImportDetails')
                .evaluate((element) => {
                    element.scrollTop = element.scrollHeight;
                });
            await visibleWithoutScrolling(
                modal.getByText(
                    'This replaces all files in this build. Projects using it will use the replacement.',
                    { exact: true },
                ),
            );
            await visibleWithoutScrolling(
                modal.getByRole('button', { name: 'Save', exact: true }),
            );
            await modal
                .getByRole('button', { name: 'Save', exact: true })
                .click();
            await visibleWithoutScrolling(modal.getByRole('status'));
            await expect(modal.getByRole('status')).toContainText('Saving export templates...');
            await expect(
                modal.getByRole('button', { name: 'Save', exact: true }),
            ).toBeDisabled();
            await app.evaluate(() => (globalThis as any).finishImportSave());
            await visibleWithoutScrolling(modal.getByRole('alert'));
            await visibleWithoutScrolling(
                modal.getByRole('button', { name: 'Save', exact: true }),
            );
            await page.screenshot({
                path: test
                    .info()
                    .outputPath(`replacement-error-${theme.name}.png`),
                animations: 'disabled',
            });
            await app.evaluate(() => {
                (globalThis as any).importScenario.holdSave = false;
                (globalThis as any).importScenario.saveError =
                    'errors.recovery';
            });
            await modal
                .getByRole('button', { name: 'Save', exact: true })
                .click();
            await expect(modal.getByRole('alert')).toContainText(
                'needs recovery',
            );
            await visibleWithoutScrolling(modal.getByRole('alert'));
            await expect(
                modal.getByRole('button', { name: 'Save', exact: true }),
            ).toHaveCount(0);
            await visibleWithoutScrolling(
                modal.getByRole('button', { name: 'Cancel', exact: true }),
            );
            await modal
                .getByRole('button', { name: 'Cancel', exact: true })
                .click();
        });
    });
}
