import { test, _electron, type ElectronApplication } from '@playwright/test';
import releasesCache from './fixtures/releases.json' with { type: 'json' };
import prereleasesCache from './fixtures/prereleases.json' with { type: 'json' };
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

process.env.GODOT_LAUNCHER_DOCS_SCREENSHOTS = '1';

type ElectronPage = Awaited<
    ReturnType<ElectronApplication['firstWindow']>
>;

const SCREENSHOTS = [
    // Projects
    {
        file: 'screen_projects_view_dark.png',
        description: 'Projects view in dark mode',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnProjects').click();
            await page.waitForTimeout(600);
        },
    },
    {
        file: 'screen_projects_new_project_dark.png',
        description: 'New Project view in dark mode',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectCreate').click();
            await page.getByTestId('inputProjectName').fill('My-Next-Awesome-Game');
            await page.waitForTimeout(600);
        },
        cleanup: async (page: ElectronPage) => {
            await page.getByTestId('btnCloseCreateProject').click();
            await page.waitForTimeout(600);
        },
    },

    // Installs
    {
        file: 'screen_installs_view_dark.png',
        description: 'Installs view in dark mode',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            await page.waitForTimeout(600);
        },
    },
    {
        file: 'screen_installs_new_version_dark.png',
        description: 'Install New Version view in dark mode',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            await page.getByTestId('btnInstallEditor').click();
            await page.waitForTimeout(600);
        },
        cleanup: async (page: ElectronPage) => {
            await page.getByTestId('btnCloseInstallEditor').click();
            await page.waitForTimeout(600);
        },
    },

    // Settings
    {
        file: 'screen_settings_projects_dark.png',
        description: 'Settings (Projects tab) in dark mode',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabProjects').click();
            await page.waitForTimeout(600);
        },
    },
    {
        file: 'screen_settings_installs_dark.png',
        description: 'Settings (Installs tab) in dark mode',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabInstalls').click();
            await page.waitForTimeout(600);
        },
    },
    {
        file: 'screen_settings_appearance_dark.png',
        description: 'Settings (Appearance tab) in dark mode',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabAppearance').click();
            await page.waitForTimeout(600);
        },
    },
    {
        file: 'screen_settings_behavior_dark.png',
        description: 'Settings (Behavior tab) in dark mode',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabBehavior').click();
            await page.setViewportSize({ width: 1024, height: 800 });
            await page.waitForTimeout(600);
        },
        cleanup: async (page: ElectronPage) => {
            await page.setViewportSize({ width: 1024, height: 600 });
        },
    },
    {
        file: 'screen_settings_tools_dark.png',
        description: 'Settings (Tools tab) in dark mode',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabTools').click();
            await page.setViewportSize({ width: 1024, height: 800 });
            await page.waitForTimeout(600);
        },
        cleanup: async (page: ElectronPage) => {
            await page.setViewportSize({ width: 1024, height: 600 });
        },
    },
    {
        file: 'screen_settings_updates_dark.png',
        description: 'Settings (Updates tab) in dark mode',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabUpdates').click();
            await page.waitForTimeout(600);
        },
    },

    // Help
    {
        file: 'screen_help_view_dark.png',
        description: 'Help view in dark mode',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnHelp').click();
            await page.waitForTimeout(600);
        },
    },
];

const SAMPLE_INSTALLED_RELEASES = [
    {
        version: '4.5.1-stable',
        version_number: 4.51,
        install_path: '/Applications/Godot_4.5.1',
        editor_path:
            '/Applications/Godot_4.5.1/Godot.app/Contents/MacOS/Godot',
        platform: 'darwin',
        arch: 'universal',
        mono: false,
        prerelease: false,
        config_version: 5,
        published_at: '2025-01-10T10:00:00.000Z',
        valid: true,
    },
    {
        version: '4.5.1-mono',
        version_number: 4.511,
        install_path: '/Applications/Godot_4.5.1_mono',
        editor_path:
            '/Applications/Godot_4.5.1_mono/Godot_mono.app/Contents/MacOS/Godot',
        platform: 'darwin',
        arch: 'x64',
        mono: true,
        prerelease: false,
        config_version: 5,
        published_at: '2025-01-10T10:00:00.000Z',
        valid: true,
    },
    {
        version: '4.4-stable',
        version_number: 4.4,
        install_path: '/Applications/Godot_4.4-stable',
        editor_path:
            '/Applications/Godot_4.4-stable/Godot.app/Contents/MacOS/Godot',
        platform: 'darwin',
        arch: 'universal',
        mono: false,
        prerelease: false,
        config_version: 5,
        published_at: '2024-08-15T09:00:00.000Z',
        valid: true,
    },
];

