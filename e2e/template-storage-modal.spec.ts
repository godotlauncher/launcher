import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Locator,
    type Page,
    test,
} from '@playwright/test';
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
    const env = {
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
        // A failed scenario can leave a simulated move blocking native window close.
        await app?.evaluate(({ BrowserWindow }) => {
            for (const window of BrowserWindow.getAllWindows()) window.destroy();
        });
        await app?.close();
    } finally {
        if (home) await fs.rm(home, { recursive: true, force: true });
    }
});

/** Mocks storage operations behind the real preload transport without moving user files.
 * @param scenario - Injected capacity, preparation and operation states.
 */
async function configure(
    scenario: {
        space?: boolean | null;
        prepareError?: string;
        pickerError?: string;
        startError?: string;
        cancelError?: string;
        recoverError?: string;
        holdPrepare?: boolean;
        holdRecover?: boolean;
        loadError?: boolean;
        busy?: boolean;
    } = {},
) {
    await app.evaluate(({ ipcMain, dialog }, options) => {
        const state = globalThis as any;
        state.storageScenario = options;
        state.storageJob = null;
        state.storageStartCalls = [];
        const success = (data?: unknown) => ({ success: true, data });
        const failure = (key: string) => ({
            success: false,
            error: {
                type: 'Error',
                message: `exportTemplates:storage.errors.${key}`,
            },
        });
        const destination = '/Volumes/Template Library/Godot Export Templates';
        const official = {
            kind: 'official',
            defaultPath: '/Library/Godot/export_templates',
            storagePath: '/Library/Godot/export_templates',
            status: 'healthy',
        };
        const imported = {
            ...official,
            kind: 'imported',
            defaultPath: '/Library/Godot/Imported Templates',
            storagePath: '/Library/Godot/Imported Templates',
        };
        dialog.showOpenDialog = async () => {
            if (state.storageScenario.pickerError)
                throw new Error(
                    `exportTemplates:storage.errors.${state.storageScenario.pickerError}`,
                );
            return { canceled: false, filePaths: [destination] };
        };
        const handlers: Record<string, (...args: any[]) => any> = {
            getStorageSettings: () =>
                state.storageScenario.loadError
                    ? failure('unavailable')
                    : success({
                          platform: 'darwin',
                          defaultGodotPath: official.defaultPath,
                          locations: [official, imported],
                          job: state.storageJob,
                          busy: !!state.storageScenario.busy,
                          recoveryRequired:
                              !!state.storageJob?.recoveryRequired,
                      }),
            prepareStorageMove: async (_event, kind, target) => {
                if (state.storageScenario.holdPrepare)
                    await new Promise<void>((resolve) => {
                        state.finishStoragePrepare = resolve;
                    });
                return state.storageScenario.prepareError
                    ? failure(state.storageScenario.prepareError)
                    : success({
                          token: 'review-token',
                          kind,
                          source:
                              kind === 'official'
                                  ? official.storagePath
                                  : imported.storagePath,
                          destination: target,
                          sizeBytes: 12_000_000_000,
                          fileCount: 160,
                          templateCount: 5,
                          availableBytes:
                              state.storageScenario.space === null
                                  ? null
                                  : state.storageScenario.space === false
                                    ? 0
                                    : 100_000_000_000,
                          spaceSufficient:
                              state.storageScenario.space === undefined
                                  ? true
                                  : state.storageScenario.space,
                          projects: [
                              'Project 2 with a very long name that should not fit',
                              'test',
                              ...Array.from(
                                  { length: 100 },
                                  (_, i) =>
                                      `Project ${i + 3} with a long name to review`,
                              ),
                          ],
                      });
            },
            startStorageMove: (_event, token) => {
                state.storageStartCalls.push(token);
                if (state.storageScenario.startError)
                    return failure(state.storageScenario.startError);
                state.storageJob = {
                    id: 'storage-job',
                    kind: 'official',
                    source: official.storagePath,
                    destination,
                    stage: 'moving',
                    completedBytes: 3_000_000_000,
                    totalBytes: 12_000_000_000,
                    cancellable: true,
                };
                return success();
            },
            cancelStorageMove: () => {
                if (state.storageScenario.cancelError)
                    return failure(state.storageScenario.cancelError);
                state.storageJob = {
                    ...state.storageJob,
                    stage: 'cancelled',
                    cancellable: false,
                };
                return success();
            },
            recoverStorageMove: async () => {
                if (state.storageScenario.holdRecover)
                    await new Promise<void>((resolve) => {
                        state.finishStorageRecover = resolve;
                    });
                if (state.storageScenario.recoverError)
                    return failure(state.storageScenario.recoverError);
                state.storageJob = {
                    ...state.storageJob,
                    stage: 'complete',
                    recoveryRequired: false,
                    error: undefined,
                    cancellable: false,
                };
                return success();
            },
        };
        for (const [name, handler] of Object.entries(handlers)) {
            const channel = `exportTemplates.${name}`;
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, handler);
        }
    }, scenario);
}

/** Opens relocation from the production Settings page.
 * @param kind - Storage collection selected for relocation.
 */
