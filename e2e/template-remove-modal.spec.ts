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
        await app?.close();
    } finally {
        if (home) await fs.rm(home, { recursive: true, force: true });
    }
});

/** Installs deletion responses behind the actual Electron preload bridge.
 * @param scenario - Number of project references and optional injected failures.
 */
async function configure(
    scenario: {
        count?: number;
        readError?: string;
        removeError?: string;
        missing?: boolean;
        holdRemove?: boolean;
        busy?: boolean;
    } = {},
) {
    await app.evaluate(({ ipcMain }, options) => {
        const state = globalThis as any;
        state.removeScenario = options;
        state.removeCalls = [];
        const success = (data?: unknown) => ({ success: true, data });
        const failure = (key: string) => ({
            success: false,
            error: { type: 'Error', message: `exportTemplates:${key}` },
        });
        const build = {
            id: 'remove-modal-build',
            revision: 'reviewed-revision',
            directoryName: 'My imported templates',
            label: 'My imported templates',
            setId: '4.7.2.stable.mono',
            importedAt: '',
            archiveName: '',
            files: ['linux_release.x86_64'],
            sizeBytes: 2048,
            available: true,
        };
        const references = Array.from(
            { length: options.count ?? 40 },
            (_, i) => ({
                projectPath: `/fixture/project-${i}`,
                projectName:
                    i === 0
                        ? 'Project 2 with a very long name that should not fit'
                        : i === 1
                          ? 'test'
                          : `Project ${i + 1} with a long name`,
                currentSetId: '4.7.2.stable.mono',
                active: i % 2 === 0,
            }),
        );
        const handlers: Record<string, (...args: any[]) => any> = {
            getImportedTemplates: () =>
                state.removeScenario.readError
                    ? failure(state.removeScenario.readError)
                    : success({
                          schemaVersion: 1,
                          builds: state.removeScenario.missing
                              ? []
                              : [
                                    build,
                                    {
                                        ...build,
                                        id: 'replacement-build',
                                        label: 'Other templates',
                                    },
                                ],
                          usage: {
                              [build.id]: references
                                  .filter((ref) => ref.active)
                                  .map((ref) => ref.projectName),
                          },
                          references: { [build.id]: references },
                      }),
            removeImportedTemplate: async (_event, id, review) => {
                state.removeCalls.push({ id, review });
                if (state.removeScenario.holdRemove)
                    await new Promise<void>((resolve) => {
                        state.finishRemove = resolve;
                    });
                return state.removeScenario.removeError
                    ? failure(state.removeScenario.removeError)
                    : success();
            },
            getJobs: () =>
                success(
                    state.removeScenario.busy
                        ? [
                              {
                                  id: 'busy-job',
                                  setId: '4.7.2.stable',
                                  stage: 'copying',
                              },
                          ]
                        : [],
                ),
        };
        for (const [name, handler] of Object.entries(handlers)) {
            const channel = `exportTemplates.${name}`;
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, handler);
        }
    }, scenario);
}

