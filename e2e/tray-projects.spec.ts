import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, test } from './support/electron.fixture';
import { getMainWindow } from './splashscreen/getMainWindow';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { createFixtureHome, setAppLanguage } from './support/e2e-fixture-runtime';

test('updates native tray sections after pinning and reordering through the Electron bridge', async () => {
    test.setTimeout(60000);
    const fixtureHome = await createFixtureHome();
    const projects = Array.from({ length: 7 }, (_, index) => ({
        ...SAMPLE_PROJECTS[0],
        name: `Tray Project ${index}`,
        path: path.join(fixtureHome, `project-${index}`),
        pinned: index < 4,
        pinned_order: index < 4 ? index : undefined,
        last_opened: new Date(1_000_000 - index * 1000),
        valid: true,
    }));
    await fs.writeFile(
        path.join(fixtureHome, '.gd-launcher', 'projects.json'),
        JSON.stringify(projects),
    );
    const env = Object.fromEntries(
        Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`],
        env: { ...env, GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: fixtureHome },
    });
    try {
        const page = await getMainWindow(app);
        await setAppLanguage(page, 'English');
        await expect(page.getByTestId('projectsTitle')).toBeVisible();
        expect(await readTrayMenu(app)).toEqual([
            'Pinned Projects', 'Tray Project 0', 'Tray Project 1', 'Tray Project 2',
            ['More...', 'Tray Project 3'],
            'Recent Projects', 'Tray Project 3', 'Tray Project 4', 'Tray Project 5',
            'Show Godot Launcher', 'Quit',
        ]);

        const firstPin = page.locator('[data-project-path]').filter({
            has: page.getByText('Tray Project 0', { exact: true }),
        });
        await firstPin.getByTestId('btnToggleProjectPinned').click();
        await expect.poll(() => readTrayMenu(app)).toEqual([
            'Pinned Projects', 'Tray Project 1', 'Tray Project 2', 'Tray Project 3',
            'Recent Projects', 'Tray Project 0', 'Tray Project 4', 'Tray Project 5',
            'Show Godot Launcher', 'Quit',
        ]);

        const firstHandle = page.getByTestId('btnReorderPinnedProject').first();
        await firstHandle.focus();
        await page.keyboard.press('Space');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Space');
        await expect.poll(() => readTrayMenu(app)).toEqual([
            'Pinned Projects', 'Tray Project 2', 'Tray Project 1', 'Tray Project 3',
            'Recent Projects', 'Tray Project 0', 'Tray Project 4', 'Tray Project 5',
            'Show Godot Launcher', 'Quit',
        ]);
        const stored = JSON.parse(await fs.readFile(path.join(fixtureHome, '.gd-launcher', 'projects.json'), 'utf8'));
        expect(stored.filter((project: { pinned: boolean }) => project.pinned)
            .sort((first: { pinned_order: number }, second: { pinned_order: number }) => first.pinned_order - second.pinned_order)
            .map((project: { name: string }) => project.name))
            .toEqual(['Tray Project 2', 'Tray Project 1', 'Tray Project 3']);
    } finally {
        await app.close();
        await fs.rm(fixtureHome, { recursive: true, force: true });
    }
});

/**
 * Reads native Electron menu items from the application's live project callback.
 * @param app - Running isolated Electron application.
 */
async function readTrayMenu(app: ElectronApplication) {
    return app.evaluate(async ({ BrowserWindow }, modulePath) => {
        const requireModule = process.getBuiltinModule('module').createRequire(modulePath);
        const { updateMenu } = requireModule(modulePath);
        const window = BrowserWindow.getAllWindows().find((candidate) =>
            candidate.webContents.getURL().startsWith('http://localhost:5123'),
        );
        const menu = await updateMenu(undefined, window);
        return menu.items.filter((item: Electron.MenuItem) => item.type !== 'separator')
            .map((item: Electron.MenuItem) => item.submenu
                ? [item.label, ...item.submenu.items.map((child) => child.label)]
                : item.label);
    }, path.resolve('dist-electron/helpers/tray.helper.js'));
}
