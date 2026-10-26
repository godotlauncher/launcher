import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Page,
    test,
} from './support/electron.fixture';
import { getMainWindow } from './splashscreen/getMainWindow';
import { createFixtureHome } from './support/e2e-fixture-runtime';

let app: ElectronApplication | undefined;
let page: Page;
let fixtureHome: string;
let prefsPath: string;
let launchEnvironment: Record<string, string>;

test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    const configDir = path.join(fixtureHome, '.gd-launcher');
    prefsPath = path.join(configDir, 'prefs.json');
    const stored = JSON.parse(await fs.readFile(prefsPath, 'utf8'));
    await fs.writeFile(prefsPath, JSON.stringify({
        ...stored, language: 'en', first_run: false,
        auto_start: false, auto_check_updates: false, auto_open_code_editor: false,
        retained_test_preference: 'preserved',
    }));
    await fs.writeFile(path.join(configDir, 'projects.json'), '[]');
    await fs.writeFile(path.join(configDir, 'installed-releases.json'), '[]');
    const env = Object.fromEntries(Object.entries(process.env).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
    ));
    delete env.ELECTRON_RUN_AS_NODE;
    launchEnvironment = {
        ...env,
        HOME: fixtureHome, USERPROFILE: fixtureHome,
        APPDATA: path.join(fixtureHome, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(fixtureHome, 'AppData', 'Local'),
        XDG_CONFIG_HOME: path.join(fixtureHome, '.config'),
        XDG_DATA_HOME: path.join(fixtureHome, '.local', 'share'),
        GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: fixtureHome,
    };
});

test.afterAll(async () => {
    await app?.close();
    if (fixtureHome) await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('saves preferences through the real bridge and retains them after restart', async () => {
    await openBehaviourSettings();
    const automaticEditor = page.getByTestId('chkAutoOpenCodeEditor');
    await expect(automaticEditor).not.toBeChecked();
    await automaticEditor.click();
    await expect(automaticEditor).toBeChecked();
    await expect.poll(async () => JSON.parse(await fs.readFile(prefsPath, 'utf8')).auto_open_code_editor).toBe(true);
    expect(JSON.parse(await fs.readFile(prefsPath, 'utf8')).retained_test_preference).toBe('preserved');

    await app!.close();
    app = undefined;
    await openBehaviourSettings();

    await expect(page.getByTestId('chkAutoOpenCodeEditor')).toBeChecked();
    const saved = JSON.parse(await fs.readFile(prefsPath, 'utf8'));
    expect(saved.retained_test_preference).toBe('preserved');
    expect(saved.prefs_version).toBe(4);
    expect((await fs.readdir(path.dirname(prefsPath))).filter((name) => name.startsWith('.prefs.json.') && name.endsWith('.tmp'))).toEqual([]);
});

/** Opens actual Settings handlers in an isolated Electron application. */
async function openBehaviourSettings(): Promise<void> {
    app = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`],
        env: launchEnvironment,
    });
    page = await getMainWindow(app);
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabBehavior').click();
    await expect(page.getByTestId('chkAutoOpenCodeEditor')).toBeVisible();
}