async function open(kind: 'official' | 'imported' = 'official') {
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabExportTemplates').click();
    await page.getByTestId(`templateStorageMove-${kind}`).click();
    const modal = page.getByTestId('templateStorageMoveDialog');
    await expect(modal).toBeVisible();
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
        test('pins capacity blockers and actions while affected projects scroll', async () => {
            await configure({ space: false, startError: 'changed' });
            const modal = await open();
            await expect(modal.getByRole('alert')).toContainText(
                'There is not enough free space',
            );
            const submit = modal.getByRole('button', {
                name: 'Move templates',
                exact: true,
            });
            await expect(submit).toBeDisabled();
            await modal
                .getByText('Affected projects (102)', { exact: true })
                .click();
            const projects = modal.getByTestId('templateStorageProjects');
            expect(
                await projects.evaluate(
                    (element) => element.scrollHeight > element.clientHeight,
                ),
            ).toBe(true);
            await projects.evaluate((element) => {
                element.scrollTop = element.scrollHeight;
            });
            await visibleWithoutScrolling(modal.getByRole('alert'));
            await visibleWithoutScrolling(
                modal.getByText(
                    '/Volumes/Template Library/Godot Export Templates',
                    { exact: true },
                ),
            );
            await visibleWithoutScrolling(
                modal.getByText(
                    'Close all Godot editors and stop exports before moving templates.',
                    { exact: true },
                ),
            );
            await visibleWithoutScrolling(submit);
            await visibleWithoutScrolling(
                modal.getByRole('button', {
                    name: 'Choose another folder',
                    exact: true,
                }),
            );
            expect(
                await app.evaluate(() => (globalThis as any).storageStartCalls),
            ).toHaveLength(0);
            await projects.evaluate((element) => {
                element.scrollTop = 0;
            });
            await page.screenshot({
                path: test.info().outputPath(`storage-space-${theme.name}.png`),
                animations: 'disabled',
            });
            await app.evaluate(() => {
                (globalThis as any).storageScenario.space = true;
            });
            await modal
                .getByRole('button', {
                    name: 'Choose another folder',
                    exact: true,
                })
                .click();
            await expect(submit).toBeEnabled();
            await expect(modal.getByRole('alert')).toHaveCount(0);
            const projectSummary = modal.getByText('Affected projects (102)', {
                exact: true,
            });
            if (
                !(await projectSummary.evaluate(
                    (element) =>
                        (element.parentElement as HTMLDetailsElement).open,
                ))
            )
                await projectSummary.click();
            await projects.evaluate((element) => {
                element.scrollTop = 0;
            });
            await page.mouse.move(0, 0);
            await page.screenshot({
                path: test
                    .info()
                    .outputPath(`storage-review-${theme.name}.png`),
                animations: 'disabled',
            });
            await submit.click();
            await expect(modal.getByRole('alert')).toContainText(
                'changed before the move could start',
            );
            await visibleWithoutScrolling(modal.getByRole('alert'));
            await visibleWithoutScrolling(
                modal.getByRole('button', {
                    name: 'Choose another folder',
                    exact: true,
                }),
            );
            await expect(submit).toHaveCount(0);
            await page.screenshot({
                path: test.info().outputPath(`storage-error-${theme.name}.png`),
                animations: 'disabled',
            });
            await modal
                .getByRole('button', { name: 'Cancel', exact: true })
                .click();
        });
        test('keeps progress, cancel failures and settings Retry visible', async () => {
            await configure({ cancelError: 'failed' });
            const modal = await open();
            await modal
                .getByRole('button', { name: 'Move templates', exact: true })
                .click();
            const progress = modal.getByTestId('templateStorageProgress');
            await expect(progress).toContainText('Moving');
            await visibleWithoutScrolling(progress);
            await visibleWithoutScrolling(
                modal.getByRole('button', { name: 'Cancel', exact: true }),
            );
            await page.keyboard.press('Escape');
            await expect(modal).toBeVisible();
            await page.screenshot({
                path: test
                    .info()
                    .outputPath(`storage-progress-${theme.name}.png`),
                animations: 'disabled',
            });
            await modal
                .getByRole('button', { name: 'Cancel', exact: true })
                .click();
            await expect(modal.getByRole('alert')).toContainText(
                'move could not complete',
            );
            await app.evaluate(() => {
                (globalThis as any).storageScenario.loadError = true;
            });
            await expect(modal.getByRole('alert')).toContainText(
                'Unable to load template storage settings',
            );
            await visibleWithoutScrolling(modal.getByRole('alert'));
            await visibleWithoutScrolling(
                modal.getByRole('button', { name: 'Retry', exact: true }),
            );
            await visibleWithoutScrolling(
                modal.getByRole('button', { name: 'Cancel', exact: true }),
            );
            await modal
                .getByRole('button', { name: 'Retry', exact: true })
                .click();
            await expect(modal.getByRole('alert')).toContainText(
                'Unable to load template storage settings',
            );
            await app.evaluate(() => {
                (globalThis as any).storageScenario.loadError = false;
                (globalThis as any).storageScenario.cancelError = undefined;
            });
            await expect(modal.getByRole('alert')).not.toContainText(
                'Unable to load',
            );
            await modal
                .getByRole('button', { name: 'Cancel', exact: true })
                .click();
            await expect(
                modal.getByTestId('templateStorageProgress'),
            ).toContainText('still in their original location');
            await visibleWithoutScrolling(
                modal.getByRole('button', { name: 'Done', exact: true }),
            );
            await modal
                .getByRole('button', { name: 'Done', exact: true })
                .click();
        });
        test('shows a compact recovery result and blocks dismissal while recovering', async () => {
            const modal = await open();
            await modal
                .getByRole('button', { name: 'Move templates', exact: true })
                .click();
            await expect(
                modal.getByTestId('templateStorageProgress'),
            ).toBeVisible();
            await app.evaluate(() => {
                const state = globalThis as any;
                state.storageJob = {
                    ...state.storageJob,
                    stage: 'error',
                    cancellable: false,
                    error: 'exportTemplates:storage.errors.recovery',
                    recoveryRequired: true,
                };
                state.storageScenario.holdRecover = true;
                state.storageScenario.recoverError = 'unavailable';
            });
            await expect(modal.getByRole('alert')).toContainText(
                'needs recovery',
            );
            await visibleWithoutScrolling(modal.getByRole('alert'));
            const recover = modal.getByRole('button', {
                name: 'Recover files',
                exact: true,
            });
            await visibleWithoutScrolling(recover);
            await visibleWithoutScrolling(
                modal.getByRole('button', { name: 'Done', exact: true }),
            );
            await page.screenshot({
                path: test
                    .info()
                    .outputPath(`storage-recovery-${theme.name}.png`),
                animations: 'disabled',
            });
            await recover.click();
            await expect(
                modal.getByTestId('templateStorageProgress'),
            ).toContainText('Recover files');
            await expect(modal.getByRole('alert')).toHaveCount(0);
            await expect(
                modal.getByRole('button', { name: 'Done', exact: true }),
            ).toHaveCount(0);
            await page.keyboard.press('Escape');
            await expect(modal).toBeVisible();
            await app.evaluate(() =>
                (globalThis as any).finishStorageRecover(),
            );
            await expect(modal.getByRole('alert')).toContainText(
                'Reconnect the drive',
            );
            await visibleWithoutScrolling(modal.getByRole('alert'));
            await visibleWithoutScrolling(recover);
            await app.evaluate(() => {
                const scenario = (globalThis as any).storageScenario;
                scenario.holdRecover = false;
                scenario.recoverError = undefined;
            });
            await recover.click();
            await expect(
                modal.getByTestId('templateStorageProgress'),
            ).toContainText('new location');
            await expect(modal.getByRole('alert')).toHaveCount(0);
            await visibleWithoutScrolling(
                modal.getByRole('button', { name: 'Done', exact: true }),
            );
            await modal
                .getByRole('button', { name: 'Done', exact: true })
                .click();
        });
        test('handles preparation failures and explains a disabled confirmation', async () => {
            await configure({ holdPrepare: true, prepareError: 'destination' });
            let modal = await open('imported');
            await visibleWithoutScrolling(modal.getByRole('status'));
            await visibleWithoutScrolling(
                modal.getByRole('button', { name: 'Cancel', exact: true }),
            );
            await app.evaluate(() =>
                (globalThis as any).finishStoragePrepare(),
            );
            await expect(modal.getByRole('alert')).toContainText(
                'different writable folder',
            );
            await visibleWithoutScrolling(modal.getByRole('alert'));
            await visibleWithoutScrolling(
                modal.getByRole('button', {
                    name: 'Choose another folder',
                    exact: true,
                }),
            );
            await modal
                .getByRole('button', { name: 'Cancel', exact: true })
                .click();
            await configure({ pickerError: 'destination' });
            modal = await open('imported');
            await expect(modal.getByRole('alert')).toContainText(
                'different writable folder',
            );
            await visibleWithoutScrolling(modal.getByRole('alert'));
            await visibleWithoutScrolling(
                modal.getByRole('button', {
                    name: 'Choose another folder',
                    exact: true,
                }),
            );
            await expect(
                modal.getByText(
                    '/Volumes/Template Library/Godot Export Templates',
                    { exact: true },
                ),
            ).toHaveCount(0);
            await app.evaluate(() => {
                (globalThis as any).storageScenario.pickerError = undefined;
                (globalThis as any).storageScenario.space = null;
            });
            await modal
                .getByRole('button', {
                    name: 'Choose another folder',
                    exact: true,
                })
                .click();
            await expect(modal).toContainText(
                'Available space could not be checked',
            );
            const submit = modal.getByRole('button', {
                name: 'Move templates',
                exact: true,
            });
            await expect(submit).toBeEnabled();
            await app.evaluate(() => {
                (globalThis as any).storageScenario.busy = true;
            });
            await expect(modal.getByRole('alert')).toContainText(
                'Another template operation',
            );
            await expect(submit).toBeDisabled();
            await visibleWithoutScrolling(modal.getByRole('alert'));
            await modal
                .getByRole('button', { name: 'Cancel', exact: true })
                .click();
        });
    });
}