/** Opens deletion from the production imported library. */
async function open() {
    await page.getByTestId('btnExportTemplates').click();
    await page
        .getByRole('article', { name: 'My imported templates', exact: true })
        .getByRole('button', { name: 'Delete imported build', exact: true })
        .click();
    const modal = page.getByTestId('templateRemoveModal');
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
        test('keeps replacement, errors and refresh visible while affected projects scroll', async () => {
            await configure({ removeError: 'errors.changed' });
            const modal = await open();
            const replacement = modal.getByRole('button', {
                name: /^Replacement build:/,
            });
            const submit = modal.getByRole('button', {
                name: 'Switch and delete',
                exact: true,
            });
            await visibleWithoutScrolling(replacement);
            await modal
                .getByText('Affected projects (40)', { exact: true })
                .click();
            const projects = modal.getByTestId('templateRemoveProjects');
            expect(
                await projects.evaluate(
                    (element) => element.scrollHeight > element.clientHeight,
                ),
            ).toBe(true);
            await page.screenshot({
                path: test.info().outputPath(`remove-review-${theme.name}.png`),
                animations: 'disabled',
            });
            await projects.evaluate((element) => {
                element.scrollTop = element.scrollHeight;
            });
            await visibleWithoutScrolling(replacement);
            await visibleWithoutScrolling(submit);
            await submit.click();
            await expect(modal.getByRole('alert')).toContainText(
                'Files changed since review',
            );
            await visibleWithoutScrolling(modal.getByRole('alert'));
            await visibleWithoutScrolling(
                modal.getByRole('button', { name: 'Refresh', exact: true }),
            );
            await visibleWithoutScrolling(
                modal.getByRole('button', { name: 'Cancel', exact: true }),
            );
            await expect(submit).toBeDisabled();
            await page.screenshot({
                path: test.info().outputPath(`remove-error-${theme.name}.png`),
                animations: 'disabled',
            });
            await app.evaluate(() => {
                (globalThis as any).removeScenario.removeError = undefined;
            });
            await modal
                .getByRole('button', { name: 'Refresh', exact: true })
                .click();
            await expect(modal.getByRole('alert')).toHaveCount(0);
            await replacement.click();
            await page
                .getByRole('option', {
                    name: 'Other templates - 4.7.2.stable - .NET',
                    exact: true,
                })
                .click();
            await submit.click();
            await expect(modal).toBeHidden();
            const calls = await app.evaluate(
                () => (globalThis as any).removeCalls,
            );
            expect(calls).toHaveLength(2);
            expect(calls[1].review).toMatchObject({
                replacement: 'replacement-build',
                revision: 'reviewed-revision',
            });
            expect(calls[1].review.references).toHaveLength(40);
        });
        test('keeps loading failures and missing-build recovery visible', async () => {
            const modal = await open();
            await app.evaluate(() => {
                (globalThis as any).removeScenario.removeError =
                    'errors.recovery';
            });
            await modal
                .getByRole('button', { name: 'Switch and delete', exact: true })
                .click();
            await expect(modal.getByRole('alert')).toContainText(
                'needs recovery',
            );
            await visibleWithoutScrolling(modal.getByRole('alert'));
            await app.evaluate(() => {
                (globalThis as any).removeScenario.readError = 'errors.read';
            });
            await modal
                .getByRole('button', { name: 'Refresh', exact: true })
                .click();
            await expect(modal.getByRole('alert')).toContainText(
                'could not be read',
            );
            await visibleWithoutScrolling(modal.getByRole('alert'));
            await visibleWithoutScrolling(
                modal.getByRole('button', { name: 'Refresh', exact: true }),
            );
            await app.evaluate(() => {
                const scenario = (globalThis as any).removeScenario;
                scenario.readError = undefined;
                scenario.missing = true;
            });
            await modal
                .getByRole('button', { name: 'Refresh', exact: true })
                .click();
            await expect(modal.getByRole('alert')).toContainText(
                'selected imported build is missing',
            );
            await visibleWithoutScrolling(modal.getByRole('alert'));
            await expect(
                modal.getByRole('button', {
                    name: /^(Delete imported build|Switch and delete)$/,
                }),
            ).toBeDisabled();
            await modal
                .getByRole('button', { name: 'Cancel', exact: true })
                .click();
        });
        test('explains blocking activity and protects a pending deletion', async () => {
            await configure({ count: 0, holdRemove: true });
            const modal = await open();
            const submit = modal.getByRole('button', {
                name: 'Delete imported build',
                exact: true,
            });
            await app.evaluate(() => {
                (globalThis as any).removeScenario.busy = true;
            });
            await expect(modal.getByRole('status')).toContainText(
                'Another template operation',
            );
            await visibleWithoutScrolling(modal.getByRole('status'));
            await expect(submit).toBeDisabled();
            await app.evaluate(() => {
                (globalThis as any).removeScenario.busy = false;
            });
            await expect(submit).toBeEnabled();
            await submit.click();
            await expect(submit).toBeDisabled();
            await expect(
                modal.getByRole('button', { name: 'Cancel', exact: true }),
            ).toBeDisabled();
            await page.keyboard.press('Escape');
            await expect(modal).toBeVisible();
            await app.evaluate(() => (globalThis as any).finishRemove());
            await expect(modal).toBeHidden();
        });
    });
}
