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
import type {
    ImportedTemplateInventory,
    ProjectDetails,
    TemplateJob,
    TemplateMigrationAssessment,
} from '../shared/src/contracts';
import { getMainWindow } from './splashscreen/getMainWindow';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { createFixtureHome } from './support/e2e-fixture-runtime';

let home: string;
let app: ElectronApplication;
let page: Page;
let env: Record<string, string>;
let root: string;
const ids = ['4.3.stable', '4.4.stable', '4.4.stable.mono', '4.5.stable'];
const confirmation =
    'I understand that Share templates and Use shared templates remove the listed local files without saving a separate copy.';
type FixtureWindow = Window & {
    __di_electron__: {
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    };
};
type FaultState = typeof globalThis & {
    __restoreMigrationFault?: () => void;
    __migrationFaultTriggered?: boolean;
    __name?: (fn: unknown) => unknown;
};
test.setTimeout(90_000);

/** Starts the real renderer, preload and main process in a disposable profile. */
async function launch(): Promise<void> {
    app = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`],
        env,
    });
    page = await getMainWindow(app);
    await expect(page.getByTestId('btnHelp')).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()
            .find((window) =>
                window.webContents.getURL().startsWith('http://localhost:5123'),
            )
            ?.setSize(1024, 600);
    });
}
/** Resolves only an editor owned by this test fixture.
 * @param index - Fictional project index.
 */
function local(index = 0): string {
    return path.join(
        home,
        `editor-${index}`,
        'editor_data',
        'export_templates',
    );
}
/** Reads a main-owned boundary through the actual preload transport.
 * @param method - Export-template method.
 */
async function read<T>(method: string): Promise<T> {
    const response = (await page.evaluate(
        (method) =>
            (window as unknown as FixtureWindow).__di_electron__.invoke(
                `exportTemplates.${method}`,
            ),
        method,
    )) as { success: boolean; data: T; error?: { message: string } };
    if (!response.success) throw new Error(response.error?.message);
    return response.data;
}
/** Opens the production entry and advances to the one list of project choices. */
async function choose(): Promise<Locator> {
    await page.getByTestId('btnExportTemplates').click();
    await page
        .getByRole('button', { name: 'Migrate projects (2)', exact: true })
        .click();
    const wizard = page.getByTestId('templateMigrationWizard');
    await wizard
        .getByRole('button', { name: 'See options', exact: true })
        .click();
    await wizard
        .getByRole('button', { name: 'Choose for projects', exact: true })
        .click();
    return wizard;
}
/** Changes a visible choice through the app's accessible selector.
 * @param wizard - Existing modal.
 * @param name - Accessible project or version label.
 * @param option - Visible option label.
 */
async function select(
    wizard: Locator,
    name: string,
    option: string,
): Promise<void> {
    await wizard
        .getByRole('button', { name: `${name}:`, exact: false })
        .click();
    await wizard
        .getByRole('listbox', { name: `${name}:`, exact: false })
        .getByRole('option', { name: option, exact: true })
        .click();
}
/** Reviews the accepted mixed policies without changing any files.
 * @param wizard - Production migration modal on Choose.
 */
async function mixedReview(wizard: Locator): Promise<void> {
    await wizard
        .getByRole('switch', {
            name: 'Choose for each version in Night Garden',
            exact: true,
        })
        .check();
    await select(
        wizard,
        'Choice for Night Garden, 4.4.stable',
        'Share templates',
    );
    await select(
        wizard,
        'Choice for Night Garden, 4.4.stable .NET',
        'Use shared templates',
    );
    await select(wizard, 'Choice for Night Garden, 4.5.stable', 'Decide later');
    await select(wizard, 'Choice for Another Project', 'Decide later');
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    await expect(
        wizard.getByRole('heading', {
            name: 'Check your choices',
            exact: true,
        }),
    ).toBeVisible();
}
/** Checks that an action stays visible in the native 600px window.
 * @param action - Footer control under test.
 */
async function inWindow(action: Locator): Promise<void> {
    const bounds = await action.boundingBox();
    expect(bounds).not.toBeNull();
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
        await page.evaluate(() => window.innerHeight),
    );
}
/** Injects a link failure only for one disposable version; every other filesystem call stays real.
 * @param filename - Fixture-owned local version connection.
 */
async function failConnection(filename: string): Promise<void> {
    await app.evaluate((_, filename) => {
        const target = globalThis as FaultState;
        target.__name = (fn) => fn;
        const fixtureFs = process.getBuiltinModule(
            'node:fs',
        ) as typeof import('node:fs');
        const original = fixtureFs.promises.symlink;
        fixtureFs.promises.symlink = async (
            ...args: Parameters<typeof original>
        ) => {
            if (String(args[1]) === filename)
                throw new Error('Fixture link failure');
            return original(...args);
        };
        target.__restoreMigrationFault = () => {
            fixtureFs.promises.symlink = original;
        };
    }, filename);
}
/** Interrupts removal of an empty transaction directory after a committed move.
 * @param prefix - Fixture-owned backup collection.
 */
async function failCleanup(prefix: string): Promise<void> {
    await app.evaluate((_, prefix) => {
        const target = globalThis as FaultState;
        target.__name = (fn) => fn;
        const fixtureFs = process.getBuiltinModule(
            'node:fs',
        ) as typeof import('node:fs');
        const original = fixtureFs.promises.rmdir;
        const separator = process.getBuiltinModule('node:path').sep;
        target.__migrationFaultTriggered = false;
        fixtureFs.promises.rmdir = async (
            ...args: Parameters<typeof original>
        ) => {
            if (String(args[0]).startsWith(`${prefix}${separator}`)) {
                target.__migrationFaultTriggered = true;
                throw new Error('Fixture cleanup interruption');
            }
            return original(...args);
        };
        target.__restoreMigrationFault = () => {
            fixtureFs.promises.rmdir = original;
        };
    }, prefix);
}
/** Removes an injected fault before the user explicitly retries or recovers. */
async function restoreFault(): Promise<void> {
    await app.evaluate(() => {
        (globalThis as FaultState).__restoreMigrationFault?.();
    });
}

test.beforeEach(async () => {
    home = await createFixtureHome();
    const prefsPath = path.join(home, '.gd-launcher', 'prefs.json');
    const prefs = JSON.parse(await fs.readFile(prefsPath, 'utf8'));
    prefs.language = 'en';
    prefs.export_template_migration_offered = true;
    await fs.writeFile(prefsPath, JSON.stringify(prefs));
    const projects = ['Night Garden', 'Another Project'].map((name, index) => ({
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
        }
    }
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

for (const option of [
    'Keep current templates',
    'Share templates',
    'Use shared templates',
]) {
    test(`migrates macOS bundles and missing editors with ${option}`, async () => {
        await app.close();
        const projectsPath = path.join(home, '.gd-launcher', 'projects.json');
        const projects = JSON.parse(
            await fs.readFile(projectsPath, 'utf8'),
        ) as ProjectDetails[];
        await fs.unlink(projects[0].launch_path);
        projects[0].launch_path = path.join(home, 'editor-0', 'Godot.app');
        const binary = path.join(
            projects[0].launch_path,
            'Contents',
            'MacOS',
            'Godot',
        );
        await fs.mkdir(path.dirname(binary), { recursive: true });
        await fs.writeFile(binary, 'fixture macOS editor');
        await fs.unlink(projects[1].launch_path);
        await fs.writeFile(projectsPath, JSON.stringify(projects));
        await launch();

        const assessment = await read<TemplateMigrationAssessment>(
            'getMigrationAssessment',
        );
        expect(
            assessment.projects.find((project) => project.name === 'Night Garden'),
        ).toMatchObject({ state: 'needs-review', setIds: ids });
        expect(
            assessment.projects.find((project) => project.name === 'Another Project'),
        ).toMatchObject({ state: 'needs-review', setIds: [ids[1]] });
        const wizard = await choose();
        await expect(
            wizard.getByRole('button', {
                name: 'Choice for Night Garden:',
                exact: false,
            }),
        ).toBeEnabled();
        await expect(
            wizard.getByRole('button', {
                name: 'Choice for Another Project:',
                exact: false,
            }),
        ).toBeEnabled();
        await select(wizard, 'Choice for Another Project', option);

        await wizard
            .getByRole('button', { name: 'Review choices', exact: true })
            .click();
        await expect(
            wizard.getByRole('heading', {
                name: 'Check your choices',
                exact: true,
            }),
        ).toBeVisible();
        expect(await read<TemplateJob[]>('getJobs')).toEqual([]);
        const keepsCopy = option === 'Keep current templates';
        if (!keepsCopy)
            await wizard
                .getByRole('checkbox', { name: confirmation, exact: true })
                .check();
        await wizard
            .getByRole('button', { name: 'Move templates', exact: true })
            .click();
        await expect(
            wizard.getByRole('heading', {
                name: 'Your migration results',
                exact: true,
            }),
        ).toBeVisible();
        expect(
            (await read<ImportedTemplateInventory>('getImportedTemplates')).builds,
        ).toHaveLength(ids.length + (keepsCopy ? 1 : 0));
        for (const id of ids) {
            expect((await fs.lstat(path.join(local(), id))).isSymbolicLink()).toBe(
                true,
            );
            expect(
                await fs.readFile(path.join(local(), id, 'template'), 'utf8'),
            ).toBe(`original 0 ${id}`);
        }
        expect((await fs.lstat(path.join(local(1), ids[1]))).isSymbolicLink()).toBe(
            true,
        );
        expect(
            await fs.readFile(path.join(local(1), ids[1], 'template'), 'utf8'),
        ).toBe(keepsCopy ? `original 1 ${ids[1]}` : `shared ${ids[1]}`);
    });
}

test('offers About once and remembers Finish later without changing files', async () => {
    await app.close();
    const prefsPath = path.join(home, '.gd-launcher', 'prefs.json');
    const prefs = JSON.parse(await fs.readFile(prefsPath, 'utf8'));
    prefs.export_template_migration_offered = false;
    await fs.writeFile(prefsPath, JSON.stringify(prefs));
    await launch();
    const wizard = page.getByTestId('templateMigrationWizard');
    await expect(wizard).toBeVisible();
    await expect(
        wizard.getByRole('button', { name: 'See options', exact: true }),
    ).toBeVisible();
    await wizard
        .getByRole('button', { name: 'Finish later', exact: true })
        .click();
    await expect(wizard).toBeHidden();
    expect(
        await fs.readFile(path.join(local(), ids[0], 'template'), 'utf8'),
    ).toBe(`original 0 ${ids[0]}`);
    await app.close();
    await launch();
    await page.getByTestId('btnExportTemplates').click();
    await expect(
        page.getByRole('button', { name: 'Migrate projects (2)', exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('templateMigrationWizard')).toBeHidden();
});

test('requires explicit removal acknowledgement and applies the real mixed batch', async () => {
    const wizard = await choose();
    await mixedReview(wizard);
    const move = wizard.getByRole('button', {
        name: 'Move templates',
        exact: true,
    });
    await inWindow(move);
    await expect(move).toBeDisabled();
    expect(await read<TemplateJob[]>('getJobs')).toEqual([]);
    await wizard
        .getByRole('checkbox', { name: confirmation, exact: true })
        .check();
    await expect(move).toBeEnabled();
    await page.screenshot({ path: test.info().outputPath('real-review.png') });
    await move.click();
    await expect(
        wizard.getByRole('heading', {
            name: 'Your migration results',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        wizard.getByText(
            'Completed: 3. Could not move: 0. Left for later: 2.',
            { exact: true },
        ),
    ).toBeVisible();
    expect(
        await fs.readFile(path.join(local(), ids[0], 'template'), 'utf8'),
    ).toBe(`original 0 ${ids[0]}`);
    expect(await fs.readFile(path.join(root, ids[1], 'template'), 'utf8')).toBe(
        `shared ${ids[1]}`,
    );
    expect(
        await fs.readFile(path.join(root, ids[1], 'missing-template'), 'utf8'),
    ).toBe('missing shared file');
    expect((await fs.lstat(path.join(local(), ids[3]))).isSymbolicLink()).toBe(
        false,
    );
    await expect(wizard.getByRole('button', { name: 'Done', exact: true })).toBeEnabled();
    await page.screenshot({ path: test.info().outputPath('real-results.png') });
    await wizard
        .getByRole('button', { name: 'Open Export Templates', exact: true })
        .click();
    await expect(wizard).toBeHidden();
    expect(
        (await read<ImportedTemplateInventory>('getImportedTemplates')).builds,
    ).toHaveLength(1);
    await app.close();
    await launch();
    expect(
        (await read<TemplateMigrationAssessment>('getMigrationAssessment'))
            .projects[0].setIds,
    ).toEqual([ids[3]]);
});

test('a source change after Review returns to choices without starting a move', async () => {
    const wizard = await choose();
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    const filename = path.join(local(1), ids[1], 'template');
    const changed = await fs.readFile(filename);
    changed[0] ^= 1;
    await fs.writeFile(filename, changed);
    await wizard
        .getByRole('button', { name: 'Move templates', exact: true })
        .click();
    await expect(wizard.getByRole('alert')).toContainText(
        'Files changed since review',
    );
    await expect(
        wizard.getByRole('button', { name: 'Review choices', exact: true }),
    ).toBeVisible();
    expect(await read<TemplateJob[]>('getJobs')).toEqual([]);
    for (const id of ids)
        expect((await fs.lstat(path.join(local(), id))).isSymbolicLink()).toBe(
            false,
        );
});

test('reopens real partial results and requires a fresh review and acknowledgement for failed versions only', async () => {
    const wizard = await choose();
    await mixedReview(wizard);
    await failConnection(path.join(local(), ids[2]));
    await wizard
        .getByRole('checkbox', { name: confirmation, exact: true })
        .check();
    await wizard
        .getByRole('button', { name: 'Move templates', exact: true })
        .click();
    await expect(
        wizard.getByText(
            'Completed: 2. Could not move: 1. Left for later: 2.',
            { exact: true },
        ),
    ).toBeVisible();
    await restoreFault();
    await wizard.getByRole('button', { name: 'Done', exact: true }).click();
    await page
        .getByRole('button', { name: 'View migration', exact: true })
        .click();
    await expect(
        wizard.getByRole('heading', {
            name: 'Your migration results',
            exact: true,
        }),
    ).toBeVisible();
    await fs.writeFile(
        path.join(local(), ids[2], 'template'),
        'changed before fresh retry',
    );
    const retry = wizard
        .locator('footer')
        .getByRole('button', {
            name: 'Try failed versions again (1)',
            exact: true,
        });
    await inWindow(retry);
    await retry.click();
    await expect(
        wizard.getByRole('heading', {
            name: 'Check your choices',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        wizard.getByRole('checkbox', { name: confirmation, exact: true }),
    ).not.toBeChecked();
    await expect(
        wizard.getByRole('button', { name: 'Move templates', exact: true }),
    ).toBeDisabled();
    expect(
        (await read<TemplateJob[]>('getJobs')).filter((job) => job.migration),
    ).toHaveLength(1);
    expect(
        await fs.readFile(path.join(local(), ids[2], 'template'), 'utf8'),
    ).toBe('changed before fresh retry');
    await wizard
        .getByRole('checkbox', { name: confirmation, exact: true })
        .check();
    await wizard
        .getByRole('button', { name: 'Move templates', exact: true })
        .click();
    await expect(
        wizard.getByText(
            'Completed: 3. Could not move: 0. Left for later: 2.',
            { exact: true },
        ),
    ).toBeVisible();
    const batches = (await read<TemplateJob[]>('getJobs')).filter(
        (job) => job.migration,
    );
    expect(
        batches[1].migration?.versions.filter(
            (version) => version.status !== 'later',
        ),
    ).toEqual([
        {
            projectPath: path.join(home, 'project-0'),
            setId: ids[2],
            status: 'complete',
        },
    ]);
    expect(
        (await read<ImportedTemplateInventory>('getImportedTemplates')).builds,
    ).toHaveLength(1);
    expect((await fs.lstat(path.join(local(), ids[3]))).isSymbolicLink()).toBe(
        false,
    );
    await wizard.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'View migration', exact: true }),
    ).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'Migrate projects (2)', exact: true }),
    ).toBeVisible();
});

test('keeps recovery in the footer and resolves a committed result without moving it again', async () => {
    const wizard = await choose();
    await wizard
        .getByRole('switch', {
            name: 'Choose for each version in Night Garden',
            exact: true,
        })
        .check();
    for (const id of ids.slice(1))
        await select(
            wizard,
            `Choice for Night Garden, ${id.replace(/\.mono$/, ' .NET')}`,
            'Decide later',
        );
    await select(wizard, 'Choice for Another Project', 'Decide later');
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    await failCleanup(
        path.join(
            path.dirname(local()),
            'launcher_export_templates',
            'version-backups',
        ),
    );
    await wizard
        .getByRole('button', { name: 'Move templates', exact: true })
        .click();
    await expect(
        wizard.getByText(
            'Completed: 0. Could not move: 1. Left for later: 4.',
            { exact: true },
        ),
    ).toBeVisible();
    const recover = wizard
        .locator('footer')
        .getByRole('button', { name: 'Recover interrupted move', exact: true });
    await expect(recover).toBeVisible();
    expect(await app.evaluate(() => (globalThis as FaultState).__migrationFaultTriggered)).toBe(true);
    await inWindow(recover);
    await expect(
        wizard.getByRole('button', { name: /Try failed versions again/ }),
    ).toHaveCount(0);
    await restoreFault();
    await recover.click();
    await expect(
        wizard.getByText(
            'Completed: 1. Could not move: 0. Left for later: 4.',
            { exact: true },
        ),
    ).toBeVisible();
    expect(
        (await read<TemplateMigrationAssessment>('getMigrationAssessment'))
            .recoveryIds,
    ).toEqual([]);
    expect(
        (await read<ImportedTemplateInventory>('getImportedTemplates')).builds,
    ).toHaveLength(1);
    expect(
        (await read<TemplateJob[]>('getJobs')).filter((job) => job.migration),
    ).toHaveLength(1);
});

test('an unreadable recovery file blocks Review and keeps a failed recovery actionable', async () => {
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
    const wizard = await choose();
    await expect(
        wizard.getByRole('button', { name: 'Review choices', exact: true }),
    ).toBeDisabled();
    const recover = wizard
        .locator('footer')
        .getByRole('button', { name: 'Recover interrupted move', exact: true });
    await recover.click();
    await expect(recover).toBeEnabled();
    expect(await fs.readFile(journal, 'utf8')).toBe('{interrupted JSON');
    await wizard
        .getByRole('button', { name: 'Finish later', exact: true })
        .click();
    await expect(wizard).toBeHidden();
});

test('empty projects connect automatically and do not trigger the upgrade offer', async () => {
    await app.close();
    for (const index of [0, 1]) {
        await fs.rm(local(index), { recursive: true });
        await fs.mkdir(local(index));
    }
    const prefsPath = path.join(home, '.gd-launcher', 'prefs.json');
    const prefs = JSON.parse(await fs.readFile(prefsPath, 'utf8'));
    prefs.export_template_migration_offered = false;
    await fs.writeFile(prefsPath, JSON.stringify(prefs));
    await launch();
    await page.getByTestId('btnExportTemplates').click();
    await expect
        .poll(async () => (await fs.lstat(local())).isSymbolicLink())
        .toBe(true);
    await expect
        .poll(
            async () =>
                (
                    await read<TemplateMigrationAssessment>(
                        'getMigrationAssessment',
                    )
                ).pendingCount,
        )
        .toBe(0);
    await expect(page.getByTestId('templateMigrationWizard')).toBeHidden();
    await expect(
        page.getByRole('button', { name: /^Migrate projects/ }),
    ).toHaveCount(0);
});

test('reopens the exact active batch after a renderer reload and keeps Move locked until main finishes', async () => {
    const wizard = await choose();
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    await app.evaluate(
        (_, source) => {
            const target = globalThis as FaultState;
            target.__name = (fn) => fn;
            const fixtureFs = process.getBuiltinModule(
                'node:fs',
            ) as typeof import('node:fs');
            const original = fixtureFs.promises.rename;
            target.__migrationFaultTriggered = false;
            let release: () => void = () => {};
            const paused = new Promise<void>((resolve) => {
                release = resolve;
            });
            fixtureFs.promises.rename = async (
                ...args: Parameters<typeof original>
            ) => {
                if (String(args[0]) === source) {
                    target.__migrationFaultTriggered = true;
                    await paused;
                }
                return original(...args);
            };
            target.__restoreMigrationFault = () => {
                fixtureFs.promises.rename = original;
                release();
            };
        },
        path.join(local(), ids[0]),
    );
    await wizard
        .getByRole('button', { name: 'Move templates', exact: true })
        .click();
    await expect.poll(() => app.evaluate(() => (globalThis as FaultState).__migrationFaultTriggered)).toBe(true);
    await expect(wizard.getByRole('status')).toContainText('Updating the project connection');
    expect((await read<TemplateMigrationAssessment>('getMigrationAssessment')).recoveryIds).toEqual([]);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(wizard.getByRole('alert')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(wizard).toBeVisible();
    await page.reload();
    await page
        .getByRole('button', { name: 'View migration', exact: true })
        .click();
    await expect(
        wizard.getByRole('heading', {
            name: 'Moving export templates',
            exact: true,
        }),
    ).toBeVisible();
    await expect(wizard.getByRole('status')).toContainText('Updating the project connection');
    await expect(wizard.getByRole('alert')).toHaveCount(0);
    await expect(
        wizard.getByRole('button', {
            name: 'Moving templates...',
            exact: true,
        }),
    ).toBeDisabled();
    await expect(
        wizard.getByRole('button', { name: 'Finish later', exact: true }),
    ).toHaveCount(0);
    await restoreFault();
    await expect(
        wizard.getByText(
            'Completed: 5. Could not move: 0. Left for later: 0.',
            { exact: true },
        ),
    ).toBeVisible();
    expect(
        (await read<TemplateJob[]>('getJobs')).filter((job) => job.migration),
    ).toHaveLength(1);
});
