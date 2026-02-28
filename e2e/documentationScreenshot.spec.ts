import {
    expect,
    test,
    _electron,
    type ElectronApplication,
} from '@playwright/test';
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
            const installButton = page.getByTestId('btnInstallEditor');
            const closeButton = page.getByTestId('btnCloseInstallEditor');

            for (let attempt = 0; attempt < 3; attempt++) {
                await expect(installButton).toBeVisible({ timeout: 10000 });
                await installButton.click({ force: true });
                if (await closeButton.isVisible().catch(() => false)) {
                    break;
                }
                await page.waitForTimeout(250);
            }

            await expect(closeButton).toBeVisible({ timeout: 10000 });
            await page.waitForTimeout(400);
        },
        cleanup: async (page: ElectronPage) => {
            const closeButton = page.getByTestId('btnCloseInstallEditor');
            if (await closeButton.isVisible().catch(() => false)) {
                await closeButton.click();
            } else {
                await page.keyboard.press('Escape');
            }
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
        version: '4.4.1-stable',
        version_number: 4.4,
        install_path: '/Applications/Godot_4.4.1',
        editor_path:
            '/Applications/Godot_4.4.1/Godot.app/Contents/MacOS/Godot',
        platform: 'darwin',
        arch: 'universal',
        mono: false,
        prerelease: false,
        config_version: 5,
        published_at: '2025-03-26T09:19:36Z',
        valid: true,
    },
    {
        version: '4.6.1-stable',
        version_number: 4.6,
        install_path: '/Applications/Godot_4.6.1_mono',
        editor_path:
            '/Applications/Godot_4.6.1_mono/Godot_mono.app/Contents/MacOS/Godot',
        platform: 'darwin',
        arch: 'universal',
        mono: true,
        prerelease: false,
        config_version: 5,
        published_at: '2026-02-16T20:26:38Z',
        valid: true,
    },
];

const SAMPLE_PROJECTS = [
    {
        name: 'My-Awesome-Game',
        path: '/Users/docs/Godot/Projects/my-awesome-game',
        version: '4.4.1-stable',
        version_number: 4.4,
        renderer: 'FORWARD_PLUS',
        editor_settings_path:
            '/Users/docs/Godot/Projects/my-awesome-game/.godot',
        editor_settings_file:
            '/Users/docs/Godot/Projects/my-awesome-game/.godot/editor_settings-4.4.tres',
        last_opened: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        open_windowed: false,
        release: SAMPLE_INSTALLED_RELEASES[0],
        launch_path:
            '/Applications/Godot_4.4.1/Godot.app/Contents/MacOS/Godot',
        config_version: 5,
        withVSCode: true,
        withGit: true,
        valid: true,
    },
    {
        name: 'My-Other-Game',
        path: '/Users/docs/Godot/Projects/my-other-game',
        version: '4.6.1-stable',
        version_number: 4.6,
        renderer: 'FORWARD_PLUS',
        editor_settings_path:
            '/Users/docs/Godot/Projects/my-other-game/.godot',
        editor_settings_file:
            '/Users/docs/Godot/Projects/my-other-game/.godot/editor_settings-4.6.tres',
        last_opened: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        open_windowed: false,
        release: SAMPLE_INSTALLED_RELEASES[1],
        launch_path:
            '/Applications/Godot_4.6.1_mono/Godot_mono.app/Contents/MacOS/Godot',
        config_version: 5,
        withVSCode: true,
        withGit: true,
        valid: true,
    },
];

const SAMPLE_RELEASES_CACHE_FILE = releasesCache;

const SAMPLE_PRERELEASE_CACHE_FILE = prereleasesCache;

const SAMPLE_AVAILABLE_RELEASES: ReleaseSummary[] =
    SAMPLE_RELEASES_CACHE_FILE.releases;

