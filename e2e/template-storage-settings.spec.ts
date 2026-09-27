import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Page,
    test,
} from '@playwright/test';
import type {
    ImportedTemplateBuild,
    ProjectDetails,
    TemplateStorageKind,
    TemplateStorageSettings,
} from '@shared/contracts';
import { getMainWindow } from './splashscreen/getMainWindow';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import {
    createFixtureHome,
    prepareOnboardingFixture,
    reloadE2eFixturePage,
} from './support/e2e-fixture-runtime';
import { storedZip } from './support/stored-zip.util';

type FixtureWindow = Window & {
    __di_electron__: { invoke: (channel: string) => Promise<unknown> };
};

let fixtureHome: string;
let app: ElectronApplication;
let page: Page;
let officialRoot: string;
let importedRoot: string;
let build: ImportedTemplateBuild & { directoryName: string };
let projects: ProjectDetails[];
let launchEnvironment: Record<string, string>;

test.setTimeout(90_000);

/** Opens the storage settings through the real Electron preload bridge. */
async function launch(): Promise<void> {
    app = await _electron.launch({
        args: [
            '.',
            `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`,
        ],
        env: launchEnvironment,
    });
    page = await getMainWindow(app);
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabExportTemplates').click();
    await expect(page.getByTestId('templateStorage-official')).toBeVisible();
}

/** Reads the main-owned move state independently of the settings component. */
async function storageState(): Promise<TemplateStorageSettings> {
    const result = await page.evaluate(() =>
        (window as unknown as FixtureWindow).__di_electron__.invoke(
            'exportTemplates.getStorageSettings',
        ),
    );
    return (result as { data: TemplateStorageSettings }).data;
}

/** Selects a storage destination from the native directory picker.
 * @param destination - Exact physical directory selected by the user.
 */
async function chooseStorageDestination(destination: string): Promise<void> {
    await app.evaluate(({ dialog }, selectedPath) => {
        dialog.showOpenDialog = async () => ({
            canceled: false,
            filePaths: [selectedPath],
        });
    }, destination);
}

/** Reviews and confirms a destination through the storage move modal.
 * @param kind - Store being moved.
 * @param destination - Exact physical directory selected by the user.
 * @param templateCount - Complete template collections included in the move.
 */
