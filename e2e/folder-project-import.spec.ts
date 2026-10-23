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
import type { FolderProjectScanResult } from '@shared/contracts';
import { getMainWindow } from './splashscreen/getMainWindow';
import {
    applyTheme,
    createFixtureHome,
    prepareAppWithStubbedData,
    setAppLanguage,
} from './support/e2e-fixture-runtime';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { THEMES } from './support/e2e-fixture-theme';

test.setTimeout(60_000);
for (const theme of THEMES) {
    test.describe(`folder import at 1024x600 (${theme.name})`, () => {
        let app: ElectronApplication;
        let page: Page;
        let home: string;
        let folder: string;
        test.beforeAll(async () => {
            home = await createFixtureHome();
            folder = path.join(home, 'scan');
            for (let index = 0; index < 9; index++) {
                const directory = path.join(folder, `game-${index}`);
                await fs.mkdir(directory, { recursive: true });
                await fs.writeFile(
                    path.join(directory, 'project.godot'),
                    `config_version=5\n[application]\nconfig/name="Game ${index}"\nconfig/features=PackedStringArray("4.4")\n`,
                );
            }
            await fs.mkdir(path.join(folder, 'invalid'));
            await fs.writeFile(
                path.join(folder, 'invalid', 'project.godot'),
                'invalid project',
            );
            const env: Record<string, string> = {
                ...Object.fromEntries(
                    Object.entries(process.env).filter(
                        (entry): entry is [string, string] =>
                            typeof entry[1] === 'string',
                    ),
                ),
                GODOT_LAUNCHER_E2E_FIXTURES: '1',
                GODOT_LAUNCHER_E2E_HOME_DIR: home,
            };
            delete env.ELECTRON_RUN_AS_NODE;
            app = await _electron.launch({
                args: [
                    '.',
                    `--user-data-dir=${path.join(home, 'electron-user-data')}`,
                ],
                env,
            });
            page = await getMainWindow(app);
            await setAppLanguage(page, 'English');
            await prepareAppWithStubbedData(page, app, {
                projects: SAMPLE_PROJECTS,
            });
            await applyTheme(page, theme);
            await app.evaluate(
                ({ ipcMain }, injected) => {
                    const state = globalThis as typeof globalThis & {
                        folderCalls: unknown[];
                        holdAdd?: boolean;
                        holdAddFile?: string;
                        releaseAdd?: () => void;
                    };
                    state.folderCalls = [];
                    ipcMain.removeHandler('app.openFileDialog');
                    ipcMain.handle('app.openFileDialog', (_event, ...args) => {
                        state.folderCalls.push({ picker: args });
                        return {
                            success: true,
                            data: {
                                canceled: false,
                                filePaths: [injected.folder],
                            },
                        };
                    });
                    ipcMain.removeHandler('projects.inspectProjectImports');
                    ipcMain.handle(
                        'projects.inspectProjectImports',
                        (_event, paths: string[]) => ({
                            success: true,
                            data: paths.map((file) => {
                                const index = Number(
                                    file.match(/game-(\d+)/)?.[1] ?? 0,
                                );
                                return {
                                    projectFilePath: file,
                                    directory: file.replace(
                                        /[\\/][^\\/]+$/,
                                        '',
                                    ),
                                    name: `Game ${index}`,
                                    godotName: `Game ${index}`,
                                    registered: index === 0,
                                    editorRequest: {
                                        kind: 'stable-base',
                                        channel: 'official',
                                        flavor: 'gdscript',
                                        base_version: '4.4',
                                    },
                                    editorResolution: {
                                        requested: {
                                            kind: 'stable-base',
                                            channel: 'official',
                                            flavor: 'gdscript',
                                            base_version: '4.4',
                                        },
                                        choices: [
                                            {
                                                id: 'fixture-installed',
                                                version: '4.4.3-stable',
                                                source: 'official',
                                                flavor: 'gdscript',
                                                installed: true,
                                                recommended: true,
                                            },
                                        ],
                                    },
                                };
                            }),
                        }),
                    );
                    ipcMain.removeHandler('projects.addProject');
                    ipcMain.handle(
                        'projects.addProject',
                        async (_event, file: string, options) => {
                            if (state.holdAdd || file === state.holdAddFile) {
                                state.holdAddFile = undefined;
                                state.holdAdd = false;
                                await new Promise<void>((resolve) => {
                                    state.releaseAdd = resolve;
                                });
                            }
                            state.folderCalls.push({ file, options });
                            if (
                                file.endsWith('game-8/project.godot') ||
                                file.endsWith('game-8\\project.godot')
                            )
                                return {
                                    success: true,
                                    data: {
                                        success: false,
                                        error: 'Project folder unavailable',
                                    },
                                };
                            const project = {
                                ...injected.sample,
                                path: file.replace(/[\\/][^\\/]+$/, ''),
                                name: options.name,
                            };
                            return {
                                success: true,
                                data: {
                                    success: true,
                                    newProject: project,
                                    projects: [project],
                                },
                            };
                        },
                    );
                },
                { folder, sample: SAMPLE_PROJECTS[0] },
            );
        });
        test.afterAll(async () => {
            await app?.close();
            await fs.rm(home, { recursive: true, force: true });
        });

        /** Opens the source menu and chooses the native single-folder flow. */
        async function openScan() {
            const contentSize = await app.evaluate(({ BrowserWindow }) => {
                const main = BrowserWindow.getAllWindows().find((window) =>
                    window.webContents
                        .getURL()
                        .startsWith('http://localhost:5123'),
                )!;
                main.setSize(1024, 600);
                return main.getContentSize();
            });
            await page.setViewportSize({
                width: contentSize[0],
                height: contentSize[1],
            });
            await page.getByTestId('btnProjectAdd').click();
            const sourceMenu = page.getByRole('dialog', {
                name: 'Add project from',
            });
            const divider = sourceMenu.getByRole('separator', {
                includeHidden: true,
            });
            await expect(divider).toBeVisible();
            const localBounds = await page
                .getByTestId('btnAddProjectScanFolder')
                .boundingBox();
            const dividerBounds = await divider.boundingBox();
            const remoteBounds = await page
                .getByTestId('btnAddProjectPublicGit')
                .boundingBox();
            expect(dividerBounds!.y).toBeGreaterThanOrEqual(
                localBounds!.y + localBounds!.height,
            );
            expect(
                dividerBounds!.y + dividerBounds!.height,
            ).toBeLessThanOrEqual(remoteBounds!.y);
            await page.screenshot({
                animations: 'disabled',
                path: test.info().outputPath('folder-import-add-menu.png'),
            });
            await page.getByTestId('btnAddProjectScanFolder').click();
            return page.getByTestId('folderProjectImportDialog');
        }
        /** Confirms fixed actions remain inside the minimum Electron viewport.
         * @param modal - Current native workflow dialog.
         */
        async function assertFits(modal: Locator) {
            await expect(modal).toBeVisible();
            const bounds = await modal.evaluate((element) => {
                const panel = element
                    .querySelector('section')!
                    .getBoundingClientRect();
                const footer = element
                    .querySelector('footer')
                    ?.getBoundingClientRect();
                return {
                    width: innerWidth,
                    height: innerHeight,
                    top: panel.top,
                    bottom: panel.bottom,
                    footerBottom: footer?.bottom ?? panel.bottom,
                    bodyOverflow:
                        document.documentElement.scrollWidth > innerWidth,
                };
            });
            expect(bounds.width).toBe(1024);
            const windowSize = await app.evaluate(({ BrowserWindow }) => {
                const main = BrowserWindow.getAllWindows().find((window) =>
                    window.webContents
                        .getURL()
                        .startsWith('http://localhost:5123'),
                )!;
                return {
                    outer: main.getSize(),
                    content: main.getContentSize(),
                };
            });
            expect(windowSize.outer).toEqual([1024, 600]);
            expect(bounds.height).toBe(windowSize.content[1]);
            expect(bounds.top).toBeGreaterThanOrEqual(0);
            expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
            expect(bounds.footerBottom).toBeLessThanOrEqual(bounds.height);
            expect(bounds.bodyOverflow).toBe(false);
            for (const button of await modal.locator('footer button').all())
                await expect(button).toBeInViewport({ ratio: 1 });
        }
        /** Returns deterministic partial findings for terminal and cancellation states.
         * @param status - Scan termination state.
         */
        function scanResult(
            status: FolderProjectScanResult['status'],
        ): FolderProjectScanResult {
            return {
                scanId: '',
                folder,
                status,
                projects: [
                    {
                        name: 'Game 0',
                        relativePath: 'game-0',
                        projectFilePath: path.join(
                            folder,
                            'game-0',
                            'project.godot',
                        ),
                        detectedEditor: null,
                    },
                    {
                        name: 'Game 1',
                        relativePath: 'game-1',
                        projectFilePath: path.join(
                            folder,
                            'game-1',
                            'project.godot',
                        ),
                        detectedEditor: null,
                    },
                ],
                issues: [
                    {
                        relativePath: 'archive/invalid/project.godot',
                        reason: 'invalid-project',
                    },
                    {
                        relativePath:
                            'private/' + 'nested/'.repeat(35) + 'folder',
                        reason: 'unreadable-folder',
                    },
                ],
                omittedIssueCount: 0,
                visitedDirectories: 7,
                visitedEntries: 14,
            };
        }
        /** Installs a terminal or pending scan fixture through the real preload boundary.
         * @param result - Terminal findings to return.
         * @param pending - Whether Stop scan must resolve the in-flight operation.
         */
        async function stubScan(
            result: FolderProjectScanResult,
            pending = false,
        ) {
            await app.evaluate(
                ({ ipcMain, BrowserWindow }, injected) => {
                    let finish: ((value: unknown) => void) | undefined;
                    let activeId = '';
                    ipcMain.removeHandler('projects.scanProjectFolder');
                    ipcMain.handle(
                        'projects.scanProjectFolder',
                        (_event, _folder, scanId) => {
                            activeId = scanId;
                            for (const window of BrowserWindow.getAllWindows())
                                window.webContents.send(
                                    'folder-project-scan-progress',
                                    {
                                        scanId,
                                        visitedDirectories: 7,
                                        visitedEntries: 14,
                                        projectCount: 2,
                                    },
                                );
                            if (injected.pending)
                                return new Promise((resolve) => {
                                    finish = resolve;
                                });
                            return {
                                success: true,
                                data: { ...injected.result, scanId },
                            };
                        },
                    );
                    ipcMain.removeHandler('projects.cancelProjectFolderScan');
                    ipcMain.handle(
                        'projects.cancelProjectFolderScan',
                        (_event, scanId) => {
                            if (scanId !== activeId)
                                return { success: true, data: false };
                            finish?.({
                                success: true,
                                data: {
                                    ...injected.result,
                                    scanId,
                                    status: 'cancelled',
                                },
                            });
                            return { success: true, data: true };
                        },
                    );
                },
                { result, pending },
            );
        }

        test('native picker cancellation leaves Projects unchanged', async () => {
            await prepareAppWithStubbedData(page, app, { projects: [] });
            await applyTheme(page, theme);
            await expect(page.getByTestId('projectsWelcome')).toBeVisible();
            await app.evaluate(({ ipcMain }) => {
                ipcMain.removeHandler('app.openFileDialog');
                ipcMain.handle('app.openFileDialog', () => ({
                    success: true,
                    data: { canceled: true, filePaths: [] },
                }));
            });
            await page.getByTestId('btnWelcomeScanFolder').click();
            await expect(
                page.getByTestId('folderProjectImportDialog'),
            ).not.toBeVisible();
            await app.evaluate(({ ipcMain }, folder) => {
                ipcMain.removeHandler('app.openFileDialog');
                ipcMain.handle('app.openFileDialog', (_event, ...args) => {
                    (
                        globalThis as typeof globalThis & {
                            folderCalls: unknown[];
                        }
                    ).folderCalls.push({ picker: args });
                    return {
                        success: true,
                        data: { canceled: false, filePaths: [folder] },
                    };
                });
            }, folder);
            await prepareAppWithStubbedData(page, app, {
                projects: SAMPLE_PROJECTS,
            });
            await applyTheme(page, theme);
        });
        test('real discovery keeps valid projects, identifies registered entries and registers reviewed choices', async () => {
            const original = await fs.readFile(
                path.join(folder, 'game-1', 'project.godot'),
                'utf8',
            );
            const modal = await openScan();
            await expect(
                modal.getByRole('heading', { name: 'Choose projects to add' }),
            ).toBeVisible();
            await assertFits(modal);
            await expect(modal.getByText('Scan problems: 1')).toBeVisible();
            const list = modal.getByRole('region', {
                name: 'Choose projects to add',
            });
            await expect(
                list.getByRole('heading', { name: 'Available', exact: true }),
            ).toBeVisible();
            await expect(
                list.getByRole('heading', {
                    name: 'Already added',
                    exact: true,
                }),
            ).toHaveCount(1);
            await expect(
                list.getByRole('heading', {
                    name: 'Unable to add',
                    exact: true,
                }),
            ).toHaveCount(0);
            const availableGroup = list.getByRole('region', {
                name: 'Available',
                exact: true,
            });
            await expect(availableGroup.getByRole('checkbox')).toHaveCount(9);
            await expect(
                availableGroup.getByText('8', { exact: true }),
            ).toBeVisible();
            const registered = list.getByRole('listitem').filter({
                has: page.getByText('Game 0', { exact: true }),
            });
            await registered.scrollIntoViewIfNeeded();
            await expect(
                registered.getByText('Already added', { exact: true }),
            ).toBeVisible();
            await expect(registered.getByRole('checkbox')).toHaveCount(0);
            await expect(
                registered.getByRole('button', {
                    name: /Edit name|Godot Editor|Code Editor/,
                }),
            ).toHaveCount(0);
            await expect(
                registered.getByText('Requested: 4.4 · Standard'),
            ).toBeVisible();
            await registered.getByRole('button', { name: 'Copy path' }).click();
            await expect
                .poll(() =>
                    app.evaluate(({ clipboard }) => clipboard.readText()),
                )
                .toBe(path.join(folder, 'game-0'));
            await expect(
                registered.getByRole('button', { name: 'Copy path' }),
            ).toBeVisible();
            expect(
                await list.evaluate(
                    (el) => getComputedStyle(el, '::-webkit-scrollbar').width,
                ),
            ).toBe('12px');
            expect(
                await list.evaluate((el) => getComputedStyle(el).overflowY),
            ).toBe('scroll');
            expect(
                await list.evaluate(
                    (el) => el.getBoundingClientRect().width - el.clientWidth,
                ),
            ).toBeGreaterThanOrEqual(12);
            const scrollbar = await list.evaluate((el) => ({
                track: getComputedStyle(el, '::-webkit-scrollbar-track')
                    .backgroundColor,
                thumbBorder: getComputedStyle(el, '::-webkit-scrollbar-thumb')
                    .borderColor,
                thumbClip: getComputedStyle(el, '::-webkit-scrollbar-thumb')
                    .backgroundClip,
            }));
            expect(scrollbar.track).toBe('rgba(0, 0, 0, 0)');
            expect(scrollbar.thumbBorder).toBe('rgba(0, 0, 0, 0)');
            expect(scrollbar.thumbClip).toBe('padding-box');
            await page.mouse.move(0, 0);
            await page.screenshot({
                animations: 'disabled',
                path: test.info().outputPath('folder-import-already-added.png'),
            });
            await list.evaluate((el) => {
                el.scrollTop = 0;
            });
            await page.mouse.move(0, 0);
            await page.screenshot({
                animations: 'disabled',
                path: test.info().outputPath('folder-import-review.png'),
            });
            const available = modal.getByRole('checkbox', {
                name: 'Include project: Game 1',
                exact: true,
            });
            await available.uncheck();
            await expect(available).toBeEnabled();
            await expect(available).not.toBeChecked();
            await expect(
                modal.getByRole('button', {
                    name: 'Add selected projects (7)',
                    exact: true,
                }),
            ).toBeEnabled();
            await page.mouse.move(0, 0);
            await page.screenshot({
                animations: 'disabled',
                path: test
                    .info()
                    .outputPath('folder-import-review-unselected.png'),
            });
            await available.check();
            await availableGroup
                .getByText(path.join(folder, 'game-8'), { exact: true })
                .scrollIntoViewIfNeeded();
            await expect(
                availableGroup.getByText(path.join(folder, 'game-8'), {
                    exact: true,
                }),
            ).toBeInViewport();
            await list.evaluate((el) => {
                el.scrollTop = 0;
            });
            await modal
                .getByRole('button', { name: 'Edit name: Game 1', exact: true })
                .click();
            await modal
                .getByLabel('Name in Godot Launcher', { exact: true })
                .fill('Renamed Game');
            await modal
                .getByRole('button', { name: 'Ok', exact: true })
                .click();
            await app.evaluate(() => {
                (
                    globalThis as typeof globalThis & { holdAdd: boolean }
                ).holdAdd = true;
            });
            await modal
                .getByRole('button', {
                    name: 'Add selected projects (8)',
                    exact: true,
                })
                .click();
            await expect(modal.getByRole('status')).toContainText(
                'Adding projects: 0/8',
            );
            const progressBar = modal.getByRole('progressbar', {
                name: 'Adding projects: 0/8',
            });
            await expect(progressBar).toBeInViewport({ ratio: 1 });
            await expect(progressBar).toHaveAttribute('max', '8');
            await expect(progressBar).toHaveAttribute('value', '0');
            const barBounds = await progressBar.boundingBox();
            expect(barBounds!.width).toBeGreaterThan(350);
            expect(barBounds!.height).toBeGreaterThanOrEqual(10);
            await assertFits(modal);
            await page.screenshot({
                path: test.info().outputPath('folder-import-adding.png'),
            });
            await app.evaluate(
                (_electron, file) => {
                    (
                        globalThis as typeof globalThis & {
                            holdAddFile: string;
                        }
                    ).holdAddFile = file;
                },
                path.join(folder, 'game-4', 'project.godot'),
            );
            await app.evaluate(() => {
                (
                    globalThis as typeof globalThis & {
                        releaseAdd?: () => void;
                    }
                ).releaseAdd?.();
            });
            const advancingProgress = modal.getByRole('progressbar', {
                name: 'Adding projects: 3/8',
            });
            await expect(advancingProgress).toHaveAttribute('value', '3');
            await expect(advancingProgress).toHaveAttribute('max', '8');
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.screenshot({
                path: test.info().outputPath('folder-import-progress.png'),
            });
            await page.emulateMedia({ reducedMotion: 'no-preference' });
            await app.evaluate(() => {
                (
                    globalThis as typeof globalThis & {
                        releaseAdd?: () => void;
                    }
                ).releaseAdd?.();
            });
            await expect(
                modal.getByText('Project import complete', { exact: true }),
            ).toBeVisible();
            await expect(modal.getByRole('progressbar')).toHaveCount(0);
            await assertFits(modal);
            const results = modal.getByRole('list', {
                name: 'Project import complete',
            });
            expect(
                await results.evaluate(
                    (el) => getComputedStyle(el, '::-webkit-scrollbar').width,
                ),
            ).toBe('12px');
            await results.evaluate((el) => {
                el.scrollTop = el.scrollHeight;
            });
            await expect(
                modal.getByText('Failed: Project folder unavailable'),
            ).toBeVisible();
            const calls = await app.evaluate(
                () =>
                    (
                        globalThis as typeof globalThis & {
                            folderCalls: Array<{
                                file?: string;
                                options?: unknown;
                                picker?: unknown[];
                            }>;
                        }
                    ).folderCalls,
            );
            expect(calls.filter((call) => call.file)).toHaveLength(8);
            expect(
                calls.find((call) =>
                    call.file?.endsWith(path.join('game-1', 'project.godot')),
                )?.options,
            ).toMatchObject({
                name: 'Renamed Game',
                resolution: 'use_selected',
                editorChoiceId: 'fixture-installed',
            });
            expect(calls.find((call) => call.picker)?.picker?.[3]).toEqual([
                'openDirectory',
            ]);
            expect(
                await fs.readFile(
                    path.join(folder, 'game-1', 'project.godot'),
                    'utf8',
                ),
            ).toBe(original);
            await page.screenshot({
                path: test.info().outputPath('folder-import-results.png'),
            });
            await modal
                .getByRole('button', { name: 'Done', exact: true })
                .click();
            await expect(modal).not.toBeVisible();
        });
        test('Stop scan retains partial results and long scan problems fit the modal', async () => {
            await stubScan(scanResult('complete'), true);
            const modal = await openScan();
            await expect(
                modal.getByText('Scanning for projects', { exact: true }),
            ).toBeVisible();
            await expect(
                modal.getByText('7 folders checked · 2 projects found'),
            ).toBeVisible();
            await assertFits(modal);
            await page.screenshot({
                path: test.info().outputPath('folder-import-scanning.png'),
            });
            await modal
                .getByRole('button', { name: 'Stop scan', exact: true })
                .click();
            await expect(
                modal.getByText(
                    'Scan stopped. You can add the projects found so far.',
                ),
            ).toBeVisible();
            await modal.locator('summary').click();
            await expect(
                modal.getByText('Folder could not be read', { exact: true }),
            ).toBeAttached();
            await assertFits(modal);
            await expect(
                modal.getByRole('button', {
                    name: 'Add selected projects (1)',
                    exact: true,
                }),
            ).toBeEnabled();
            await page.screenshot({
                path: test.info().outputPath('folder-import-review.png'),
            });
            await modal
                .getByRole('button', { name: 'Cancel', exact: true })
                .click();
        });
        test('retries retain unrelated failures and report review refresh failures', async () => {
            for (const refreshMode of [
                'retry',
                'reject',
                'row-error',
                'mixed-row-error',
                'registered',
            ] as const) {
                const mixed = refreshMode === 'mixed-row-error';
                await prepareAppWithStubbedData(page, app, {
                    projects: SAMPLE_PROJECTS,
                });
                await applyTheme(page, theme);
                const result = scanResult('complete');
                result.projects.push({
                    name: 'Game 2',
                    relativePath: 'game-2',
                    projectFilePath: path.join(
                        folder,
                        'game-2',
                        'project.godot',
                    ),
                    detectedEditor: null,
                });
                if (mixed)
                    result.projects.push({
                        name: 'Game 3',
                        relativePath: 'game-3',
                        projectFilePath: path.join(
                            folder,
                            'game-3',
                            'project.godot',
                        ),
                        detectedEditor: null,
                    });
                await stubScan(result);
                await app.evaluate(
                    ({ ipcMain }, injected) => {
                        const reviewed = new Set<string>();
                        let failInspection = false;
                        let refreshing = false;
                        const requested = {
                            kind: 'stable-base',
                            channel: 'official',
                            flavor: 'gdscript',
                            base_version: '4.4',
                        };
                        const resolution = {
                            requested,
                            choices: [
                                {
                                    id: 'fixture-installed',
                                    version: '4.4.3-stable',
                                    source: 'official',
                                    flavor: 'gdscript',
                                    installed: true,
                                    recommended: true,
                                },
                            ],
                        };
                        ipcMain.removeHandler('projects.inspectProjectImports');
                        ipcMain.handle(
                            'projects.inspectProjectImports',
                            (_event, paths: string[]) => {
                                if (failInspection)
                                    return {
                                        success: false,
                                        error: 'Review unavailable',
                                    };
                                return {
                                    success: true,
                                    data: paths.map((file) => {
                                        const index = Number(
                                            file.match(/game-(\d+)/)?.[1] ?? 0,
                                        );
                                        return {
                                            projectFilePath: file,
                                            directory: file.replace(
                                                /[\\/][^\\/]+$/,
                                                '',
                                            ),
                                            name: `Game ${index}`,
                                            godotName: `Game ${index}`,
                                            registered: index === 0,
                                            ...(refreshing &&
                                            index === 2 &&
                                            injected.refreshMode.includes(
                                                'row-error',
                                            )
                                                ? {
                                                      name: '',
                                                      error: 'Project file is unreadable',
                                                  }
                                                : refreshing &&
                                                    index === 2 &&
                                                    injected.refreshMode ===
                                                        'registered'
                                                  ? { registered: true }
                                                  : {}),
                                            editorRequest: requested,
                                            editorResolution: resolution,
                                        };
                                    }),
                                };
                            },
                        );
                        ipcMain.removeHandler('projects.addProject');
                        ipcMain.handle(
                            'projects.addProject',
                            (_event, file: string, options) => {
                                if (file.includes('game-1'))
                                    return {
                                        success: true,
                                        data: {
                                            success: false,
                                            error: 'First project failed',
                                        },
                                    };
                                if (!reviewed.has(file)) {
                                    reviewed.add(file);
                                    refreshing = true;
                                    failInspection =
                                        injected.refreshMode === 'reject';
                                    return {
                                        success: true,
                                        data: {
                                            success: false,
                                            editorResolution: resolution,
                                        },
                                    };
                                }
                                const project = {
                                    ...injected.sample,
                                    name: options.name,
                                    path: file.replace(/[\\/][^\\/]+$/, ''),
                                };
                                return {
                                    success: true,
                                    data: {
                                        success: true,
                                        newProject: project,
                                        projects: [project],
                                    },
                                };
                            },
                        );
                    },
                    { refreshMode, sample: SAMPLE_PROJECTS[0] },
                );
                const modal = await openScan();
                await modal
                    .getByRole('button', {
                        name: `Add selected projects (${mixed ? 3 : 2})`,
                        exact: true,
                    })
                    .click();
                if (refreshMode === 'retry' || mixed) {
                    await expect(
                        modal.getByRole('button', {
                            name: 'Add selected projects (1)',
                            exact: true,
                        }),
                    ).toBeEnabled();
                    await modal
                        .getByRole('button', {
                            name: 'Add selected projects (1)',
                            exact: true,
                        })
                        .click();
                }
                await expect(
                    modal.getByText('Project import complete', { exact: true }),
                ).toBeVisible();
                await expect(
                    modal.getByText('Failed: First project failed'),
                ).toBeVisible();
                const outcomes = modal.getByRole('list', {
                    name: 'Project import complete',
                });
                await expect(outcomes.getByRole('listitem')).toHaveCount(
                    mixed ? 3 : 2,
                );
                if (
                    refreshMode === 'reject' ||
                    refreshMode.includes('row-error')
                )
                    await expect(
                        outcomes.getByText('Failed:', { exact: false }),
                    ).toHaveCount(2);
                if (refreshMode.includes('row-error'))
                    await expect(
                        outcomes.getByText(
                            'Failed: Project file is unreadable',
                        ),
                    ).toBeVisible();
                if (refreshMode === 'registered')
                    await expect(
                        outcomes.getByText('Skipped: Already added'),
                    ).toBeVisible();
                if (refreshMode === 'retry' || mixed)
                    await expect(
                        outcomes.getByText('Added', { exact: true }),
                    ).toBeVisible();
                await assertFits(modal);
                await modal
                    .getByRole('button', { name: 'Done', exact: true })
                    .click();
            }
        });
        test('limited, empty and failed scans keep recovery actions available', async () => {
            for (const status of ['limited', 'complete', 'failed'] as const) {
                const result = scanResult(status);
                if (status !== 'limited') result.projects = [];
                await stubScan(result);
                const modal = await openScan();
                await expect(
                    modal.getByRole('heading', {
                        name: 'Choose projects to add',
                    }),
                ).toBeVisible();
                await assertFits(modal);
                if (status === 'limited')
                    await expect(
                        modal.getByText(
                            'The scan reached a limit. You can add the projects found so far.',
                        ),
                    ).toBeVisible();
                else
                    await expect(
                        modal.getByText('No valid Godot projects were found.'),
                    ).toBeVisible();
                if (status === 'failed')
                    await expect(modal.getByRole('alert')).toContainText(
                        'The folder could not be scanned.',
                    );
                await modal
                    .getByRole('button', { name: 'Cancel', exact: true })
                    .click();
            }
        });
        test('unreadable entries retain their discovered names in read-only summaries', async () => {
            await stubScan(scanResult('complete'));
            await app.evaluate(({ ipcMain }) => {
                ipcMain.removeHandler('projects.inspectProjectImports');
                ipcMain.handle(
                    'projects.inspectProjectImports',
                    (_event, paths: string[]) => ({
                        success: true,
                        data: paths.map((file, index) => ({
                            projectFilePath: file,
                            name: index === 0 ? 'Game 0' : '',
                            registered: index === 0,
                            error:
                                index === 1
                                    ? 'Project file is unreadable'
                                    : undefined,
                        })),
                    }),
                );
            });
            const modal = await openScan();
            await expect(
                modal.getByRole('heading', { name: 'Available', exact: true }),
            ).toHaveCount(0);
            await expect(
                modal.getByRole('heading', {
                    name: 'Already added',
                    exact: true,
                }),
            ).toBeVisible();
            await expect(
                modal.getByRole('heading', {
                    name: 'Unable to add',
                    exact: true,
                }),
            ).toBeVisible();
            const unreadable = modal.getByRole('listitem').filter({
                has: page.getByText('Game 1', { exact: true }),
            });
            await unreadable.scrollIntoViewIfNeeded();
            await expect(
                unreadable.getByTitle(path.join(folder, 'game-1'), {
                    exact: true,
                }),
            ).toHaveText(path.join(folder, 'game-1'));
            await expect(
                unreadable.getByText('Invalid', { exact: true }),
            ).toBeVisible();
            await expect(
                unreadable.getByText('Project file is unreadable'),
            ).toBeVisible();
            await expect(unreadable.getByRole('checkbox')).toHaveCount(0);
            await expect(unreadable.getByRole('button')).toHaveCount(1);
            await expect(
                unreadable.getByRole('button', { name: 'Copy path' }),
            ).toBeEnabled();
            await assertFits(modal);
            await expect(
                modal.getByRole('button', {
                    name: 'Add selected projects (0)',
                    exact: true,
                }),
            ).toBeDisabled();
            await page.mouse.move(0, 0);
            await page.screenshot({
                path: test.info().outputPath('folder-import-unavailable.png'),
            });
            await modal
                .getByRole('button', { name: 'Cancel', exact: true })
                .click();
        });
    });
}
