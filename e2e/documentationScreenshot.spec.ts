import { test, _electron, type ElectronApplication } from '@playwright/test';
import releasesCache from './fixtures/releases.json' with { type: 'json' };
import prereleasesCache from './fixtures/prereleases.json' with { type: 'json' };
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

process.env.GODOT_LAUNCHER_DOCS_SCREENSHOTS = '1';

type ElectronPage = Awaited<
    ReturnType<ElectronApplication['firstWindow']>
>;

type CachedTool = {
    name: string;
    path: string;
    version?: string;
    verified: boolean;
};

type ThemeConfig = {
    name: 'dark' | 'light';
    description: string;
    toggleTestId: 'themeDark' | 'themeLight' | 'themeAuto';
    colorScheme: 'dark' | 'light';
};

const THEMES: ThemeConfig[] = [
    {
        name: 'dark',
        description: 'dark mode',
        toggleTestId: 'themeDark',
        colorScheme: 'dark',
    },
    {
        name: 'light',
        description: 'light mode',
        toggleTestId: 'themeLight',
        colorScheme: 'light',
    },
];

type ScreenshotConfig = {
    fileBase: string;
    description: string;
    navigate: (page: ElectronPage, electronApp: ElectronApplication) => Promise<void>;
    cleanup?: (page: ElectronPage, electronApp: ElectronApplication) => Promise<void>;
};

const SCREENSHOTS: ScreenshotConfig[] = [
    // Projects
    {
        fileBase: 'screen_projects_view',
        description: 'Projects view',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnProjects').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_projects_new_project',
        description: 'New Project view',
        navigate: async (page: ElectronPage, electronApp: ElectronApplication) => {
            await stubInstalledTools(electronApp, DEFAULT_TOOLS);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectCreate').click();
            await page.getByTestId('inputProjectName').fill('My-Next-Awesome-Game');
            await page.waitForTimeout(600);
        },
        cleanup: async (page: ElectronPage, electronApp: ElectronApplication) => {
            await stubInstalledTools(electronApp, DEFAULT_TOOLS);
            await page.getByTestId('btnCloseCreateProject').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_projects_new_project_no_git',
        description: 'New Project view when Git is not installed',
        navigate: async (page: ElectronPage, electronApp: ElectronApplication) => {
            await stubInstalledTools(electronApp, TOOLS_NO_GIT);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectCreate').click();
            await page.getByTestId('inputProjectName').fill('My-Next-Awesome-Game');
            await page.waitForTimeout(600);
        },
        cleanup: async (page: ElectronPage, electronApp: ElectronApplication) => {
            await page.getByTestId('btnCloseCreateProject').click();
            await page.waitForTimeout(600);
            await stubInstalledTools(electronApp, DEFAULT_TOOLS);
        },
    },
    {
        fileBase: 'screen_projects_new_project_no_vscode',
        description: 'New Project view when VS Code is not installed',
        navigate: async (page: ElectronPage, electronApp: ElectronApplication) => {
            await stubInstalledTools(electronApp, TOOLS_NO_VSCODE);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectCreate').click();
            await page.getByTestId('inputProjectName').fill('My-Next-Awesome-Game');
            await page.waitForTimeout(600);
        },
        cleanup: async (page: ElectronPage, electronApp: ElectronApplication) => {
            await page.getByTestId('btnCloseCreateProject').click();
            await page.waitForTimeout(600);
            await stubInstalledTools(electronApp, DEFAULT_TOOLS);
        },
    },
    {
        fileBase: 'screen_projects_new_project_no_tools',
        description: 'New Project view when Git and VS Code are not installed',
        navigate: async (page: ElectronPage, electronApp: ElectronApplication) => {
            await stubInstalledTools(electronApp, TOOLS_NONE);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectCreate').click();
            await page.getByTestId('inputProjectName').fill('My-Next-Awesome-Game');
            await page.waitForTimeout(600);
        },
        cleanup: async (page: ElectronPage, electronApp: ElectronApplication) => {
            await page.getByTestId('btnCloseCreateProject').click();
            await page.waitForTimeout(600);
            await stubInstalledTools(electronApp, DEFAULT_TOOLS);
        },
    },
    {
        fileBase: 'screen_projects_new_project_overwrite_path',
        description: 'New Project view with overwrite path enabled',
        navigate: async (page: ElectronPage, electronApp: ElectronApplication) => {
            await stubInstalledTools(electronApp, DEFAULT_TOOLS);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectCreate').click();
            await page.getByTestId('inputProjectName').fill('My-Next-Awesome-Game');
            await page.getByTestId('checkboxOverwriteProjectPath').check();
            await page.waitForTimeout(600);
        },
        cleanup: async (page: ElectronPage, electronApp: ElectronApplication) => {
            await page.getByTestId('btnCloseCreateProject').click();
            await page.waitForTimeout(600);
            await stubInstalledTools(electronApp, DEFAULT_TOOLS);
        },
    },
    {
        fileBase: 'screen_projects_drop_overlay',
        description: 'Projects view drag-and-drop prompt',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnProjects').click();
            await page.waitForTimeout(600);
            await showProjectsDropOverlay(page);
            await page.waitForTimeout(400);
        },
        cleanup: async (page: ElectronPage) => {
            await hideProjectsDropOverlay(page);
            await page.waitForTimeout(200);
        },
    },

    // Installs
    {
        fileBase: 'screen_installs_view',
        description: 'Installs view',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_installs_new_version',
        description: 'Install New Version view',
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
        fileBase: 'screen_settings_projects',
        description: 'Settings (Projects tab)',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabProjects').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_settings_installs',
        description: 'Settings (Installs tab)',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabInstalls').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_settings_appearance',
        description: 'Settings (Appearance tab)',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabAppearance').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_settings_behavior',
        description: 'Settings (Behavior tab)',
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
        fileBase: 'screen_settings_tools',
        description: 'Settings (Tools tab)',
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
        fileBase: 'screen_settings_updates',
        description: 'Settings (Updates tab)',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnSettings').click();
            await page.getByTestId('tabUpdates').click();
            await page.waitForTimeout(600);
        },
    },

    // Help
    {
        fileBase: 'screen_help_view',
        description: 'Help view',
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

const DEFAULT_TOOLS: CachedTool[] = [
    { name: 'Git', path: '/usr/bin/git', version: '2.45.0', verified: true },
    {
        name: 'VSCode',
        path: '/Applications/Visual Studio Code.app',
        version: '1.95.0',
        verified: true,
    },
];

const TOOLS_NO_GIT: CachedTool[] = DEFAULT_TOOLS.filter(
    (tool) => tool.name !== 'Git',
);

const TOOLS_NO_VSCODE: CachedTool[] = DEFAULT_TOOLS.filter(
    (tool) => tool.name !== 'VSCode',
);

const TOOLS_NONE: CachedTool[] = [];

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

async function showProjectsDropOverlay(page: ElectronPage) {
    await page.evaluate(() => {
        const title = document.querySelector('[data-testid="projectsTitle"]');
        const container =
            title?.closest('div.flex.flex-col.h-full.w-full.overflow-auto.p-1') ??
            document.querySelector('div.flex.flex-col.h-full.w-full.overflow-auto.p-1');
        if (!container) return;

        const dataTransfer = new DataTransfer();
        const dragEnter = new DragEvent('dragenter', {
            dataTransfer,
            bubbles: true,
            cancelable: true,
        });
        container.dispatchEvent(dragEnter);
    });
}

async function hideProjectsDropOverlay(page: ElectronPage) {
    await page.evaluate(() => {
        const title = document.querySelector('[data-testid="projectsTitle"]');
        const container =
            title?.closest('div.flex.flex-col.h-full.w-full.overflow-auto.p-1') ??
            document.querySelector('div.flex.flex-col.h-full.w-full.overflow-auto.p-1');
        if (!container) return;

        const dataTransfer = new DataTransfer();
        const dragLeave = new DragEvent('dragleave', {
            dataTransfer,
            bubbles: true,
            cancelable: true,
        });
        container.dispatchEvent(dragLeave);
    });
}

async function applyTheme(page: ElectronPage, theme: ThemeConfig) {
    await page.emulateMedia({ colorScheme: theme.colorScheme });
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabAppearance').click();
    await page.getByTestId(theme.toggleTestId).check();
    await page.waitForTimeout(400);
    await page.getByTestId('btnProjects').click();
}

test('captures documentation screenshots for each main view', async ({}, testInfo) => {
    testInfo.setTimeout(240000);
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
        await stubInstalledTools(electronApp, DEFAULT_TOOLS);

        for (const theme of THEMES) {
            await applyTheme(mainPage, theme);

            for (const shot of SCREENSHOTS) {
                await shot.navigate(mainPage, electronApp);
                const themedFileName = `${shot.fileBase}_${theme.name}`;
                const themedDescription = `${shot.description} in ${theme.description}`;
                await captureScreenshot(
                    mainPage,
                    testInfo,
                    themedFileName,
                    themedDescription,
                );
                if (shot.cleanup) {
                    await shot.cleanup(mainPage, electronApp);
                }
            }
        }
    } finally {
        await electronApp.close();
        await fs.rm(fixtureHome, { recursive: true, force: true });
    }
});

