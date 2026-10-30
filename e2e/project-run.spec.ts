import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProjectDetails, RunProjectResult } from '@shared/contracts';
import { getMainWindow } from './splashscreen/getMainWindow';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { applyTheme, createFixtureHome, prepareAppWithStubbedData, setAppLanguage } from './support/e2e-fixture-runtime';
import { _electron, type ElectronApplication, type Page, expect, test } from './support/electron.fixture';

let application: ElectronApplication;
let applicationOpen = false;
let page: Page;
let home: string;
let project: ProjectDetails;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    home = await createFixtureHome();
    const projectPath = path.join(home, "artist's demo with spaces $HOME;");
    await fs.mkdir(projectPath);
    let executable = process.execPath;
    let launchPath = executable;
    if (process.platform !== 'win32') {
        launchPath = process.platform === 'darwin' ? path.join(home, 'Custom Godot.app') : path.join(home, 'fixture-godot');
        executable = process.platform === 'darwin' ? path.join(launchPath, 'Contents', 'MacOS', 'Custom Godot') : launchPath;
        await fs.mkdir(path.dirname(executable), { recursive: true });
        await fs.writeFile(executable, '#!/bin/sh\nprintf "%s\\n" "$@" > launched-arguments.txt\nexit 0\n', { mode: 0o700 });
        if (process.platform === 'darwin') {
            await fs.writeFile(path.join(launchPath, 'Contents', 'Info.plist'), '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Custom Godot</string></dict></plist>');
        }
    }
    project = {
        ...SAMPLE_PROJECTS[0],
        name: 'Run Example',
        path: projectPath,
        launch_path: launchPath,
        release: { ...SAMPLE_PROJECTS[0].release, editor_path: executable, valid: true },
        valid: true,
    };
    await fs.writeFile(path.join(projectPath, 'project.godot'), '[application]\nconfig/name="Run Example"\n');
    await fs.writeFile(path.join(home, '.gd-launcher', 'projects.json'), JSON.stringify([project]));
    await launchFixtureApp();
});