const SAMPLE_AVAILABLE_PRERELEASES: ReleaseSummary[] =
    SAMPLE_PRERELEASE_CACHE_FILE.releases;

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
    await writeJson(
        path.join(configDir, 'releases.json'),
        SAMPLE_RELEASES_CACHE_FILE,
    );
    await writeJson(
        path.join(configDir, 'prereleases.json'),
        SAMPLE_PRERELEASE_CACHE_FILE,
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

async function stubAppData(
    electronApp: ElectronApplication,
    preferences: UserPreferences,
    projects: ProjectDetails[],
    installedReleases: InstalledRelease[],
    availableReleases: ReleaseSummary[],
    availablePrereleases: ReleaseSummary[],
) {
    await electronApp.evaluate(
        (
            { ipcMain, BrowserWindow },
            {
                injectedPreferences,
                injectedProjects,
                injectedInstalledReleases,
                injectedAvailableReleases,
                injectedAvailablePrereleases,
            }: {
                injectedPreferences: UserPreferences;
                injectedProjects: ProjectDetails[];
                injectedInstalledReleases: InstalledRelease[];
                injectedAvailableReleases: ReleaseSummary[];
                injectedAvailablePrereleases: ReleaseSummary[];
            },
        ) => {
            const normalizedInstalledReleases = injectedInstalledReleases.map(
                (release) => ({
                    ...release,
                    valid: true,
                }),
            );
            const normalizedProjects = injectedProjects.map((project) => ({
                ...project,
                last_opened: project.last_opened
                    ? new Date(project.last_opened as unknown as string)
                    : null,
                release: {
                    ...project.release,
                    valid: true,
                },
                valid: true,
            }));

            ipcMain.removeHandler('get-user-preferences');
            ipcMain.handle('get-user-preferences', async () => injectedPreferences);

            ipcMain.removeHandler('set-user-preferences');
            ipcMain.handle(
                'set-user-preferences',
                async (_, nextPrefs: UserPreferences) => nextPrefs,
            );

            ipcMain.removeHandler('get-projects-details');
            ipcMain.handle('get-projects-details', async () => normalizedProjects);

            ipcMain.removeHandler('check-all-projects-valid');
            ipcMain.handle('check-all-projects-valid', async () =>
                normalizedProjects,
            );

            ipcMain.removeHandler('check-project-valid');
            ipcMain.handle('check-project-valid', async (_, project) => ({
                ...project,
                release: {
                    ...project.release,
                    valid: true,
                },
                valid: true,
            }));

            ipcMain.removeHandler('get-installed-releases');
            ipcMain.handle('get-installed-releases', async () =>
                normalizedInstalledReleases,
            );

            ipcMain.removeHandler('check-all-releases-valid');
            ipcMain.handle('check-all-releases-valid', async () =>
                normalizedInstalledReleases,
            );

            ipcMain.removeHandler('get-available-releases');
            ipcMain.handle('get-available-releases', async () =>
                injectedAvailableReleases,
            );

            ipcMain.removeHandler('get-available-prereleases');
            ipcMain.handle('get-available-prereleases', async () =>
                injectedAvailablePrereleases,
            );

            for (const win of BrowserWindow.getAllWindows()) {
                const webContents = win.webContents as any;
                if (webContents.__docsPatchedSend) {
                    continue;
                }

                const originalSend = webContents.send.bind(webContents);
                webContents.__docsPatchedSend = true;
                webContents.send = (
                    channel: string,
                    payload: unknown,
                    ...args: unknown[]
                ) => {
                    if (channel === 'projects-updated') {
                        return originalSend(channel, normalizedProjects, ...args);
                    }
                    if (channel === 'releases-updated') {
                        return originalSend(
                            channel,
                            normalizedInstalledReleases,
                            ...args,
                        );
                    }
                    return originalSend(channel, payload, ...args);
                };
            }
        },
        {
            injectedPreferences: preferences,
            injectedProjects: projects,
            injectedInstalledReleases: installedReleases,
            injectedAvailableReleases: availableReleases,
            injectedAvailablePrereleases: availablePrereleases,
        },
    );
}

test('captures documentation screenshots for each main view', async ({}, testInfo) => {
    testInfo.setTimeout(240000);
    const fixtureHome = await createFixtureHome();
    const overrideHomeScript = path.resolve(
        process.cwd(),
        'e2e',
        'support',
        'overrideHome.cjs',
    );
    const existingNodeOptions = process.env.NODE_OPTIONS?.trim();
    const requireOverrideOption = `--require "${overrideHomeScript}"`;
    const launchEnv: NodeJS.ProcessEnv = {
        ...process.env,
        NODE_ENV: 'development',
        APPDATA: path.join(fixtureHome, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(fixtureHome, 'AppData', 'Local'),
        GODOT_LAUNCHER_DOCS_SCREENSHOTS: '1',
        GODOT_LAUNCHER_DOCS_HOME_DIR: fixtureHome,
        NODE_OPTIONS: existingNodeOptions
            ? `${existingNodeOptions} ${requireOverrideOption}`
            : requireOverrideOption,
    };
    // This env var makes Electron behave like plain Node and breaks Playwright's Electron launch.
    delete launchEnv.ELECTRON_RUN_AS_NODE;
    const electronApp = await _electron.launch({
        args: ['.'],
        env: launchEnv,
    });

    try {
        const mainPage = await electronApp.firstWindow();
        await waitForPreloadScript(mainPage);
        await stubAppData(
            electronApp,
            SAMPLE_PREFS,
            SAMPLE_PROJECTS,
            SAMPLE_INSTALLED_RELEASES,
            SAMPLE_AVAILABLE_RELEASES,
            SAMPLE_AVAILABLE_PRERELEASES,
        );
        await stubInstalledTools(electronApp, DEFAULT_TOOLS);
        await mainPage.reload();
        await waitForPreloadScript(mainPage);
        await mainPage.setViewportSize({ width: 1024, height: 600 });
        await mainPage.getByTestId('btnProjects').click();
        await expect(
            mainPage.getByRole('button', {
                name: 'My-Awesome-Game',
                exact: true,
            }),
        ).toBeVisible({
            timeout: 10000,
        });
        await expect(
            mainPage.getByRole('button', {
                name: 'My-Other-Game',
                exact: true,
            }),
        ).toBeVisible({
            timeout: 10000,
        });
        await mainPage.getByTestId('btnInstalls').click();
        await expect(
            mainPage.getByText('4.4.1-stable', { exact: true }),
        ).toBeVisible({
            timeout: 10000,
        });
        await expect(
            mainPage.getByText('4.6.1-stable'),
        ).toBeVisible({
            timeout: 10000,
        });
        await expect(
            mainPage.getByText('/Applications/Godot_4.6.1_mono', {
                exact: true,
            }),
        ).toBeVisible({
            timeout: 10000,
        });
        await mainPage.getByTestId('btnProjects').click();

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
    const outputDir = path.resolve('docs/screenshots');
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