const SAMPLE_PROJECTS = [
    {
        name: 'My-Awesome-Game',
        path: '/Users/docs/Godot/Projects/my-awesome-game',
        version: '4.5.1-stable',
        version_number: 4.51,
        renderer: 'FORWARD_PLUS',
        editor_settings_path:
            '/Users/docs/Godot/Projects/my-awesome-game/.godot',
        editor_settings_file:
            '/Users/docs/Godot/Projects/my-awesome-game/.godot/editor_settings-4.5.tres',
        last_opened: '2025-02-18T11:00:00.000Z',
        open_windowed: false,
        release: SAMPLE_INSTALLED_RELEASES[0],
        launch_path:
            '/Applications/Godot_4.5.1/Godot.app/Contents/MacOS/Godot',
        config_version: 5,
        withVSCode: true,
        withGit: true,
        valid: true,
    },
];

const SAMPLE_RELEASES_CACHE = releasesCache;

const SAMPLE_PRERELEASE_CACHE = prereleasesCache;

const SAMPLE_PREFS = {
    prefs_version: 3,
    install_location: '/Users/docs/Godot/Editors',
    config_location: '/Users/docs/.gd-launcher',
    projects_location: '/Users/docs/Godot/Projects',
    post_launch_action: 'close_to_tray',
    auto_check_updates: true,
    receive_beta_updates: false,
    auto_start: true,
    start_in_tray: true,
    confirm_project_remove: true,
    first_run: false,
    windows_enable_symlinks: true,
    windows_symlink_win_notify: true,
    vs_code_path: '/Applications/Visual Studio Code.app',
    language: 'system',
};

async function writeJson(file: string, data: unknown) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

async function seedLauncherData(homeDir: string) {
    const configDir = path.join(homeDir, '.gd-launcher');
    await fs.mkdir(configDir, { recursive: true });
    await writeJson(path.join(configDir, 'projects.json'), SAMPLE_PROJECTS);
    await writeJson(
        path.join(configDir, 'installed-releases.json'),
        SAMPLE_INSTALLED_RELEASES,
    );
    await writeJson(path.join(configDir, 'releases.json'), SAMPLE_RELEASES_CACHE);
    await writeJson(
        path.join(configDir, 'prereleases.json'),
        SAMPLE_PRERELEASE_CACHE,
    );
    await writeJson(path.join(configDir, 'prefs.json'), SAMPLE_PREFS);
}

async function createFixtureHome() {
    const tempHome = await fs.mkdtemp(
        path.join(os.tmpdir(), 'gd-launcher-docs-'),
    );
    await seedLauncherData(tempHome);
    return tempHome;
}

async function waitForPreloadScript(appWindow: ElectronPage) {
    await appWindow.waitForFunction(
        () => Boolean((window as Window & { electron?: unknown }).electron),
        null,
        { timeout: 10000 },
    );
}

async function captureScreenshot(
    page: ElectronPage,
    testInfo: any,
    fileName: string,
    description: string,
) {
    const outputPath = path.resolve('docs/images', fileName);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    await page.screenshot({
        path: outputPath,
        fullPage: true,
    });

    await testInfo.attach(description, {
        path: outputPath,
        contentType: 'image/png',
    });
}

test('captures documentation screenshots for each main view', async ({}, testInfo) => {
    testInfo.setTimeout(180000);
    const fixtureHome = await createFixtureHome();
    const electronApp = await _electron.launch({
        args: ['.'],
        env: {
            ...process.env,
            NODE_ENV: 'development',
            HOME: fixtureHome,
            USERPROFILE: fixtureHome,
            APPDATA: path.join(fixtureHome, 'AppData', 'Roaming'),
            LOCALAPPDATA: path.join(fixtureHome, 'AppData', 'Local'),
            GODOT_LAUNCHER_DOCS_SCREENSHOTS: '1',
        },
    });

    try {
        const mainPage = await electronApp.firstWindow();
        await waitForPreloadScript(mainPage);
        await mainPage.setViewportSize({ width: 1024, height: 600 });
        await mainPage.emulateMedia({ colorScheme: 'dark' });

        await mainPage.getByTestId('btnSettings').click();
        await mainPage.getByTestId('tabAppearance').click();
        await mainPage.getByTestId('themeAuto').check();

        for (const shot of SCREENSHOTS) {
            await shot.navigate(mainPage);
            await captureScreenshot(mainPage, testInfo, shot.file, shot.description);
            if ('cleanup' in shot && shot.cleanup) {
                await shot.cleanup(mainPage);
            }
        }
    } finally {
        await electronApp.close();
        await fs.rm(fixtureHome, { recursive: true, force: true });
    }
});