/** Starts the Electron fixture with the real project controller and preload. */
async function launchFixtureApp() {
    const environment = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    delete environment.ELECTRON_RUN_AS_NODE;
    application = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`],
        env: { ...environment, GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: home },
    });
    applicationOpen = true;
    page = await getMainWindow(application);
    await setAppLanguage(page, 'English');
    await prepareAppWithStubbedData(page, application, { projects: [project], installedReleases: [project.release] });
    await page.getByTestId('btnProjects').click();
}

test.afterAll(async () => {
    if (applicationOpen) await closeFixtureApp();
    if (home) await fs.rm(home, { recursive: true, force: true });
});

/** Closes Electron while allowing the detached fixture runtime to continue. */
async function closeFixtureApp() {
    await application.close();
    applicationOpen = false;
}

/** Opens the existing menu for the sole fixture project. */
async function openMenu() {
    await page.getByTestId('btnProjectMoreOptions').click();
    return page.getByRole('dialog', { name: project.name, exact: true });
}

test('keeps Run in the menu with a visible disabled reason in every view', async ({}, testInfo) => {
    for (const theme of ['light', 'dark'] as const) {
        await applyTheme(page, { name: theme, description: theme, colorScheme: theme, toggleTestId: theme === 'dark' ? 'themeDark' : 'themeLight' });
        for (const view of ['tabProjectCards', 'tabProjectList', 'tabProjectDenseList']) {
            await page.getByTestId(view).click();
            const menu = await openMenu();
            await expect(menu.getByRole('button', { name: /^Run project/ })).toBeDisabled();
            await expect(menu.getByText('Set a main scene in Godot to run this project.')).toBeVisible();
            await expect(menu.getByRole('button', { name: 'Run project', exact: true })).toHaveAccessibleDescription('Set a main scene in Godot to run this project.');
            await expect(page.getByRole('button', { name: 'Run project', exact: true })).toHaveCount(1);
            await expect(page.getByTestId('btnEditProjectInGodot')).toHaveCount(view === 'tabProjectCards' ? 1 : 0);
            if (view === 'tabProjectCards') await expect(page.getByTestId('btnEditProjectInGodot')).toBeEnabled();
            await page.screenshot({ path: testInfo.outputPath(`${view}-${theme}-missing-main.png`) });
            await page.keyboard.press('Escape');
        }
    }
    await fs.writeFile(path.join(project.path, 'main.tscn'), '[gd_scene format=3]\n[node name="Main" type="Node"]\n');
    await fs.writeFile(path.join(project.path, 'project.godot'), '[application]\nrun/main_scene="res://main.tscn"\n');
    const menu = await openMenu();
    await expect(menu.getByRole('button', { name: 'Run project', exact: true })).toBeEnabled();
    await expect(menu.getByRole('button').first()).toHaveText('Run project');
    await page.keyboard.press('Escape');
});

test('dispatches the assigned native executable without editor arguments or history writes', async () => {
    test.skip(process.platform === 'win32', 'The native fixture is a POSIX executable; Windows dispatch is covered by unit tests.');
    const before = await fs.readFile(path.join(home, '.gd-launcher', 'projects.json'), 'utf8');
    const menu = await openMenu();
    await menu.getByRole('button', { name: 'Run project', exact: true }).click();
    await expect(menu).not.toBeVisible();
    await expect.poll(() => fs.readFile(path.join(project.path, 'launched-arguments.txt'), 'utf8').catch(() => '')).toBe(`--path\n${project.path}\n`);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await fs.readFile(path.join(home, '.gd-launcher', 'projects.json'), 'utf8')).toBe(before);
});

test('shows failures after startup even when another view is open', async () => {
    test.skip(process.platform === 'win32', 'The delayed native fixture is a POSIX executable.');
    const executable = project.release.editor_path;
    const original = await fs.readFile(executable, 'utf8');
    try {
        await fs.writeFile(executable, '#!/bin/sh\nsleep 2\nexit 7\n', { mode: 0o700 });
        await (await openMenu()).getByRole('button', { name: 'Run project', exact: true }).click();
        await page.getByTestId('btnInstalls').click();
        const failure = page.getByRole('dialog', { name: 'Project stopped unexpectedly', exact: true });
        await expect(failure.getByText('Godot stopped this project unexpectedly. Open it in Godot to check for errors.')).toBeVisible({ timeout: 10000 });
        await expect(failure.getByRole('button', { name: 'Edit in Godot', exact: true })).toBeEnabled();
        await failure.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.getByTestId('btnProjects').click();
    } finally {
        await fs.writeFile(executable, original, { mode: 0o700 });
    }
});

test('shows one diagnostic warning and replaces it when the running project fails', async () => {
    test.skip(process.platform === 'win32', 'The native fixture is a POSIX executable.');
    const executable = project.release.editor_path;
    const original = await fs.readFile(executable, 'utf8');
    const stopFile = path.join(project.path, 'stop-runtime.txt');
    try {
        await fs.writeFile(executable, `#!/bin/sh
sleep 1
printf "ERROR: Recovered graphics error.\\n" >&2
printf "SCRIPT ERROR: Another diagnostic.\\n" >&2
attempt=0
while [ ! -f stop-runtime.txt ] && [ "$attempt" -lt 100 ]; do
    sleep 0.1
    attempt=$((attempt + 1))
done
exit 7
`, { mode: 0o700 });
        await (await openMenu()).getByRole('button', { name: 'Run project', exact: true }).click();
        await page.getByTestId('btnInstalls').click();
        const warning = page.getByRole('dialog', { name: 'Godot reported an error', exact: true });
        await expect(warning.getByText('ERROR: Recovered graphics error.')).toBeVisible();
        await expect(page.getByRole('dialog')).toHaveCount(1);
        await fs.writeFile(stopFile, 'stop');
        const failure = page.getByRole('dialog', { name: 'Project stopped unexpectedly', exact: true });
        await expect(failure).toBeVisible();
        await expect(warning).not.toBeVisible();
        await failure.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.getByTestId('btnProjects').click();
    } finally {
        await fs.writeFile(stopFile, 'stop');
        await fs.writeFile(executable, original, { mode: 0o700 });
        await fs.rm(stopFile, { force: true });
    }
});

test('shows Godot error output even with exit code zero and offers Edit recovery', async ({}, testInfo) => {
    test.skip(process.platform === 'win32', 'The error-output fixture is a POSIX executable.');
    const executable = project.release.editor_path;
    const original = await fs.readFile(executable, 'utf8');
    await fs.writeFile(path.join(project.path, 'project.godot'), '[application]\nrun/main_scene="uid://b"\n');
    await application.evaluate(({ ipcMain }) => {
        const state = globalThis as typeof globalThis & { runRecoveryEdits?: string[] };
        state.runRecoveryEdits = [];
        ipcMain.removeHandler('projects.launchProject');
        ipcMain.handle('projects.launchProject', (_event, selected: ProjectDetails) => {
            state.runRecoveryEdits?.push(selected.path);
            return { success: true, data: { launched: true } };
        });
    });
    try {
        await fs.writeFile(executable, '#!/bin/sh\nprintf "ERROR: Resource imports are missing. Open the project in Godot.\\n" >&2\nexit 0\n', { mode: 0o700 });
        const menu = await openMenu();
        await expect(menu.getByRole('button', { name: 'Run project', exact: true })).toBeEnabled();
        await menu.getByRole('button', { name: 'Run project', exact: true }).click();
        const failure = page.getByRole('dialog', { name: 'Godot reported an error', exact: true });
        await expect(failure.getByText('The project may still be running. Godot can recover from some errors automatically. Open the project in Godot to check it.')).toBeVisible();
        await expect(failure.getByText('ERROR: Resource imports are missing. Open the project in Godot.')).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath('godot-error-output.png') });
        await failure.getByRole('button', { name: 'Edit in Godot', exact: true }).click();
        await expect(failure).not.toBeVisible();
        await expect.poll(() => application.evaluate(() => (globalThis as typeof globalThis & { runRecoveryEdits?: string[] }).runRecoveryEdits)).toEqual([project.path]);
    } finally {
        await fs.writeFile(executable, original, { mode: 0o700 });
    }
    await fs.writeFile(path.join(project.path, 'project.godot'), '[application]\nrun/main_scene="res://main.tscn"\n');
    await stubRunResult({ launched: false, reason: 'launch_failed' });

    await (await openMenu()).getByRole('button', { name: 'Run project', exact: true }).click();
    const failure = page.getByRole('dialog', { name: 'Could not run "Run Example"', exact: true });
    await expect(failure.getByText('Godot could not start this project. Open it in Godot to check for errors.')).toBeVisible();
    await failure.getByRole('button', { name: 'Edit in Godot', exact: true }).click();
    await expect(failure).not.toBeVisible();
    await expect.poll(() => application.evaluate(() => (globalThis as typeof globalThis & { runRecoveryEdits?: string[] }).runRecoveryEdits)).toEqual([project.path, project.path]);
});

test('disables another start while the first request is pending and refreshes on focus', async () => {
    await stubRunResult({ launched: true }, 4000);
    await (await openMenu()).getByRole('button', { name: 'Run project', exact: true }).click();
    const reopened = await openMenu();
    await expect(reopened.getByRole('button', { name: /^Run project/ })).toBeDisabled();
    await expect(reopened.getByText('Starting project...')).toBeVisible();
    await expect(reopened.getByRole('button', { name: 'Run project', exact: true })).toBeEnabled({ timeout: 10000 });
    await fs.writeFile(path.join(project.path, 'project.godot'), '[application]\n');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(reopened.getByText('Set a main scene in Godot to run this project.')).toBeVisible();
    await expect(reopened.getByRole('button', { name: /^Run project/ })).toBeDisabled();
    await page.keyboard.press('Escape');
});

/** Injects a deterministic native run result through the actual preload bridge.
 * @param result - Result to return from the main process.
 * @param delay - Optional startup delay for repeated-click coverage.
 */
async function stubRunResult(result: RunProjectResult, delay = 0) {
    await application.evaluate(({ ipcMain }, injected) => {
        ipcMain.removeHandler('projects.runProject');
        ipcMain.handle('projects.runProject', async () => {
            if (injected.delay) await new Promise(resolve => setTimeout(resolve, injected.delay));
            return { success: true, data: injected.result };
        });
    }, { result, delay });
}

test('keeps Run available for uncertain overrides and unprepared C# projects', async () => {
    for (const settings of [
        'run/main_scene="res://missing.tscn"\nconfig/features=PackedStringArray("4.6", "C#")',
        'run/main_scene=""\nrun/main_scene.android="res://main.tscn"',
        'config/project_settings_override="res://unknown.cfg"',
        '[application/run]\nmain_scene="res://main.tscn"',
        '[application/config]\nproject_settings_override="res://unknown.cfg"',
        '"config/project_settings_override"="res://unknown.cfg"',
    ]) {
        await fs.writeFile(path.join(project.path, 'project.godot'), `[application]\n${settings}\n`);
        const menu = await openMenu();
        await expect(menu.getByRole('button', { name: 'Run project', exact: true })).toBeEnabled();
        await page.keyboard.press('Escape');
    }
});

test('preserves the missing-code-editor warning opened by Edit recovery', async () => {
    await fs.writeFile(path.join(project.path, 'project.godot'), '[application]\nrun/main_scene="res://main.tscn"\n');
    await stubRunResult({ launched: false, reason: 'launch_failed' });
    await application.evaluate(({ ipcMain }) => {
        const state = globalThis as typeof globalThis & { modalRecoveryLaunches?: boolean[] };
        state.modalRecoveryLaunches = [];
        ipcMain.removeHandler('projects.launchProject');
        ipcMain.handle('projects.launchProject', (_event, _project: ProjectDetails, options?: { allowMissingCodeEditor?: boolean }) => {
            state.modalRecoveryLaunches?.push(options?.allowMissingCodeEditor === true);
            return { success: true, data: options?.allowMissingCodeEditor
                ? { launched: true }
                : { launched: false, reason: 'code_editor_unavailable', integration: { displayName: 'Visual Studio Code' } } };
        });
    });
    await (await openMenu()).getByRole('button', { name: 'Run project', exact: true }).click();
    const recovery = page.getByRole('dialog', { name: 'Could not run "Run Example"', exact: true });
    await recovery.getByRole('button', { name: 'Edit in Godot', exact: true }).click();
    const warning = page.getByRole('dialog', { name: 'Visual Studio Code was not found', exact: true });
    await expect(warning).toBeVisible();
    await warning.getByRole('button', { name: 'Launch anyway', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await application.evaluate(() => (globalThis as typeof globalThis & { modalRecoveryLaunches?: boolean[] }).modalRecoveryLaunches)).toEqual([false, true]);
});

test('lets a running project write output and finish after Godot Launcher quits', async () => {
    test.skip(process.platform === 'win32', 'The native fixture checks POSIX broken-pipe handling.');
    await closeFixtureApp();
    await fs.writeFile(path.join(project.path, 'project.godot'), '[application]\nrun/main_scene="res://main.tscn"\n');
    await fs.writeFile(project.release.editor_path, `#!/bin/sh
printf ready > runtime-ready.txt
attempt=0
while [ ! -f launcher-closed.txt ] && [ "$attempt" -lt 100 ]; do
    sleep 0.1
    attempt=$((attempt + 1))
done
[ -f launcher-closed.txt ] || exit 1
printf "Output after launcher exit\\n"
printf survived > runtime-survived.txt
`, { mode: 0o700 });
    await launchFixtureApp();
    await (await openMenu()).getByRole('button', { name: 'Run project', exact: true }).click();
    await expect.poll(() => fs.readFile(path.join(project.path, 'runtime-ready.txt'), 'utf8').catch(() => '')).toBe('ready');
    const nativeExit = new Promise<void>((resolve) => {
        application.process().once('exit', () => resolve());
    });
    const closing = closeFixtureApp();
    // Playwright teardown can wait for inherited pipes after Electron exits.
    await nativeExit;
    await fs.writeFile(path.join(project.path, 'launcher-closed.txt'), 'closed');
    await closing;
    await expect.poll(() => fs.readFile(path.join(project.path, 'runtime-survived.txt'), 'utf8').catch(() => ''), { timeout: 10000 }).toContain('survived');
});