async function captureScreenshot(
    page: ElectronPage,
    testInfo: any,
    baseName: string,
    description: string,
) {
    const outputDir = path.resolve('docs/images');
    const pngPath = path.join(outputDir, `${baseName}.png`);
    const webpPath = path.join(outputDir, `${baseName}.webp`);
    await fs.mkdir(outputDir, { recursive: true });

    await page.screenshot({
        path: pngPath,
        fullPage: true,
    });

    await sharp(pngPath).webp({ lossless: true }).toFile(webpPath);
    await fs.rm(pngPath, { force: true });

    await testInfo.attach(description, {
        path: webpPath,
        contentType: 'image/webp',
    });
}

async function stubInstalledTools(
    electronApp: ElectronApplication,
    tools: CachedTool[],
) {
    await electronApp.evaluate(
        ({ ipcMain }, injectedTools: CachedTool[]) => {
            ipcMain.removeHandler('get-installed-tools');
            ipcMain.handle('get-installed-tools', async () =>
                injectedTools.map((tool) => ({
                    name: tool.name,
                    path: tool.path,
                    version: tool.version ?? null,
                })),
            );

            ipcMain.removeHandler('get-cached-tools');
            ipcMain.handle('get-cached-tools', async () =>
                injectedTools.map((tool) => ({
                    ...tool,
                    version: tool.version ?? null,
                    verified: true,
                })),
            );
        },
        tools,
    );
}