async function moveStorage(
    kind: TemplateStorageKind,
    destination: string,
    templateCount = 1,
): Promise<void> {
    await chooseStorageDestination(destination);
    await page.getByTestId(`templateStorageMove-${kind}`).click();
    const dialog = page.getByTestId('templateStorageMoveDialog');
    await expect(dialog).toBeVisible();
    await expect(
        dialog.getByRole('heading', {
            name: 'Move export templates',
            exact: true,
        }),
    ).toBeVisible();
    await expect(dialog).toContainText(
        new RegExp(
            `You are about to move ${templateCount} template${templateCount === 1 ? '' : 's'} \\(.+\\) to:`,
        ),
    );
    await expect(dialog).toContainText(destination);
    await expect(dialog).toContainText('Available space');
    await expect(dialog).toContainText(
        'Close all Godot editors and stop exports before moving templates.',
    );
    await page.screenshot({
        path: test.info().outputPath(`template-storage-${kind}-review.png`),
        animations: 'disabled',
    });
    await dialog
        .getByRole('button', { name: 'Move templates', exact: true })
        .click();
    await expect
        .poll(async () => (await storageState()).job?.stage)
        .toBe('complete');
    await expect(
        dialog.getByRole('button', { name: 'Done', exact: true }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByTestId(`templateStoragePath-${kind}`)).toHaveValue(
        destination,
    );
}

/** Resolves the active template directory for an isolated project.
 * @param project - Registered fixture project.
 */
function activeTemplates(project: ProjectDetails): string {
    return path.join(
        path.dirname(project.launch_path),
        'editor_data',
        'export_templates',
    );
}

test.beforeEach(async () => {
    fixtureHome = await fs.realpath(await createFixtureHome());
    const config = path.join(fixtureHome, '.gd-launcher');
    officialRoot = path.join(config, 'godot', 'export_templates');
    importedRoot = path.join(config, 'export-templates');
    const preferencesFile = path.join(config, 'prefs.json');
    const preferences = JSON.parse(await fs.readFile(preferencesFile, 'utf8'));
    await fs.writeFile(
        preferencesFile,
        JSON.stringify({
            ...preferences,
            language: 'en',
            export_template_migration_offered: true,
        }),
    );
    await fs.mkdir(path.join(officialRoot, '4.4.stable'), { recursive: true });
    await fs.writeFile(
        path.join(officialRoot, '4.4.stable', 'linux_release.x86_64'),
        'official fixture contents',
    );
    await fs.writeFile(path.join(officialRoot, 'user-notes.txt'), 'keep me');
    build = {
        id: randomUUID(),
        revision: randomUUID(),
        label: 'Custom fixture',
        directoryName: 'Custom fixture',
        setId: '4.4.stable',
        importedAt: '2026-09-22T10:00:00Z',
        archiveName: 'fixture.tpz',
        files: ['linux_release.x86_64'],
        sizeBytes: Buffer.byteLength('imported fixture contents'),
    };
    const contents = path.join(
        importedRoot,
        'imported',
        build.setId,
        build.directoryName,
    );
    await fs.mkdir(contents, { recursive: true });
    await fs.writeFile(
        path.join(contents, 'linux_release.x86_64'),
        'imported fixture contents',
    );
    await fs.writeFile(
        path.join(importedRoot, 'imported-templates.json'),
        JSON.stringify({ schemaVersion: 1, builds: [build] }),
    );
    projects = ['Official project', 'Imported project'].map((name, index) => ({
        ...SAMPLE_PROJECTS[0],
        name,
        path: path.join(fixtureHome, `project-${index}`),
        launch_path: path.join(fixtureHome, `editor-${index}`, 'Godot'),
        release: {
            ...SAMPLE_PROJECTS[0].release,
            version: '4.4-stable',
            source: 'official' as const,
            mono: false,
        },
        exportTemplateMode: 'shared' as const,
        exportTemplateBuilds: {
            '4.4.stable': index === 1 ? build.id : 'official',
        },
    }));
    for (const project of projects) {
        await fs.mkdir(project.path, { recursive: true });
        await fs.writeFile(
            path.join(project.path, 'project.godot'),
            '[application]\nconfig/name="Storage fixture"\n',
        );
        await fs.mkdir(path.dirname(activeTemplates(project)), {
            recursive: true,
        });
        await fs.writeFile(project.launch_path, 'fixture editor');
        await fs.symlink(
            officialRoot,
            activeTemplates(project),
            process.platform === 'win32' ? 'junction' : 'dir',
        );
    }
    await fs.writeFile(
        path.join(config, 'projects.json'),
        JSON.stringify(projects),
    );
    const environment: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: fixtureHome,
        USERPROFILE: fixtureHome,
        APPDATA: path.join(fixtureHome, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(fixtureHome, 'AppData', 'Local'),
        XDG_CONFIG_HOME: path.join(fixtureHome, '.config'),
        XDG_DATA_HOME: path.join(fixtureHome, '.local', 'share'),
        GODOT_LAUNCHER_E2E_FIXTURES: '1',
        GODOT_LAUNCHER_E2E_HOME_DIR: fixtureHome,
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    launchEnvironment = Object.fromEntries(
        Object.entries(environment).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
        ),
    );
    await launch();
});

test.afterEach(async () => {
    await app?.close().catch(() => undefined);
    if (fixtureHome) await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('moves both complete stores, preserves project links and survives restart', async () => {
    const officialDestination = path.join(fixtureHome, 'relocated-official');
    const importedDestination = path.join(fixtureHome, 'relocated-imported');
    await fs.mkdir(officialDestination, { mode: 0o700 });
    const originalDestination = await fs.stat(officialDestination);
    const platform =
        process.platform === 'darwin'
            ? 'macOS'
            : process.platform === 'win32'
              ? 'Windows'
              : 'Linux';
    await expect(
        page.getByText(
            `On ${platform}, Godot's default export template folder is ${officialRoot}.`,
            { exact: true },
        ),
    ).toBeVisible();
    await expect(page.getByTestId('templateStoragePath-official')).toHaveValue(
        officialRoot,
    );
    await expect(
        page.getByTestId('templateStoragePath-official'),
    ).toHaveAttribute('readonly', '');
    await moveStorage('official', officialDestination);
    expect(await fs.stat(officialDestination)).toMatchObject({
        ino: originalDestination.ino,
        mode: originalDestination.mode,
        uid: originalDestination.uid,
        gid: originalDestination.gid,
        birthtimeMs: originalDestination.birthtimeMs,
    });
    await moveStorage('imported', importedDestination);
    expect((await fs.lstat(officialRoot)).isSymbolicLink()).toBe(true);
    expect((await fs.lstat(importedRoot)).isSymbolicLink()).toBe(true);
    expect(await fs.realpath(officialRoot)).toBe(
        await fs.realpath(officialDestination),
    );
    expect(await fs.realpath(importedRoot)).toBe(
        await fs.realpath(importedDestination),
    );
    expect(
        path.resolve(
            path.dirname(path.join(activeTemplates(projects[1]), '4.4.stable')),
            await fs.readlink(
                path.join(activeTemplates(projects[1]), '4.4.stable'),
            ),
        ),
    ).toBe(
        path.join(
            importedDestination,
            'imported',
            build.setId,
            build.directoryName,
        ),
    );
    expect(
        await fs.readFile(
            path.join(officialDestination, 'user-notes.txt'),
            'utf8',
        ),
    ).toBe('keep me');
    expect(
        JSON.parse(
            await fs.readFile(
                path.join(importedDestination, 'imported-templates.json'),
                'utf8',
            ),
        ).builds,
    ).toEqual([build]);
    expect(
        await fs.readFile(
            path.join(
                activeTemplates(projects[0]),
                '4.4.stable',
                'linux_release.x86_64',
            ),
            'utf8',
        ),
    ).toBe('official fixture contents');
    expect(
        await fs.readFile(
            path.join(
                activeTemplates(projects[1]),
                '4.4.stable',
                'linux_release.x86_64',
            ),
            'utf8',
        ),
    ).toBe('imported fixture contents');
    await app.close();
    const importedVersionLink = path.join(
        activeTemplates(projects[1]),
        '4.4.stable',
    );
    await fs.unlink(importedVersionLink);
    await fs.symlink(
        path.join(
            importedRoot,
            'imported',
            build.setId,
            build.directoryName,
        ),
        importedVersionLink,
        process.platform === 'win32' ? 'junction' : 'dir',
    );
    await launch();
    const state = await storageState();
    expect(state.defaultGodotPath).toBe(officialRoot);
    expect(state.locations.map((location) => location.status)).toEqual([
        'healthy',
        'healthy',
    ]);
    expect(
        path.resolve(
            path.dirname(path.join(activeTemplates(projects[1]), '4.4.stable')),
            await fs.readlink(
                path.join(activeTemplates(projects[1]), '4.4.stable'),
            ),
        ),
    ).toBe(
        path.join(
            importedDestination,
            'imported',
            build.setId,
            build.directoryName,
        ),
    );
    expect(
        JSON.parse(
            await fs.readFile(
                path.join(fixtureHome, '.gd-launcher', 'projects.json'),
                'utf8',
            ),
        ).map((project: ProjectDetails) => project.exportTemplateBuilds),
    ).toEqual(projects.map((project) => project.exportTemplateBuilds));
    await page.setViewportSize({ width: 1024, height: 600 });
    const panel = page.getByTestId('settingsPanelContainer');
    expect(
        await panel.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
        ),
    ).toBe(true);
    await page.screenshot({
        path: test.info().outputPath('template-storage-settings.png'),
        animations: 'disabled',
    });
    await page.getByTestId('tabAppearance').click();
    await page.getByTestId('themeDark').click();
    await page.getByTestId('tabExportTemplates').click();
    await expect(page.getByTestId('templateStorage-imported')).toBeVisible();
    expect(
        await panel.evaluate(
            (element) => element.scrollWidth <= element.clientWidth,
        ),
    ).toBe(true);
    await page.screenshot({
        path: test.info().outputPath('template-storage-settings-dark.png'),
        animations: 'disabled',
    });
    await page.getByTestId('btnExportTemplates').click();
    await expect(
        page.getByRole('article', { name: build.label, exact: true }),
    ).toBeVisible();
    const archive = path.join(fixtureHome, 'after-move.tpz');
    await fs.writeFile(
        archive,
        storedZip({
            'templates/version.txt': '4.4.stable',
            'templates/web_release.zip': 'imported after relocation',
        }),
    );
    await app.evaluate(({ dialog }, filename) => {
        dialog.showOpenDialog = async () => ({
            canceled: false,
            filePaths: [filename],
        });
    }, archive);
    await page
        .getByRole('button', { name: 'Import .tpz', exact: true })
        .click();
    const dialog = page.getByRole('dialog', {
        name: 'Import export templates',
        exact: true,
    });
    await dialog
        .getByRole('button', { name: 'Choose TPZ file', exact: true })
        .click();
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await dialog
        .getByRole('textbox', { name: 'Name', exact: true })
        .fill('After relocation');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toBeHidden();
    const registry = JSON.parse(
        await fs.readFile(
            path.join(importedDestination, 'imported-templates.json'),
            'utf8',
        ),
    ) as { builds: ImportedTemplateBuild[] };
    const added = registry.builds.find(
        (item) => item.label === 'After relocation',
    );
    expect(added).toBeDefined();
    expect(
        await fs.readFile(
            path.join(
                importedDestination,
                'imported',
                added!.setId,
                added!.directoryName!,
                'web_release.zip',
            ),
            'utf8',
        ),
    ).toBe('imported after relocation');
});

test('a second move removes the previous physical store without breaking its canonical path', async () => {
    const first = path.join(fixtureHome, 'first-imported');
    const second = path.join(fixtureHome, 'second-imported');
    await moveStorage('imported', first);
    await moveStorage('imported', second);
    expect(await fs.lstat(first).catch(() => null)).toBeNull();
    expect(await fs.realpath(importedRoot)).toBe(await fs.realpath(second));
    expect(
        path.resolve(
            path.dirname(path.join(activeTemplates(projects[1]), '4.4.stable')),
            await fs.readlink(
                path.join(activeTemplates(projects[1]), '4.4.stable'),
            ),
        ),
    ).toBe(path.join(second, 'imported', build.setId, build.directoryName));
    expect(
        await fs.readFile(
            path.join(
                activeTemplates(projects[1]),
                '4.4.stable',
                'linux_release.x86_64',
            ),
            'utf8',
        ),
    ).toBe('imported fixture contents');
});

for (const linkedParent of [false, true]) {
    test(`offers to move official templates back to Godot's default folder (linked parent: ${linkedParent})`, async () => {
        if (linkedParent) {
            await app.close();
            const parent = path.dirname(officialRoot);
            const physicalParent = path.join(
                fixtureHome,
                'physical-official-parent',
            );
            await fs.rename(parent, physicalParent);
            await fs.symlink(
                physicalParent,
                parent,
                process.platform === 'win32' ? 'junction' : 'dir',
            );
            await launch();
        }
        const reviewedDefault = path.join(
            await fs.realpath(path.dirname(officialRoot)),
            path.basename(officialRoot),
        );
        const destination = path.join(fixtureHome, 'relocated-official');
        const returnButton = page.getByTestId('templateStorageReturnDefault');
        await expect(returnButton).toBeHidden();
        await moveStorage('official', destination);
        await expect(returnButton).toBeVisible();
        await returnButton.click();
        const dialog = page.getByTestId('templateStorageMoveDialog');
        await expect(dialog).toContainText(reviewedDefault);
        await expect(dialog).toContainText('You are about to move 1 template');
        await dialog
            .getByRole('button', { name: 'Move templates', exact: true })
            .click();
        await expect
            .poll(async () => (await storageState()).job?.stage)
            .toBe('complete');
        await dialog.getByRole('button', { name: 'Done', exact: true }).click();
        await expect(returnButton).toBeHidden();
        await expect(
            page.getByTestId('templateStoragePath-official'),
        ).toHaveValue(officialRoot);
        expect((await fs.lstat(officialRoot)).isDirectory()).toBe(true);
        expect(await fs.stat(destination).catch(() => null)).toBeNull();
        expect(
            await fs.readFile(
                path.join(officialRoot, 'user-notes.txt'),
                'utf8',
            ),
        ).toBe('keep me');
        expect(
            await fs.readFile(
                path.join(
                    activeTemplates(projects[0]),
                    '4.4.stable',
                    'linux_release.x86_64',
                ),
                'utf8',
            ),
        ).toBe('official fixture contents');
        await app.close();
        await launch();
        await expect(
            page.getByTestId('templateStorageReturnDefault'),
        ).toBeHidden();
        expect((await fs.lstat(officialRoot)).isDirectory()).toBe(true);
    });
}

test('chooses imported template storage during first-run setup', async () => {
    await prepareOnboardingFixture(page, app, 'linux', 'setup');
    await expect(page.getByTestId('onboarding-step-heading')).toBeVisible();
    const field = page.getByTestId('onboarding-imported-templates-location');
    await expect(field).toBeVisible();
    await expect(field).toHaveValue(importedRoot);
    const target = path.join(fixtureHome, 'custom-first-run-imported');
    await field.fill(target);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Finish and view projects' }),
    ).toBeVisible();
    await page
        .getByRole('button', { name: 'Finish and view projects' })
        .click();
    await expect(page).toHaveURL(/#\/projects$/);
    expect(await fs.realpath(importedRoot)).toBe(await fs.realpath(target));
    expect(
        JSON.parse(
            await fs.readFile(path.join(target, 'imported-templates.json'), 'utf8'),
        ).builds,
    ).toEqual([build]);
});

test('retries a first-run move that rolled back cleanly', async () => {
    await prepareOnboardingFixture(page, app, 'linux', 'setup');
    const destination = path.join(fixtureHome, 'retry-first-run-imported');
    await page.getByTestId('onboarding-imported-templates-location').fill(destination);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await app.evaluate(({}, canonical) => {
        const fixtureFs = process.getBuiltinModule('node:fs');
        const symlink = fixtureFs.promises.symlink;
        fixtureFs.promises.symlink = async (target, link, type) => {
            if (String(link) === canonical) {
                fixtureFs.promises.symlink = symlink;
                throw new Error('fixture link failure');
            }
            return symlink(target, link, type);
        };
    }, importedRoot);
    const finish = page.getByRole('button', { name: 'Finish and view projects' });
    await finish.click();
    await expect(page.getByRole('alert')).toContainText('The template storage move could not complete');
    await expect(finish).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Recover files' })).toBeHidden();
    expect((await storageState()).recoveryRequired).toBe(false);

    await finish.click();
    await expect(page).toHaveURL(/#\/projects$/);
    expect(await fs.realpath(importedRoot)).toBe(await fs.realpath(destination));
});

test('recovers an interrupted first-run move before retrying setup', async () => {
    await prepareOnboardingFixture(page, app, 'linux', 'setup');
    const destination = path.join(fixtureHome, 'interrupted-first-run-imported');
    await page.getByTestId('onboarding-imported-templates-location').fill(destination);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await app.evaluate(({}, canonical) => {
        const fixtureFs = process.getBuiltinModule('node:fs');
        const symlink = fixtureFs.promises.symlink;
        const rename = fixtureFs.promises.rename;
        fixtureFs.promises.symlink = async (target, link, type) => {
            if (String(link) === canonical) {
                fixtureFs.promises.symlink = symlink;
                throw new Error('fixture link failure');
            }
            return symlink(target, link, type);
        };
        fixtureFs.promises.rename = async (source, target) => {
            if (
                String(target) === canonical &&
                String(source).startsWith(`${canonical}.launcher-storage-`)
            ) {
                fixtureFs.promises.rename = rename;
                throw new Error('fixture rollback failure');
            }
            return rename(source, target);
        };
    }, importedRoot);
    const finish = page.getByRole('button', { name: 'Finish and view projects' });
    await finish.click();
    const recover = page.getByRole('button', { name: 'Recover files' });
    await expect(recover).toBeVisible();
    await expect(finish).toBeDisabled();
    expect((await storageState()).recoveryRequired).toBe(true);

    await reloadE2eFixturePage(page);
    await expect(recover).toBeVisible();
    await expect(finish).toBeDisabled();
    await page.screenshot({
        path: test.info().outputPath('onboarding-template-recovery.png'),
        animations: 'disabled',
    });
    await recover.click();
    await expect(recover).toBeHidden();
    expect((await storageState()).recoveryRequired).toBe(false);
    expect((await fs.lstat(importedRoot)).isDirectory()).toBe(true);
    expect(await fs.stat(destination).catch(() => null)).toBeNull();
    await expect(
        page.getByTestId('onboarding-imported-templates-location'),
    ).toHaveValue(destination);
    await expect(finish).toBeHidden();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await finish.click();
    await expect(page).toHaveURL(/#\/projects$/);
    expect(await fs.realpath(importedRoot)).toBe(await fs.realpath(destination));
});

test('finishes first-run setup when recovery completes the storage move', async () => {
    await prepareOnboardingFixture(page, app, 'linux', 'setup');
    const destination = path.join(fixtureHome, 'completed-first-run-imported');
    await page.getByTestId('onboarding-imported-templates-location').fill(destination);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await app.evaluate(({}, canonical) => {
        const fixtureFs = process.getBuiltinModule('node:fs');
        const rm = fixtureFs.promises.rm;
        let failures = 2;
        fixtureFs.promises.rm = async (target, options) => {
            if (
                String(target).startsWith(`${canonical}.launcher-storage-`) &&
                failures > 0
            ) {
                failures -= 1;
                if (failures === 0) fixtureFs.promises.rm = rm;
                throw new Error('fixture cleanup failure');
            }
            return rm(target, options);
        };
    }, importedRoot);
    const finish = page.getByRole('button', { name: 'Finish and view projects' });
    await finish.click();
    const recover = page.getByRole('button', { name: 'Recover files' });
    await expect(recover).toBeVisible();
    expect((await storageState()).recoveryRequired).toBe(true);
    expect(await fs.realpath(importedRoot)).toBe(await fs.realpath(destination));

    await reloadE2eFixturePage(page);
    await expect(recover).toBeVisible();
    await recover.click();
    await expect(recover).toBeHidden();
    await expect(finish).toBeEnabled();
    expect((await storageState()).recoveryRequired).toBe(false);
    await finish.click();
    await expect(page).toHaveURL(/#\/projects$/);
    expect(await fs.realpath(importedRoot)).toBe(await fs.realpath(destination));
});

test('cancelling a review and rejecting an occupied destination leave storage untouched', async () => {
    const reviewDestination = path.join(fixtureHome, 'cancelled-review');
    const destination = path.join(fixtureHome, 'occupied');
    await fs.mkdir(destination);
    await fs.writeFile(
        path.join(destination, 'existing.txt'),
        'existing user file',
    );
    await app.evaluate(({ dialog }) => {
        dialog.showOpenDialog = async () => ({
            canceled: true,
            filePaths: [],
        });
    });
    await page.getByTestId('templateStorageMove-official').click();
    await expect(page.getByTestId('templateStorageMoveDialog')).toBeHidden();
    expect((await fs.lstat(officialRoot)).isDirectory()).toBe(true);
    await chooseStorageDestination(officialRoot);
    await page.getByTestId('templateStorageMove-official').click();
    await expect(page.getByTestId('templateStorageMoveDialog')).toBeHidden();
    expect((await fs.lstat(officialRoot)).isDirectory()).toBe(true);
    await chooseStorageDestination(reviewDestination);
    await page.getByTestId('templateStorageMove-official').click();
    const dialog = page.getByTestId('templateStorageMoveDialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect((await fs.lstat(officialRoot)).isDirectory()).toBe(true);
    await chooseStorageDestination(destination);
    await page.getByTestId('templateStorageMove-official').click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect((await fs.lstat(officialRoot)).isSymbolicLink()).toBe(false);
    expect(
        await fs.readFile(path.join(destination, 'existing.txt'), 'utf8'),
    ).toBe('existing user file');
    expect(
        await fs.readFile(
            path.join(officialRoot, '4.4.stable', 'linux_release.x86_64'),
            'utf8',
        ),
    ).toBe('official fixture contents');
});

test('shows destination capacity and prevents confirmation when it is insufficient', async () => {
    const destination = path.join(fixtureHome, 'insufficient-space');
    await app.evaluate(() => {
        const fixtureFs = process.getBuiltinModule(
            'node:fs',
        ) as typeof import('node:fs');
        fixtureFs.promises.statfs = (async () => ({
            bavail: 0,
            bsize: 1,
        })) as unknown as typeof fixtureFs.promises.statfs;
    });
    await chooseStorageDestination(destination);
    await page.getByTestId('templateStorageMove-official').click();
    const dialog = page.getByTestId('templateStorageMoveDialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Available space');
    await expect(
        dialog.getByText(
            'There is not enough free space. Choose another folder.',
            { exact: true },
        ),
    ).toBeVisible();
    await expect(
        dialog.getByRole('button', { name: 'Move templates', exact: true }),
    ).toBeDisabled();
    await expect(
        dialog.getByRole('button', {
            name: 'Choose another folder',
            exact: true,
        }),
    ).toBeVisible();
    expect((await fs.lstat(officialRoot)).isDirectory()).toBe(true);
    expect(await fs.stat(destination).catch(() => null)).toBeNull();
});

test('an unavailable imported drive is reported without creating an empty replacement library', async () => {
    const destination = path.join(fixtureHome, 'external-imported');
    await moveStorage('imported', destination);
    await app.close();
    const disconnected = `${destination}-disconnected`;
    await fs.rename(destination, disconnected);
    projects[1].exportTemplateBuilds = {
        '4.4.stable': 'official',
        '4.3.stable': build.id,
    };
    await fs.writeFile(
        path.join(fixtureHome, '.gd-launcher', 'projects.json'),
        JSON.stringify(projects),
    );
    await launch();
    await expect
        .poll(
            async () =>
                (await storageState()).locations.find(
                    (location) => location.kind === 'imported',
                )?.status,
        )
        .toBe('unavailable');
    expect((await fs.lstat(importedRoot)).isSymbolicLink()).toBe(true);
    expect(await fs.stat(destination).catch(() => null)).toBeNull();
    expect(
        JSON.parse(
            await fs.readFile(path.join(disconnected, 'imported-templates.json'), 'utf8'),
        ).builds,
    ).toEqual([build]);
    const result = await page.evaluate(() =>
        (window as unknown as FixtureWindow).__di_electron__.invoke(
            'exportTemplates.getImportedTemplates',
        ),
    );
    expect((result as { success: boolean }).success).toBe(false);
    const officialInventory = await page.evaluate(() =>
        (window as unknown as FixtureWindow).__di_electron__.invoke(
            'exportTemplates.getInventory',
        ),
    );
    expect((officialInventory as { success: boolean }).success).toBe(true);
    expect(
        (await fs.lstat(activeTemplates(projects[1]))).isSymbolicLink(),
    ).toBe(true);
    expect(
        await fs.readFile(
            path.join(
                activeTemplates(projects[1]),
                '4.4.stable',
                'linux_release.x86_64',
            ),
            'utf8',
        ),
    ).toBe('official fixture contents');
});

test('moves an empty official store and the fresh imported default', async () => {
    await app.close();
    await fs.writeFile(
        path.join(fixtureHome, '.gd-launcher', 'projects.json'),
        '[]',
    );
    await fs.rm(path.dirname(officialRoot), { recursive: true });
    await fs.rm(importedRoot, { recursive: true });
    await launch();
    const initial = await storageState();
    expect(initial.locations.map((location) => location.status)).toEqual([
        'empty',
        'healthy',
    ]);
    const importedDefault = path.join(fixtureHome, 'Godot', 'ExportTemplates');
    expect(initial.locations[1].defaultPath).toBe(importedDefault);
    expect(initial.locations[1].storagePath).toBe(importedDefault);
    expect(await fs.realpath(importedRoot)).toBe(
        await fs.realpath(importedDefault),
    );
    const officialDestination = path.join(fixtureHome, 'empty-official');
    const importedDestination = path.join(fixtureHome, 'empty-imported');
    await moveStorage('official', officialDestination, 0);
    await moveStorage('imported', importedDestination, 0);
    expect(await fs.realpath(officialRoot)).toBe(
        await fs.realpath(officialDestination),
    );
    expect(await fs.realpath(importedRoot)).toBe(
        await fs.realpath(importedDestination),
    );
    expect(await fs.readdir(officialDestination)).toEqual([]);
    expect(await fs.readdir(importedDestination)).toEqual([]);
});

test('keeps an occupied imported default folder untouched and allows another location', async () => {
    await app.close();
    await fs.writeFile(
        path.join(fixtureHome, '.gd-launcher', 'projects.json'),
        '[]',
    );
    await fs.rm(importedRoot, { recursive: true });
    const occupiedDefault = path.join(fixtureHome, 'Godot', 'ExportTemplates');
    await fs.mkdir(occupiedDefault, { recursive: true });
    await fs.writeFile(
        path.join(occupiedDefault, 'other-user-file.txt'),
        'keep me',
    );
    await launch();
    const imported = (await storageState()).locations.find(
        (location) => location.kind === 'imported',
    );
    expect(imported?.defaultPath).toBe(occupiedDefault);
    expect(imported?.storagePath).toBe(importedRoot);
    expect(imported?.status).toBe('healthy');
    expect((await fs.lstat(importedRoot)).isDirectory()).toBe(true);
    const alternative = path.join(fixtureHome, 'safe-imported');
    await moveStorage('imported', alternative, 0);
    expect(
        await fs.readFile(
            path.join(occupiedDefault, 'other-user-file.txt'),
            'utf8',
        ),
    ).toBe('keep me');
    expect(await fs.realpath(importedRoot)).toBe(
        await fs.realpath(alternative),
    );
});

test('recovers a process interruption during the canonical link switch before loading templates', async () => {
    const destination = path.join(fixtureHome, 'interrupted-official');
    await app.evaluate(({}, canonical) => {
        const fixtureFs = process.getBuiltinModule('node:fs');
        const symlink = fixtureFs.promises.symlink;
        const state = globalThis as typeof globalThis & {
            storageSwitchPaused?: boolean;
        };
        fixtureFs.promises.symlink = async (target, link, type) => {
            if (String(link) === canonical) {
                state.storageSwitchPaused = true;
                await new Promise<void>(() => undefined);
            }
            return symlink(target, link, type);
        };
    }, officialRoot);
    await chooseStorageDestination(destination);
    await page.getByTestId('templateStorageMove-official').click();
    const dialog = page.getByTestId('templateStorageMoveDialog');
    await dialog
        .getByRole('button', { name: 'Move templates', exact: true })
        .click();
    await expect
        .poll(() =>
            app.evaluate(
                () =>
                    (
                        globalThis as typeof globalThis & {
                            storageSwitchPaused?: boolean;
                        }
                    ).storageSwitchPaused,
            ),
        )
        .toBe(true);
    const interruptedProcess = app.process();
    interruptedProcess.kill('SIGKILL');
    await expect
        .poll(
            () =>
                interruptedProcess.exitCode !== null ||
                interruptedProcess.signalCode !== null,
        )
        .toBe(true);
    await launch();
    expect((await storageState()).recoveryRequired).toBe(false);
    expect((await fs.lstat(officialRoot)).isDirectory()).toBe(true);
    expect(
        await fs.readFile(
            path.join(
                activeTemplates(projects[0]),
                '4.4.stable',
                'linux_release.x86_64',
            ),
            'utf8',
        ),
    ).toBe('official fixture contents');
    expect(await fs.stat(destination).catch(() => null)).toBeNull();
});

for (const existingDestination of [false, true]) {
    test(`keeps the move modal active and cancels without changing the source (existing destination: ${existingDestination})`, async () => {
        const destination = path.join(fixtureHome, 'cancelled-official');
        if (existingDestination) await fs.mkdir(destination, { mode: 0o700 });
        const originalDestination = await fs.stat(destination).catch(() => null);
        const contents = Buffer.alloc(3 * 1024 * 1024, 42);
        const source = path.join(
            officialRoot,
            '4.4.stable',
            'linux_release.x86_64',
        );
        await fs.writeFile(source, contents);
        await app.evaluate((_, directory) => {
            const fixtureFs = process.getBuiltinModule('node:fs');
            const open = fixtureFs.promises.open;
            const state = globalThis as typeof globalThis & {
                storageCopyPaused?: boolean;
                releaseStorageCopy?: () => void;
            };
            fixtureFs.promises.open = async (filename, flags, mode) => {
                const handle = await open(filename, flags, mode);
                if (String(filename).startsWith(directory) && flags === 'wx') {
                    const write = handle.write;
                    let writes = 0;
                    handle.write = (async (...args: unknown[]) => {
                        if (++writes === 2) {
                            state.storageCopyPaused = true;
                            await new Promise<void>((resolve) => {
                                state.releaseStorageCopy = resolve;
                            });
                        }
                        return Reflect.apply(write, handle, args);
                    }) as typeof handle.write;
                }
                return handle;
            };
        }, destination);
        await chooseStorageDestination(destination);
        await page.getByTestId('templateStorageMove-official').click();
        const dialog = page.getByTestId('templateStorageMoveDialog');
        await expect(dialog).toBeVisible();
        await dialog
            .getByRole('button', { name: 'Move templates', exact: true })
            .click();
        await expect
            .poll(() =>
                app.evaluate(
                    () =>
                        (
                            globalThis as typeof globalThis & {
                                storageCopyPaused?: boolean;
                            }
                        ).storageCopyPaused,
                ),
            )
            .toBe(true);
        await expect(dialog).toContainText('Moving');
        await page.screenshot({
            path: test.info().outputPath('template-storage-moving.png'),
            animations: 'disabled',
        });
        const locationBeforeBlockedNavigation = page.url();
        await expect(
            page.getByTestId('btnProjects').click({ trial: true, timeout: 500 }),
        ).rejects.toThrow();
        expect(page.url()).toBe(locationBeforeBlockedNavigation);
        await page.keyboard.press('Escape');
        await expect(dialog).toBeVisible();
        const unloadPrevented = await page.evaluate(() => {
            const event = new Event('beforeunload', { cancelable: true });
            window.dispatchEvent(event);
            return event.defaultPrevented;
        });
        expect(unloadPrevented).toBe(true);
        await page.evaluate(() => {
            window.location.hash = '#/projects';
        });
        await expect.poll(() => page.url()).toContain('#/projects');
        await expect(dialog).toBeVisible();
        expect((await storageState()).job?.completedBytes).toBeGreaterThan(0);
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        await app.evaluate(() =>
            (
                globalThis as typeof globalThis & {
                    releaseStorageCopy?: () => void;
                }
            ).releaseStorageCopy?.(),
        );
        await expect
            .poll(async () => (await storageState()).job?.stage)
            .toBe('cancelled');
        await expect(dialog).toContainText('The move was cancelled');
        await dialog.getByRole('button', { name: 'Done', exact: true }).click();
        expect((await storageState()).recoveryRequired).toBe(false);
        expect(await fs.readFile(source)).toEqual(contents);
        expect((await fs.lstat(officialRoot)).isSymbolicLink()).toBe(false);
        if (originalDestination) {
            expect(await fs.readdir(destination)).toEqual([]);
            expect(await fs.stat(destination)).toMatchObject({
                ino: originalDestination.ino,
                mode: originalDestination.mode,
                uid: originalDestination.uid,
                gid: originalDestination.gid,
                birthtimeMs: originalDestination.birthtimeMs,
            });
        } else {
            expect(await fs.stat(destination).catch(() => null)).toBeNull();
        }
    });
}

test('preserves a chosen destination folder after a copy failure', async () => {
    const destination = path.join(fixtureHome, 'failed-copy');
    await fs.mkdir(destination, { mode: 0o700 });
    const originalDestination = await fs.stat(destination);
    await app.evaluate(({}, directory) => {
        const fixtureFs = process.getBuiltinModule('node:fs');
        const open = fixtureFs.promises.open;
        fixtureFs.promises.open = async (filename, flags, mode) => {
            const handle = await open(filename, flags, mode);
            if (String(filename).startsWith(directory) && flags === 'wx') {
                fixtureFs.promises.open = open;
                handle.write = async () => { throw new Error('fixture copy failure'); };
            }
            return handle;
        };
    }, path.join(destination, 'user-notes.txt'));
    await chooseStorageDestination(destination);
    await page.getByTestId('templateStorageMove-official').click();
    const dialog = page.getByTestId('templateStorageMoveDialog');
    await dialog.getByRole('button', { name: 'Move templates', exact: true }).click();
    await expect.poll(async () => (await storageState()).job?.stage).toBe('error');
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect((await storageState()).recoveryRequired).toBe(false);
    expect(await fs.readdir(destination)).toEqual([]);
    expect(await fs.stat(destination)).toMatchObject({
        ino: originalDestination.ino,
        mode: originalDestination.mode,
        uid: originalDestination.uid,
        gid: originalDestination.gid,
        birthtimeMs: originalDestination.birthtimeMs,
    });
    expect((await fs.lstat(officialRoot)).isSymbolicLink()).toBe(false);
    expect(await fs.readFile(path.join(officialRoot, 'user-notes.txt'), 'utf8')).toBe('keep me');
    expect(await fs.readFile(path.join(officialRoot, '4.4.stable', 'linux_release.x86_64'), 'utf8')).toBe('official fixture contents');
});

/** Prepares an existing imported library whose saved default uses a linked parent. */
async function useLinkedImportedDefault(): Promise<string> {
    await app.close();
    const parent = path.join(fixtureHome, 'Godot');
    const physicalParent = path.join(fixtureHome, 'physical-godot');
    await fs.mkdir(parent, { recursive: true });
    await fs.rename(parent, physicalParent);
    await fs.symlink(
        physicalParent,
        parent,
        process.platform === 'win32' ? 'junction' : 'dir',
    );
    const source = path.join(physicalParent, 'ExportTemplates');
    const savedSource = path.join(parent, 'ExportTemplates');
    await fs.rename(importedRoot, source);
    await fs.symlink(
        savedSource,
        importedRoot,
        process.platform === 'win32' ? 'junction' : 'dir',
    );
    await fs.writeFile(
        path.join(fixtureHome, '.gd-launcher', 'template-storage.json'),
        JSON.stringify({ imported: savedSource }),
    );
    const active = activeTemplates(projects[1]);
    await fs.rm(active, { recursive: true, force: true });
    await fs.mkdir(active);
    await fs.symlink(
        path.join(source, 'imported', build.setId, build.directoryName),
        path.join(active, build.setId),
        process.platform === 'win32' ? 'junction' : 'dir',
    );
    await launch();
    return source;
}

for (const outcome of ['complete', 'cancel', 'restart'] as const) {
    test(`linked-parent imported storage handles ${outcome} without blocking recovery`, async () => {
        const source = await useLinkedImportedDefault();
        const destination = path.join(fixtureHome, 'moved-imported');
        if (outcome === 'complete') {
            await moveStorage('imported', destination);
            expect(await fs.stat(source).catch(() => null)).toBeNull();
            await app.close();
            await launch();
            expect(await fs.realpath(importedRoot)).toBe(
                await fs.realpath(destination),
            );
        } else {
            await app.evaluate(({}, directory) => {
                const fixtureFs = process.getBuiltinModule('node:fs');
                const open = fixtureFs.promises.open;
                const state = globalThis as typeof globalThis & {
                    storageAliasCopyPaused?: boolean;
                    releaseStorageAliasCopy?: () => void;
                };
                fixtureFs.promises.open = async (filename, flags, mode) => {
                    const handle = await open(filename, flags, mode);
                    if (
                        String(filename).startsWith(directory) &&
                        flags === 'wx'
                    ) {
                        const write = handle.write;
                        handle.write = (async (...args: unknown[]) => {
                            state.storageAliasCopyPaused = true;
                            await new Promise<void>((resolve) => {
                                state.releaseStorageAliasCopy = resolve;
                            });
                            return Reflect.apply(write, handle, args);
                        }) as typeof handle.write;
                    }
                    return handle;
                };
            }, destination);
            await chooseStorageDestination(destination);
            await page.getByTestId('templateStorageMove-imported').click();
            const dialog = page.getByTestId('templateStorageMoveDialog');
            await dialog
                .getByRole('button', { name: 'Move templates', exact: true })
                .click();
            await expect
                .poll(() =>
                    app.evaluate(
                        () =>
                            (
                                globalThis as typeof globalThis & {
                                    storageAliasCopyPaused?: boolean;
                                }
                            ).storageAliasCopyPaused,
                    ),
                )
                .toBe(true);
            if (outcome === 'cancel') {
                await dialog
                    .getByRole('button', { name: 'Cancel', exact: true })
                    .click();
                await app.evaluate(() =>
                    (
                        globalThis as typeof globalThis & {
                            releaseStorageAliasCopy?: () => void;
                        }
                    ).releaseStorageAliasCopy?.(),
                );
                await expect
                    .poll(async () => (await storageState()).job?.stage)
                    .toBe('cancelled');
                expect((await storageState()).recoveryRequired).toBe(false);
                await expect(dialog).toContainText('The move was cancelled');
                await dialog
                    .getByRole('button', { name: 'Done', exact: true })
                    .click();
                await expect(dialog).toBeHidden();
                await app.close();
            } else {
                const interruptedProcess = app.process();
                interruptedProcess.kill('SIGKILL');
                await expect
                    .poll(
                        () =>
                            interruptedProcess.exitCode !== null ||
                            interruptedProcess.signalCode !== null,
                    )
                    .toBe(true);
            }
            await launch();
            expect(await fs.realpath(importedRoot)).toBe(source);
            expect(await fs.stat(destination).catch(() => null)).toBeNull();
        }
        expect((await storageState()).recoveryRequired).toBe(false);
        expect(
            await fs
                .stat(
                    path.join(
                        fixtureHome,
                        '.gd-launcher',
                        'template-storage-move.json',
                    ),
                )
                .catch(() => null),
        ).toBeNull();
        expect(
            await fs.readFile(
                path.join(
                    activeTemplates(projects[1]),
                    build.setId,
                    'linux_release.x86_64',
                ),
                'utf8',
            ),
        ).toBe('imported fixture contents');
    });
}
