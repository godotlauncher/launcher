import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Page,
    test,
} from '@playwright/test';
import type {
    ImportedTemplateInventory,
    ProjectTemplateSettings,
    TemplateJob,
    TemplateMigrationAssessment,
    TemplateMigrationProjectDecision,
    TemplateMigrationReview,
} from '../shared/src/contracts';
import { getMainWindow } from './splashscreen/getMainWindow';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { createFixtureHome } from './support/e2e-fixture-runtime';

let home: string;
let app: ElectronApplication;
let page: Page;
let root: string;
let projects: typeof SAMPLE_PROJECTS;
let env: Record<string, string>;
const ids = ['4.3.stable', '4.4.stable', '4.4.stable.mono', '4.5.stable'];
type Response<T> =
    | { success: true; data: T }
    | { success: false; error: { message: string } };
test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

/** Starts Electron against a disposable project profile and its real preload bridge. */
async function launch(): Promise<void> {
    app = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`],
        env,
    });
    page = await getMainWindow(app);
    await expect(page.getByTestId('btnHelp')).toBeVisible();
}
/** Invokes a main-owned migration boundary through the real Electron preload.
 * @param method - Export-template method under test.
 * @param args - Serialisable request arguments.
 */
async function request<T>(
    method: string,
    ...args: unknown[]
): Promise<Response<T>> {
    return page.evaluate(
        async ({ method, args }) => {
            const transport = (
                window as unknown as {
                    __di_electron__: {
                        invoke: (
                            channel: string,
                            ...args: unknown[]
                        ) => Promise<unknown>;
                    };
                }
            ).__di_electron__;
            return transport.invoke(`exportTemplates.${method}`, ...args);
        },
        { method, args },
    ) as Promise<Response<T>>;
}
/** Unwraps a successful bridge response and reports main's bounded error on failure.
 * @param response - Transport response from the operation being checked.
 */
function data<T>(response: Response<T>): T {
    if (!response.success) throw new Error(response.error.message);
    return response.data;
}
/** Resolves an isolated project's original template collection.
 * @param index - Project fixture index.
 */
function local(index = 0): string {
    return path.join(
        path.dirname(projects[index].launch_path),
        'editor_data',
        'export_templates',
    );
}
/** Leaves the second project alone while selecting every discovered version in the first.
 * @param choices - Decisions for the first project's four versions.
 */
function decisions(
    choices: TemplateMigrationProjectDecision['selection'],
): TemplateMigrationProjectDecision[] {
    return [
        { projectPath: projects[0].path, selection: choices },
        {
            projectPath: projects[1].path,
            selection: { mode: 'all-versions', choice: 'later' },
        },
    ];
}
/** Waits for every exact reviewed version to receive a terminal outcome.
 * @param id - Returned batch job identity.
 */
async function finished(id: string): Promise<TemplateJob> {
    await expect
        .poll(
            async () =>
                data(await request<TemplateJob[]>('getJobs')).find(
                    (job) => job.id === id,
                )?.migration?.status,
        )
        .toBe('complete');
    return data(await request<TemplateJob[]>('getJobs')).find(
        (job) => job.id === id,
    ) as TemplateJob;
}

test.beforeEach(async () => {
    home = await createFixtureHome();
    const prefsPath = path.join(home, '.gd-launcher', 'prefs.json');
    const prefs = JSON.parse(await fs.readFile(prefsPath, 'utf8'));
    prefs.language = 'en';
    prefs.export_template_migration_offered = true;
    await fs.writeFile(prefsPath, JSON.stringify(prefs));
    projects = ['Night Garden', 'Another Project'].map((name, index) => ({
        ...SAMPLE_PROJECTS[0],
        name,
        path: path.join(home, `project-${index}`),
        launch_path: path.join(home, `editor-${index}`, 'Godot'),
        release: {
            ...SAMPLE_PROJECTS[0].release,
            version: '4.4-stable',
            source: 'official',
            mono: false,
        },
    }));
    for (const [index, project] of projects.entries()) {
        await fs.mkdir(project.path, { recursive: true });
        await fs.writeFile(
            path.join(project.path, 'project.godot'),
            '[application]\nconfig/name="Migration fixture"\n',
        );
        await fs.mkdir(path.dirname(project.launch_path), { recursive: true });
        await fs.writeFile(project.launch_path, 'fixture editor');
        for (const id of index === 0 ? ids : [ids[1]]) {
            await fs.mkdir(path.join(local(index), id), { recursive: true });
            await fs.writeFile(path.join(local(index), id, 'version.txt'), id);
            await fs.writeFile(
                path.join(local(index), id, 'template'),
                `original ${index} ${id}`,
                { mode: 0o755 },
            );
            await fs.writeFile(
                path.join(local(index), id, '.DS_Store'),
                'version metadata',
            );
        }
    }
    await fs.writeFile(path.join(local(), '.DS_Store'), 'metadata retained');
    await fs.writeFile(path.join(local(), 'Thumbs.db'), 'thumbnail metadata');
    await fs.writeFile(path.join(local(), 'notes.txt'), 'user notes retained');
    await fs.writeFile(
        path.join(local(), '9.9.stable'),
        'a file, not a version folder',
    );
    await fs.mkdir(path.join(local(), 'unrelated folder'));
    await fs.writeFile(
        path.join(local(), 'unrelated folder', 'personal.txt'),
        'unrelated contents retained',
    );
    await fs.symlink(
        projects[0].path,
        path.join(local(), 'notes-link'),
        process.platform === 'win32' ? 'junction' : 'dir',
    );
    await fs.writeFile(
        path.join(home, '.gd-launcher', 'projects.json'),
        JSON.stringify(projects),
    );
    root = path.join(home, '.gd-launcher', 'godot', 'export_templates');
    for (const id of [ids[1], ids[2]]) {
        await fs.mkdir(path.join(root, id), { recursive: true });
        await fs.writeFile(path.join(root, id, 'template'), `shared ${id}`);
    }
    await fs.writeFile(
        path.join(local(), ids[1], 'missing-template'),
        'missing shared file',
    );
    const variables: NodeJS.ProcessEnv = {
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
    delete variables.ELECTRON_RUN_AS_NODE;
    env = Object.fromEntries(
        Object.entries(variables).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
        ),
    );
    await launch();
});
test.afterEach(async () => {
    try {
        await app?.close();
    } finally {
        if (home) await fs.rm(home, { recursive: true, force: true });
    }
});

test('Close and Quit remain blocked for the running migration and allow a fresh quit afterwards', async () => {
    type ExitFixture = {
        paused: boolean;
        resume: () => void;
        restore: () => void;
    };
    const review = data(
        await request<TemplateMigrationReview>(
            'reviewMigration',
            decisions({
                mode: 'per-version',
                choices: Object.fromEntries(
                    ids.map((id, index) => [
                        id,
                        index === 0 ? 'save-imported' : 'later',
                    ]),
                ),
            }),
        ),
    );
    // Pause only this disposable fixture's rename, after migration owns its journal.
    await app.evaluate((_electron, source) => {
        const files = process.getBuiltinModule('node:fs');
        const original = files.promises.rename;
        let resume!: () => void;
        const gate = new Promise<void>((resolve) => {
            resume = resolve;
        });
        const fixture: ExitFixture = {
            paused: false,
            resume,
            restore: () => {
                files.promises.rename = original;
            },
        };
        (
            globalThis as typeof globalThis & {
                migrationExitFixture?: ExitFixture;
            }
        ).migrationExitFixture = fixture;
        files.promises.rename = async (...args: Parameters<typeof original>) => {
            if (args[0] === source) {
                fixture.paused = true;
                await gate;
            }
            return original(...args);
        };
    }, path.join(local(), ids[0]));
    let jobId = '';
    try {
        jobId = data(
            await request<string>('applyMigrationReview', review.token, false),
        );
        await expect
            .poll(() =>
                app.evaluate(
                    () =>
                        (
                            globalThis as typeof globalThis & {
                                migrationExitFixture?: ExitFixture;
                            }
                        ).migrationExitFixture?.paused,
                ),
            )
            .toBe(true);
        const window = await app.browserWindow(page);
        await window.evaluate(async (mainWindow) => {
            mainWindow.close();
            await new Promise<void>((resolve) => setImmediate(resolve));
        });
        expect(await window.evaluate((mainWindow) => mainWindow.isVisible())).toBe(
            true,
        );
        await app.evaluate(async ({ app }) => {
            app.quit();
            app.quit();
            await new Promise<void>((resolve) => setImmediate(resolve));
        });
        expect(
            data(await request<TemplateJob[]>('getJobs')).find(
                (job) => job.id === jobId,
            )?.migration?.status,
        ).toBe('running');
        await expect(page.getByTestId('btnHelp')).toBeVisible();
    } finally {
        await app.evaluate(() => {
            const state = globalThis as typeof globalThis & {
                migrationExitFixture?: ExitFixture;
            };
            state.migrationExitFixture?.restore();
            state.migrationExitFixture?.resume();
            delete state.migrationExitFixture;
        });
        if (jobId) await finished(jobId);
    }
    // A rejected quit must not be queued to run automatically when the move ends.
    await expect(page.getByTestId('btnHelp')).toBeVisible();
    const closed = app.waitForEvent('close');
    await app.evaluate(({ app }) => app.quit());
    await closed;
});

test('renames a large version folder with custom files and empty subfolders without content reads', async () => {
    const original = path.join(local(), ids[0]);
    await fs.mkdir(path.join(original, 'custom', 'empty'), { recursive: true });
    await fs.writeFile(
        path.join(original, 'custom', 'notes.txt'),
        'custom template notes',
    );
    const large = await fs.open(path.join(original, 'large-template'), 'w');
    try {
        await large.truncate(128 * 1024 * 1024);
    } finally {
        await large.close();
    }
    const before = await fs.stat(original);
    type ReadFixture = { restore: () => void };
    await app.evaluate((_electron, fixtureHome) => {
        const files = process.getBuiltinModule('node:fs');
        const modules = process.getBuiltinModule('node:module');
        const createReadStream = files.createReadStream;
        files.createReadStream = (
            ...args: Parameters<typeof createReadStream>
        ) => {
            if (String(args[0]).startsWith(fixtureHome))
                throw new Error('Migration must not read template contents');
            return createReadStream(...args);
        };
        modules.syncBuiltinESMExports();
        (
            globalThis as typeof globalThis & {
                migrationReadFixture?: ReadFixture;
            }
        ).migrationReadFixture = {
            restore: () => {
                files.createReadStream = createReadStream;
                modules.syncBuiltinESMExports();
            },
        };
    }, home);
    try {
        const review = data(
            await request<TemplateMigrationReview>(
                'reviewMigration',
                decisions({
                    mode: 'per-version',
                    choices: Object.fromEntries(
                        ids.map((id, index) => [
                            id,
                            index === 0 ? 'save-imported' : 'later',
                        ]),
                    ),
                }),
            ),
        );
        const job = await finished(
            data(
                await request<string>(
                    'applyMigrationReview',
                    review.token,
                    false,
                ),
            ),
        );
        expect(
            job.migration?.versions.find((version) => version.setId === ids[0])
                ?.status,
        ).toBe('complete');
        const moved = await fs.stat(original);
        expect({ dev: moved.dev, ino: moved.ino }).toEqual({
            dev: before.dev,
            ino: before.ino,
        });
        expect((await fs.lstat(original)).isSymbolicLink()).toBe(true);
        expect(
            await fs.readFile(path.join(original, 'version.txt'), 'utf8'),
        ).toBe(ids[0]);
        expect(
            await fs.readFile(
                path.join(original, 'custom', 'notes.txt'),
                'utf8',
            ),
        ).toBe('custom template notes');
        expect(
            (
                await fs.stat(path.join(original, 'custom', 'empty'))
            ).isDirectory(),
        ).toBe(true);
        expect(
            (await fs.stat(path.join(original, 'large-template'))).size,
        ).toBe(128 * 1024 * 1024);
    } finally {
        await app.evaluate(() => {
            const state = globalThis as typeof globalThis & {
                migrationReadFixture?: ReadFixture;
            };
            state.migrationReadFixture?.restore();
            delete state.migrationReadFixture;
        });
    }
});

test('copies each entry once when the filesystem refuses a cross-drive rename', async () => {
    const original = path.join(local(), ids[0]);
    const before = await fs.stat(original);
    await fs.mkdir(path.join(original, 'custom', 'empty'), { recursive: true });
    await fs.writeFile(
        path.join(original, 'custom', 'notes.txt'),
        'custom notes',
    );
    const children = await fs.readdir(original);
    type CopyFixture = { copies: string[]; restore: () => void };
    await app.evaluate(() => {
        const files = process.getBuiltinModule('node:fs');
        const rename = files.promises.rename;
        const copy = files.promises.cp;
        const fixture: CopyFixture = {
            copies: [],
            restore: () => {
                files.promises.rename = rename;
                files.promises.cp = copy;
            },
        };
        (
            globalThis as typeof globalThis & {
                migrationCopyFixture?: CopyFixture;
            }
        ).migrationCopyFixture = fixture;
        files.promises.rename = async (...args: Parameters<typeof rename>) => {
            if (
                String(args[0])
                    .replaceAll('\\', '/')
                    .includes('/version-backups/') &&
                String(args[1]).replaceAll('\\', '/').includes('/imported/')
            )
                throw Object.assign(new Error('Cross-device move'), {
                    code: 'EXDEV',
                });
            return rename(...args);
        };
        files.promises.cp = async (...args: Parameters<typeof copy>) => {
            fixture.copies.push(String(args[0]));
            return copy(...args);
        };
    });
    try {
        const review = data(
            await request<TemplateMigrationReview>(
                'reviewMigration',
                decisions({
                    mode: 'per-version',
                    choices: Object.fromEntries(
                        ids.map((id, index) => [
                            id,
                            index === 0 ? 'save-imported' : 'later',
                        ]),
                    ),
                }),
            ),
        );
        const job = await finished(
            data(
                await request<string>(
                    'applyMigrationReview',
                    review.token,
                    false,
                ),
            ),
        );
        expect(
            job.migration?.versions.find((version) => version.setId === ids[0])
                ?.status,
        ).toBe('complete');
        const copied = await app.evaluate(
            () =>
                (
                    globalThis as typeof globalThis & {
                        migrationCopyFixture?: CopyFixture;
                    }
                ).migrationCopyFixture?.copies ?? [],
        );
        expect(
            copied.map((filename) => path.basename(filename)).sort(),
        ).toEqual(children.sort());
        expect(new Set(copied).size).toBe(copied.length);
        expect(
            (
                await fs.stat(path.join(original, 'custom', 'empty'))
            ).isDirectory(),
        ).toBe(true);
        expect(
            await fs.readFile(
                path.join(original, 'custom', 'notes.txt'),
                'utf8',
            ),
        ).toBe('custom notes');
        expect((await fs.stat(original)).ino).not.toBe(before.ino);
        expect(await fs.readFile(path.join(original, 'template'), 'utf8')).toBe(
            `original 0 ${ids[0]}`,
        );
        expect(
            await fs.readFile(path.join(original, 'version.txt'), 'utf8'),
        ).toBe(ids[0]);
        expect((await fs.stat(original)).mode & 0o777).toBe(
            before.mode & 0o777,
        );
        expect(
            data(
                await request<TemplateMigrationAssessment>(
                    'getMigrationAssessment',
                ),
            ).recoveryIds,
        ).toEqual([]);
    } finally {
        await app.evaluate(() => {
            const state = globalThis as typeof globalThis & {
                migrationCopyFixture?: CopyFixture;
            };
            state.migrationCopyFixture?.restore();
            delete state.migrationCopyFixture;
        });
    }
});

test('shares a read-only custom folder and preserves its permissions and empty subfolders', async () => {
    test.skip(process.platform === 'win32', 'POSIX directory permissions are not applied on Windows.');
    const source = path.join(local(), ids[1], 'read-only');
    const destination = path.join(root, ids[1], 'read-only');
    await fs.mkdir(path.join(source, 'empty'), { recursive: true });
    await fs.writeFile(path.join(source, 'notes.txt'), 'custom notes');
    await fs.chmod(source, 0o555);
    try {
        const review = data(await request<TemplateMigrationReview>('reviewMigration', decisions({
            mode: 'per-version',
            choices: Object.fromEntries(ids.map((id, index) => [id, index === 1 ? 'share-project' : 'later'])),
        })));
        const job = await finished(data(await request<string>('applyMigrationReview', review.token, true)));
        expect(job.migration?.versions.find((version) => version.projectPath === projects[0].path && version.setId === ids[1])?.status).toBe('complete');
        expect(await fs.readFile(path.join(destination, 'notes.txt'), 'utf8')).toBe('custom notes');
        expect((await fs.stat(path.join(destination, 'empty'))).isDirectory()).toBe(true);
        expect((await fs.stat(destination)).mode & 0o777).toBe(0o555);
        expect(data(await request<TemplateMigrationAssessment>('getMigrationAssessment')).recoveryIds).toEqual([]);
    } finally {
        for (const folder of [source, destination])
            await fs.chmod(folder, 0o755).catch(() => {});
    }
});

test('metadata-only folders connect automatically without offering migration', async () => {
    await app.close();
    for (const [index, name] of ['.DS_Store', 'Thumbs.db'].entries()) {
        await fs.rm(local(index), { recursive: true });
        await fs.mkdir(local(index));
        await fs.writeFile(path.join(local(index), name), 'operating system metadata');
    }
    const prefsPath = path.join(home, '.gd-launcher', 'prefs.json');
    const prefs = JSON.parse(await fs.readFile(prefsPath, 'utf8'));
    prefs.export_template_migration_offered = false;
    await fs.writeFile(prefsPath, JSON.stringify(prefs));
    await launch();
    await page.getByTestId('btnExportTemplates').click();
    for (const index of [0, 1]) {
        await expect
            .poll(async () => (await fs.lstat(local(index))).isSymbolicLink())
            .toBe(true);
        expect(await fs.realpath(local(index))).toBe(await fs.realpath(root));
        expect(
            data(
                await request<ProjectTemplateSettings>(
                    'getProjectSettings',
                    projects[index].path,
                ),
            ).hasLocalFiles,
        ).toBe(false);
    }
    expect(
        data(await request<TemplateMigrationAssessment>('getMigrationAssessment')),
    ).toMatchObject({ pendingCount: 0, recoveryIds: [] });
    await expect(page.getByTestId('templateMigrationWizard')).toBeHidden();
    expect(await fs.readFile(path.join(root, ids[1], 'template'), 'utf8')).toBe(
        `shared ${ids[1]}`,
    );
});

test('moves empty and marker-only version folders without requiring specific template files', async () => {
    for (const setId of ids.slice(0, 2)) {
        await fs.rm(path.join(local(), setId), { recursive: true });
        await fs.mkdir(path.join(local(), setId));
    }
    await fs.writeFile(path.join(local(), ids[1], 'version.txt'), ids[1]);
    const review = data(
        await request<TemplateMigrationReview>(
            'reviewMigration',
            decisions({ mode: 'all-versions', choice: 'save-imported' }),
        ),
    );
    expect(
        review.projects[0].versions.slice(0, 2).map((version) => [version.setId, version.fileCount]),
    ).toEqual([[ids[0], 0], [ids[1], 1]]);
    const job = await finished(
        data(await request<string>('applyMigrationReview', review.token, false)),
    );
    expect(
        job.migration?.versions
            .filter((version) => version.projectPath === projects[0].path)
            .every((version) => version.status === 'complete'),
    ).toBe(true);
    expect(await fs.readdir(path.join(local(), ids[0]))).toEqual([]);
    expect(await fs.readdir(path.join(local(), ids[1]))).toEqual(['version.txt']);
    expect(
        await fs.readFile(path.join(local(), ids[1], 'version.txt'), 'utf8'),
    ).toBe(ids[1]);
});

test('project settings offer builds after all local versions have migrated', async () => {
    expect(
        data(
            await request<ProjectTemplateSettings>(
                'getProjectSettings',
                projects[0].path,
            ),
        ).hasLocalFiles,
    ).toBe(true);
    const review = data(
        await request<TemplateMigrationReview>(
            'reviewMigration',
            decisions({ mode: 'all-versions', choice: 'save-imported' }),
        ),
    );
    const job = await finished(
        data(await request<string>('applyMigrationReview', review.token, false)),
    );
    expect(
        job.migration?.versions
            .filter((version) => version.projectPath === projects[0].path)
            .every((version) => version.status === 'complete'),
    ).toBe(true);
    await page.getByTestId('btnProjects').click();
    await page
        .getByRole('listitem')
        .filter({
            has: page.getByRole('heading', { name: 'Night Garden', exact: true }),
        })
        .getByRole('button', { name: 'Project settings', exact: true })
        .click();
    const drawer = page.getByRole('dialog', { name: 'Night Garden Settings' });
    await drawer.getByTestId('tabProjectSettings_exportTemplates').click();
    const section = drawer.getByTestId('projectExportTemplates');
    const selector = section.locator('#project-template-build');
    await expect(selector).toBeVisible();
    await expect(selector).toBeEnabled();
    await expect(
        section.getByRole('button', { name: 'Migrate export templates' }),
    ).toBeHidden();
    await selector.click();
    await expect(page.getByRole('option', { name: /^Official/ })).toBeVisible();
    await expect(
        page.getByRole('option', { name: /Night Garden/ }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
        fs.readFile(path.join(local(), '.DS_Store'), 'utf8'),
    ).resolves.toBe('metadata retained');
    await expect(
        fs.readFile(path.join(local(), 'Thumbs.db'), 'utf8'),
    ).resolves.toBe('thumbnail metadata');
});

test('a replaced managed link remains local while another version migrates', async () => {
    const filename = path.join(
        path.dirname(local()),
        'launcher_export_templates',
        'version-layout.json',
    );
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(
        filename,
        JSON.stringify({
            version: 1,
            root: 'active',
            managed: { [ids[1]]: '11111111-1111-4111-8111-111111111111' },
        }),
    );
    const review = data(
        await request<TemplateMigrationReview>(
            'reviewMigration',
            decisions({
                mode: 'per-version',
                choices: Object.fromEntries(
                    ids.map((id, index) => [
                        id,
                        index === 0 ? 'use-shared' : 'later',
                    ]),
                ),
            }),
        ),
    );
    const job = await finished(
        data(await request<string>('applyMigrationReview', review.token, true)),
    );
    expect(
        job.migration?.versions.find((version) => version.setId === ids[0])
            ?.status,
    ).toBe('complete');
    expect((await fs.lstat(path.join(local(), ids[1]))).isSymbolicLink()).toBe(
        false,
    );
    expect(
        await fs.readFile(path.join(local(), ids[1], 'template'), 'utf8'),
    ).toBe(`original 0 ${ids[1]}`);
    expect(
        JSON.parse(await fs.readFile(filename, 'utf8')).managed,
    ).not.toHaveProperty(ids[1]);
    expect(
        data(
            await request<TemplateMigrationAssessment>(
                'getMigrationAssessment',
            ),
        ).recoveryIds,
    ).toEqual([]);
});

test('recovery finishes a committed move with an older replaced link record', async () => {
    const originals = await Promise.all(
        (await fs.readdir(path.join(local(), ids[0]))).map(async (relative) => {
            const filename = path.join(local(), ids[0], relative);
            const contents = await fs.readFile(filename);
            const stat = await fs.stat(filename);
            return {
                relative,
                contents,
                size: stat.size,
                mode: stat.mode & 0o777,
                hash: createHash('sha256').update(contents).digest('hex'),
            };
        }),
    );
    const review = data(
        await request<TemplateMigrationReview>(
            'reviewMigration',
            decisions({
                mode: 'per-version',
                choices: Object.fromEntries(
                    ids.map((id, index) => [
                        id,
                        index === 0 ? 'use-shared' : 'later',
                    ]),
                ),
            }),
        ),
    );
    await finished(
        data(await request<string>('applyMigrationReview', review.token, true)),
    );
    const storage = path.join(
        path.dirname(local()),
        'launcher_export_templates',
    );
    const filename = path.join(storage, 'version-layout.json');
    const layout = JSON.parse(await fs.readFile(filename, 'utf8'));
    const id = layout.managed[ids[0]];
    layout.managed[ids[1]] = '11111111-1111-4111-8111-111111111111';
    await fs.writeFile(filename, JSON.stringify(layout));
    const backup = path.join(storage, 'version-backups', id, ids[0]);
    await fs.mkdir(backup, { recursive: true });
    for (const file of originals) {
        await fs.writeFile(path.join(backup, file.relative), file.contents);
        await fs.chmod(path.join(backup, file.relative), file.mode);
    }
    const journalPath = path.join(
        home,
        '.gd-launcher',
        'export-templates',
        'version-migration.json',
    );
    await fs.mkdir(path.dirname(journalPath), { recursive: true });
    await fs.writeFile(
        journalPath,
        JSON.stringify({
            version: 1,
            id,
            projectPath: projects[0].path,
            launchPath: projects[0].launch_path,
            setId: ids[0],
            editorSetId:
                projects[0].release.version.replace('-', '.') +
                (projects[0].release.mono ? '.mono' : ''),
            root: 'active',
            localRealPath: await fs.realpath(local()),
            sharedRoot: await fs.realpath(root),
            choice: 'use-shared',
            beforeMode: projects[0].exportTemplateMode,
            beforeSelections: {},
            files: originals.map(({ contents: _contents, ...file }) => file),
        }),
    );
    data(await request<void>('recover', id));
    expect(
        data(
            await request<TemplateMigrationAssessment>(
                'getMigrationAssessment',
            ),
        ).recoveryIds,
    ).toEqual([]);
    expect(
        JSON.parse(await fs.readFile(filename, 'utf8')).managed,
    ).not.toHaveProperty(ids[1]);
    expect(
        await fs.readFile(path.join(local(), ids[1], 'template'), 'utf8'),
    ).toBe(`original 0 ${ids[1]}`);
    await expect(fs.lstat(backup)).rejects.toMatchObject({ code: 'ENOENT' });
});

test('requires acknowledgement in main before consuming a removal review', async () => {
    const review = data(
        await request<TemplateMigrationReview>(
            'reviewMigration',
            decisions({ mode: 'all-versions', choice: 'use-shared' }),
        ),
    );
    const result = await request<string>(
        'applyMigrationReview',
        review.token,
        false,
    );
    expect(result).toMatchObject({
        success: false,
        error: { message: 'exportTemplates:errors.decision' },
    });
    expect(data(await request<TemplateJob[]>('getJobs'))).toEqual([]);
    expect((await fs.lstat(path.join(local(), ids[1]))).isSymbolicLink()).toBe(
        false,
    );
    expect(
        await fs.readFile(path.join(local(), ids[1], 'template'), 'utf8'),
    ).toBe(`original 0 ${ids[1]}`);
    await request('discardMigrationReview', review.token);
});

test('a changed source in the second project prevents all batch file changes', async () => {
    const review = data(
        await request<TemplateMigrationReview>(
            'reviewMigration',
            projects.map((project) => ({
                projectPath: project.path,
                selection: { mode: 'all-versions', choice: 'save-imported' },
            })),
        ),
    );
    await fs.writeFile(
        path.join(local(1), ids[1], 'template'),
        'changed after Review',
    );
    const result = await request<string>(
        'applyMigrationReview',
        review.token,
        false,
    );
    expect(result).toMatchObject({
        success: false,
        error: { message: 'exportTemplates:errors.changed' },
    });
    expect(data(await request<TemplateJob[]>('getJobs'))).toEqual([]);
    expect(
        data(await request<ImportedTemplateInventory>('getImportedTemplates'))
            .builds,
    ).toEqual([]);
    for (const id of ids)
        expect((await fs.lstat(path.join(local(), id))).isSymbolicLink()).toBe(
            false,
        );
});

test('an all-Later review cannot create a file operation through IPC', async () => {
    const review = data(
        await request<TemplateMigrationReview>(
            'reviewMigration',
            decisions({ mode: 'all-versions', choice: 'later' }),
        ),
    );
    expect(
        await request<string>('applyMigrationReview', review.token, false),
    ).toMatchObject({
        success: false,
        error: { message: 'exportTemplates:errors.decision' },
    });
    expect(data(await request<TemplateJob[]>('getJobs'))).toEqual([]);
    expect(
        data(await request<ImportedTemplateInventory>('getImportedTemplates'))
            .builds,
    ).toEqual([]);
    expect(await fs.readFile(path.join(local(), '.DS_Store'), 'utf8')).toBe(
        'metadata retained',
    );
});

test('an unreadable recovery journal keeps Electron available and blocks new migration work', async () => {
    await app.close();
    const journal = path.join(
        home,
        '.gd-launcher',
        'export-templates',
        'version-migration.json',
    );
    await fs.mkdir(path.dirname(journal), { recursive: true });
    await fs.writeFile(journal, '{interrupted JSON');
    await launch();
    const assessment = data(
        await request<TemplateMigrationAssessment>('getMigrationAssessment'),
    );
    expect(assessment.recoveryIds).toHaveLength(1);
    expect(
        assessment.projects.every((project) => project.state === 'recovery'),
    ).toBe(true);
    expect(
        await request(
            'reviewMigration',
            decisions({ mode: 'all-versions', choice: 'save-imported' }),
        ),
    ).toMatchObject({ success: false });
    expect(data(await request<TemplateJob[]>('getJobs'))).toEqual([]);
    expect(await fs.readFile(journal, 'utf8')).toBe('{interrupted JSON');
    for (const id of ids)
        expect((await fs.lstat(path.join(local(), id))).isSymbolicLink()).toBe(
            false,
        );
});

test('creates a missing shared root and retains the same physical identity through recovery', async () => {
    await app.close();
    await fs.rm(root, { recursive: true });
    await launch();
    const review = data(
        await request<TemplateMigrationReview>(
            'reviewMigration',
            decisions({ mode: 'all-versions', choice: 'use-shared' }),
        ),
    );
    const job = await finished(
        data(await request<string>('applyMigrationReview', review.token, true)),
    );
    expect(
        job.migration?.versions
            .filter((version) => version.projectPath === projects[0].path)
            .every((version) => version.status === 'complete'),
    ).toBe(true);
    for (const id of ids) {
        expect((await fs.lstat(path.join(local(), id))).isSymbolicLink()).toBe(
            true,
        );
        expect(await fs.readdir(path.join(root, id))).toEqual([]);
    }
    expect(
        data(
            await request<TemplateMigrationAssessment>(
                'getMigrationAssessment',
            ),
        ).recoveryIds,
    ).toEqual([]);
});

test('migrates an older backing collection and connects it without losing deferred versions', async () => {
    await app.close();
    const active = local();
    const backing = path.join(
        path.dirname(active),
        'launcher_export_templates',
        'official',
    );
    await fs.mkdir(path.dirname(backing), { recursive: true });
    await fs.rename(active, backing);
    await fs.symlink(
        root,
        active,
        process.platform === 'win32' ? 'junction' : 'dir',
    );
    await launch();
    const review = data(
        await request<TemplateMigrationReview>('reviewMigration', [
            {
                projectPath: projects[0].path,
                selection: {
                    mode: 'per-version',
                    choices: Object.fromEntries(
                        ids.map((setId, index) => [
                            setId,
                            index === 0 ? 'save-imported' : 'later',
                        ]),
                    ),
                },
            },
        ]),
    );
    const job = await finished(
        data(
            await request<string>('applyMigrationReview', review.token, false),
        ),
    );
    expect(job.migration?.versions.map((version) => version.status)).toEqual([
        'complete',
        'later',
        'later',
        'later',
    ]);
    expect(await fs.realpath(active)).toBe(await fs.realpath(backing));
    expect((await fs.lstat(path.join(backing, ids[0]))).isSymbolicLink()).toBe(
        true,
    );
    expect((await fs.lstat(path.join(backing, ids[3]))).isSymbolicLink()).toBe(
        false,
    );
    expect(
        await fs.readFile(path.join(active, ids[3], 'template'), 'utf8'),
    ).toBe(`original 0 ${ids[3]}`);
    expect(await fs.readFile(path.join(root, ids[1], 'template'), 'utf8')).toBe(
        `shared ${ids[1]}`,
    );
});

test('executes mixed version choices, preserves Later across restart and migrates only the remaining version', async () => {
    await fs.mkdir(path.join(local(), ids[1], 'custom-files', 'empty'), { recursive: true });
    for (const setId of ids) {
        await fs.mkdir(path.join(local(), setId, 'custom-files'), { recursive: true });
        await fs.writeFile(
            path.join(local(), setId, 'custom-files', 'my-build.dat'),
            `custom 0 ${setId}`,
        );
    }
    const choices = Object.fromEntries(
        ids.map((id, index) => [
            id,
            ['save-imported', 'share-project', 'use-shared', 'later'][index],
        ]),
    );
    const review = data(
        await request<TemplateMigrationReview>(
            'reviewMigration',
            decisions({
                mode: 'per-version',
                choices: choices as Record<
                    string,
                    'save-imported' | 'share-project' | 'use-shared' | 'later'
                >,
            }),
        ),
    );
    // These files are outside the reviewed version folders and remain user-owned.
    await fs.writeFile(
        path.join(local(), 'notes.txt'), 'notes changed after Review',
    );
    await fs.writeFile(
        path.join(local(), 'new-after-review.txt'), 'new unrelated file',
    );
    const id = data(
        await request<string>('applyMigrationReview', review.token, true),
    );
    const job = await finished(id);
    await test.info().attach('migration-outcomes', {
        body: JSON.stringify(job, null, 2),
        contentType: 'application/json',
    });
    expect(
        job.migration?.versions
            .filter((version) => version.projectPath === projects[0].path)
            .map((version) => [version.setId, version.status]),
    ).toEqual(
        ids.map((setId, index) => [setId, index === 3 ? 'later' : 'complete']),
    );
    expect(
        job.migration?.versions.filter(
            (version) => version.projectPath === projects[1].path,
        ),
    ).toEqual([
        { projectPath: projects[1].path, setId: ids[1], status: 'later' },
    ]);
    const library = data(
        await request<ImportedTemplateInventory>('getImportedTemplates'),
    );
    expect(library.builds).toHaveLength(1);
    expect(library.builds[0].setId).toBe(ids[0]);
    for (const setId of ids.slice(0, 3))
        expect(
            (await fs.lstat(path.join(local(), setId))).isSymbolicLink(),
        ).toBe(true);
    expect(
        await fs.readFile(path.join(local(), ids[0], 'template'), 'utf8'),
    ).toBe(`original 0 ${ids[0]}`);
    expect(await fs.readFile(path.join(root, ids[1], 'template'), 'utf8')).toBe(
        `shared ${ids[1]}`,
    );
    expect(
        await fs.readFile(path.join(root, ids[1], 'missing-template'), 'utf8'),
    ).toBe('missing shared file');
    expect((await fs.stat(path.join(root, ids[1], 'custom-files', 'empty'))).isDirectory()).toBe(true);
    expect(await fs.readFile(path.join(root, ids[2], 'template'), 'utf8')).toBe(
        `shared ${ids[2]}`,
    );
    for (const setId of ids.slice(0, 2)) {
        expect(
            await fs.readFile(path.join(local(), setId, 'version.txt'), 'utf8'),
        ).toBe(setId);
        expect(
            await fs.readFile(path.join(local(), setId, 'custom-files', 'my-build.dat'), 'utf8'),
        ).toBe(`custom 0 ${setId}`);
        expect(
            await fs.readFile(path.join(local(), setId, '.DS_Store'), 'utf8'),
        ).toBe('version metadata');
    }
    await expect(
        fs.stat(path.join(root, ids[2], 'custom-files')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await fs.lstat(path.join(local(), ids[3]))).isSymbolicLink()).toBe(
        false,
    );
    expect(
        await fs.readFile(path.join(local(), ids[3], 'template'), 'utf8'),
    ).toBe(`original 0 ${ids[3]}`);
    expect(await fs.readFile(path.join(local(), '.DS_Store'), 'utf8')).toBe(
        'metadata retained',
    );
    expect((await fs.lstat(local())).isSymbolicLink()).toBe(false);
    await app.close();
    await launch();
    const assessment = data(
        await request<TemplateMigrationAssessment>('getMigrationAssessment'),
    );
    expect(
        assessment.projects.find(
            (project) => project.projectPath === projects[0].path,
        )?.setIds,
    ).toEqual([ids[3]]);
    expect(
        data(
            await request<ProjectTemplateSettings>(
                'getProjectSettings',
                projects[0].path,
            ),
        ).hasLocalFiles,
    ).toBe(true);
    const next = data(
        await request<TemplateMigrationReview>('reviewMigration', [
            {
                projectPath: projects[0].path,
                selection: { mode: 'all-versions', choice: 'save-imported' },
            },
        ]),
    );
    expect(next.projects[0].versions.map((version) => version.setId)).toEqual([
        ids[3],
    ]);
    const nextJob = await finished(
        data(await request<string>('applyMigrationReview', next.token, false)),
    );
    expect(nextJob.migration?.versions).toEqual([
        { projectPath: projects[0].path, setId: ids[3], status: 'complete' },
    ]);
    expect(
        data(await request<ImportedTemplateInventory>('getImportedTemplates'))
            .builds,
    ).toHaveLength(2);
    const complete = data(
        await request<TemplateMigrationAssessment>('getMigrationAssessment'),
    );
    expect(
        complete.projects.find(
            (project) => project.projectPath === projects[0].path,
        ),
    ).toMatchObject({ pending: false, state: 'shared', setIds: [] });
    expect(
        data(
            await request<ProjectTemplateSettings>(
                'getProjectSettings',
                projects[0].path,
            ),
        ).hasLocalFiles,
    ).toBe(false);
    expect(
        await fs.readFile(path.join(local(), 'notes.txt'), 'utf8'),
    ).toBe('notes changed after Review');
    expect(
        await fs.readFile(path.join(local(), 'new-after-review.txt'), 'utf8'),
    ).toBe('new unrelated file');
    expect(
        await fs.readFile(path.join(local(), '9.9.stable'), 'utf8'),
    ).toBe('a file, not a version folder');
    expect(
        await fs.readFile(path.join(local(), 'unrelated folder', 'personal.txt'), 'utf8'),
    ).toBe('unrelated contents retained');
    expect(
        await fs.readlink(path.join(local(), 'notes-link')),
    ).toBe(projects[0].path);
    expect(
        await request('applyMigrationReview', review.token, true),
    ).toMatchObject({
        success: false,
        error: { message: 'exportTemplates:errors.changed' },
    });
});
