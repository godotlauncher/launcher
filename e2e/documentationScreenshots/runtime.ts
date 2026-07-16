import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type ElectronApplication, expect } from '@playwright/test';
import type {
    AppUpdateMessage,
    InstalledRelease,
    ProjectDetails,
    ReleaseInstallProgress,
    ReleaseSummary,
    UserPreferences,
} from '@shared/contracts';
import sharp from 'sharp';
import { waitForDiElectronPreload } from '../support/waitForDiElectronPreload';
import {
    createPreferences,
    DEFAULT_TOOLS,
    SAMPLE_AVAILABLE_PRERELEASES,
    SAMPLE_AVAILABLE_RELEASES,
    SAMPLE_CUSTOM_RELEASE,
    SAMPLE_EDITOR_RESOLUTION_FALLBACK_RELEASE,
    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
    SAMPLE_PREFS,
    SAMPLE_PRERELEASE_CACHE_FILE,
    SAMPLE_PROJECT_ICON_PATH,
    SAMPLE_PROJECTS,
    SAMPLE_RELEASES_CACHE_FILE,
} from './sampleData';
import type {
    CachedTool,
    ElectronPage,
    StubbedAppDataOptions,
    ThemeConfig,
    UpdateScreenshotState,
} from './types';

const SCREENSHOT_MIN_WIDTH = 1024;
const SCREENSHOT_MIN_HEIGHT = 600;

export async function writeJson(file: string, data: unknown) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

export async function seedLauncherData(homeDir: string) {
    const configDir = path.join(homeDir, '.gd-launcher');
    await fs.mkdir(configDir, { recursive: true });
    await writeJson(path.join(configDir, 'projects.json'), SAMPLE_PROJECTS);
    await writeJson(
        path.join(configDir, 'installed-releases.json'),
        SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
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

export async function createFixtureHome() {
    const tempHome = await fs.mkdtemp(
        path.join(os.tmpdir(), 'gd-launcher-docs-'),
    );
    await seedLauncherData(tempHome);
    return tempHome;
}

export async function showProjectsDropOverlay(page: ElectronPage) {
    await page.evaluate(() => {
        const title = document.querySelector('[data-testid="projectsTitle"]');
        const container =
            title?.closest(
                'div.flex.flex-col.h-full.w-full.overflow-auto.p-1',
            ) ??
            document.querySelector(
                'div.flex.flex-col.h-full.w-full.overflow-auto.p-1',
            );
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

export async function hideProjectsDropOverlay(page: ElectronPage) {
    await page.evaluate(() => {
        const title = document.querySelector('[data-testid="projectsTitle"]');
        const container =
            title?.closest(
                'div.flex.flex-col.h-full.w-full.overflow-auto.p-1',
            ) ??
            document.querySelector(
                'div.flex.flex-col.h-full.w-full.overflow-auto.p-1',
            );
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

function getManifestFileName(supported: boolean) {
    return supported
        ? 'godotlauncher-editor-manifest.json'
        : 'godot-editor-manifest.json';
}

export async function showInstallsManifestDropOverlay(
    page: ElectronPage,
    supported: boolean,
) {
    await page.evaluate((fileName) => {
        const title = document.querySelector('[data-testid="installsTitle"]');
        const container =
            title?.closest('section') ??
            document.querySelector('section[aria-label]');
        if (!container) return;

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(
            new File(['{}'], fileName, { type: 'application/json' }),
        );
        const dragEnter = new DragEvent('dragenter', {
            dataTransfer,
            bubbles: true,
            cancelable: true,
        });
        container.dispatchEvent(dragEnter);
    }, getManifestFileName(supported));
}

export async function hideInstallsManifestDropOverlay(
    page: ElectronPage,
    supported: boolean,
) {
    await page.evaluate((fileName) => {
        const title = document.querySelector('[data-testid="installsTitle"]');
        const container =
            title?.closest('section') ??
            document.querySelector('section[aria-label]');
        if (!container) return;

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(
            new File(['{}'], fileName, { type: 'application/json' }),
        );
        const dragLeave = new DragEvent('dragleave', {
            dataTransfer,
            bubbles: true,
            cancelable: true,
        });
        container.dispatchEvent(dragLeave);
    }, getManifestFileName(supported));
}

export async function applyTheme(page: ElectronPage, theme: ThemeConfig) {
    await page.emulateMedia({ colorScheme: theme.colorScheme });
    await expect(page.getByTestId('btnSettings')).toBeVisible({
        timeout: 15000,
    });
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabAppearance').click();
    await page.getByTestId(theme.toggleTestId).check();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('btnProjects')).toBeVisible({
        timeout: 15000,
    });
    await page.getByTestId('btnProjects').click();
}

export async function stubAppData(
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
                    valid: release.valid ?? true,
                }),
            );
            const normalizedProjects = injectedProjects.map((project) => ({
                ...project,
                last_opened: project.last_opened
                    ? new Date(project.last_opened as unknown as string)
                    : null,
                release: {
                    ...project.release,
                    valid: project.release.valid ?? true,
                },
                valid: project.valid ?? true,
            }));

            ipcMain.removeHandler('get-user-preferences');
            ipcMain.handle(
                'get-user-preferences',
                async () => injectedPreferences,
            );

            ipcMain.removeHandler('set-user-preferences');
            ipcMain.handle(
                'set-user-preferences',
                async (_, nextPrefs: UserPreferences) => nextPrefs,
            );

            ipcMain.removeHandler('get-projects-details');
            ipcMain.handle(
                'get-projects-details',
                async () => normalizedProjects,
            );

            ipcMain.removeHandler('check-all-projects-valid');
            ipcMain.handle(
                'check-all-projects-valid',
                async () => normalizedProjects,
            );

            ipcMain.removeHandler('check-project-valid');
            ipcMain.handle('check-project-valid', async (_, project) => ({
                ...project,
                release: {
                    ...project.release,
                    valid: project.release.valid ?? true,
                },
                valid: project.valid ?? true,
            }));

            ipcMain.removeHandler('get-project-godot-name');
            ipcMain.handle('get-project-godot-name', async (_, project) => {
                const matchingProject = normalizedProjects.find(
                    (candidate) => candidate.path === project.path,
                );
                return matchingProject?.name ?? null;
            });

            ipcMain.removeHandler('get-installed-releases');
            ipcMain.handle(
                'get-installed-releases',
                async () => normalizedInstalledReleases,
            );

            ipcMain.removeHandler('check-all-releases-valid');
            ipcMain.handle(
                'check-all-releases-valid',
                async () => normalizedInstalledReleases,
            );

            ipcMain.removeHandler('get-available-releases');
            ipcMain.handle('get-available-releases', async () => ({
                releases: injectedAvailableReleases,
            }));

            ipcMain.removeHandler('get-available-prereleases');
            ipcMain.handle('get-available-prereleases', async () => ({
                releases: injectedAvailablePrereleases,
            }));

            for (const win of BrowserWindow.getAllWindows()) {
                const webContents = win.webContents as any;
                webContents.__docsProjects = normalizedProjects;
                webContents.__docsInstalledReleases =
                    normalizedInstalledReleases;

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
                        return originalSend(
                            channel,
                            webContents.__docsProjects ?? payload,
                            ...args,
                        );
                    }
                    if (channel === 'releases-updated') {
                        return originalSend(
                            channel,
                            webContents.__docsInstalledReleases ?? payload,
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

export async function prepareAppWithStubbedData(
    page: ElectronPage,
    electronApp: ElectronApplication,
    options: StubbedAppDataOptions = {},
) {
    await stubAppData(
        electronApp,
        options.preferences ?? SAMPLE_PREFS,
        options.projects ?? SAMPLE_PROJECTS,
        options.installedReleases ?? SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
        options.availableReleases ?? SAMPLE_AVAILABLE_RELEASES,
        options.availablePrereleases ?? SAMPLE_AVAILABLE_PRERELEASES,
    );
    await stubInstalledTools(electronApp, options.tools ?? DEFAULT_TOOLS);
    await reloadScreenshotPage(page);
    await waitForDiElectronPreload(page);
    await setScreenshotViewport(page);
}

export async function reloadScreenshotPage(page: ElectronPage) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await page.reload({ waitUntil: 'load', timeout: 15000 });
            return;
        } catch (error) {
            lastError = error;
            await page.waitForTimeout(500 * attempt);
        }
    }

    throw lastError;
}

export async function navigateToUpdatesTab(page: ElectronPage) {
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabUpdates').click();
    await page.waitForTimeout(600);
}

export async function emitAppUpdate(
    electronApp: ElectronApplication,
    updateMessage: AppUpdateMessage,
) {
    await electronApp.evaluate(
        ({ BrowserWindow }, message: AppUpdateMessage) => {
            for (const win of BrowserWindow.getAllWindows()) {
                win.webContents.send('app-updates', message);
            }
        },
        updateMessage,
    );
}

export async function prepareUpdatesScreenshot(
    page: ElectronPage,
    electronApp: ElectronApplication,
    theme: ThemeConfig,
    state: UpdateScreenshotState = {},
) {
    await prepareAppWithStubbedData(page, electronApp, {
        preferences: createPreferences(state.preferences),
    });
    await applyTheme(page, theme);
    await navigateToUpdatesTab(page);

    if (state.updateMessage) {
        await emitAppUpdate(electronApp, state.updateMessage);
        await page.waitForTimeout(300);
    }
}

export async function prepareAppUpdateBannerScreenshot(
    page: ElectronPage,
    electronApp: ElectronApplication,
    theme: ThemeConfig,
    updateMessage: AppUpdateMessage,
) {
    await prepareAppWithStubbedData(page, electronApp);
    await applyTheme(page, theme);
    await page.getByTestId('btnProjects').click();
    await page.waitForTimeout(600);
    await emitAppUpdate(electronApp, updateMessage);
    await page.waitForTimeout(300);
}

export async function ensureMainNavigationReady(
    page: ElectronPage,
    electronApp: ElectronApplication,
) {
    const btnProjects = page.getByTestId('btnProjects');
    const btnInstalls = page.getByTestId('btnInstalls');
    const btnSettings = page.getByTestId('btnSettings');

    for (let attempt = 1; attempt <= 3; attempt++) {
        await prepareAppWithStubbedData(page, electronApp);
        try {
            await expect(btnProjects).toBeVisible({ timeout: 15000 });
            await expect(btnInstalls).toBeVisible({ timeout: 15000 });
            await expect(btnSettings).toBeVisible({ timeout: 15000 });
            return;
        } catch {
            if (attempt === 3) {
                const diagnostics = await page.evaluate(() => {
                    const testIds = Array.from(
                        document.querySelectorAll('[data-testid]'),
                    )
                        .map((el) => el.getAttribute('data-testid'))
                        .filter((value): value is string => Boolean(value));

                    return {
                        title: document.title,
                        testIds: testIds.slice(0, 25),
                        bodyText: document.body?.innerText
                            ?.replace(/\s+/g, ' ')
                            .trim()
                            .slice(0, 250),
                    };
                });

                throw new Error(
                    `Main navigation did not render after retrying app bootstrap. Diagnostics: ${JSON.stringify(
                        diagnostics,
                    )}`,
                );
            }
        }
    }
}

export async function setScreenshotViewport(
    page: ElectronPage,
    height = SCREENSHOT_MIN_HEIGHT,
) {
    await page.setViewportSize({
        width: SCREENSHOT_MIN_WIDTH,
        height: Math.max(SCREENSHOT_MIN_HEIGHT, height),
    });
}

export async function captureScreenshot(
    page: ElectronPage,
    testInfo: any,
    baseName: string,
    description: string,
) {
    const outputDir = path.resolve('docs/screenshots');
    const pngPath = path.join(outputDir, `${baseName}.png`);
    const webpPath = path.join(outputDir, `${baseName}.webp`);
    await fs.mkdir(outputDir, { recursive: true });

    await page.mouse.move(0, 0);

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

export async function openProjectActionsMenu(
    page: ElectronPage,
    projectName: string,
) {
    const projectRow = page
        .locator('tr')
        .filter({ has: page.getByRole('button', { name: projectName }) });
    await projectRow
        .locator('[data-testid="btnProjectMoreOptions"]:visible')
        .click();
    await expect(page.getByRole('dialog').first()).toBeVisible({
        timeout: 10000,
    });
}

export async function openFirstReleaseActionsMenu(page: ElectronPage) {
    await page
        .locator('[data-testid="btnReleaseMoreOptions"]:visible')
        .first()
        .click();
    await expect(page.getByRole('dialog').first()).toBeVisible({
        timeout: 10000,
    });
}

export async function closeActionMenu(page: ElectronPage) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
}

export async function dismissVisibleAlert(page: ElectronPage) {
    const alertOkButton = page.getByTestId('btnAlertOk');
    if (await alertOkButton.isVisible().catch(() => false)) {
        await alertOkButton.click({ force: true });
        await page.waitForTimeout(200);
    }
}

export async function publishReleaseInstallProgress(
    electronApp: ElectronApplication,
    progressEvents: ReleaseInstallProgress[],
) {
    await electronApp.evaluate(
        (
            { BrowserWindow },
            injectedProgressEvents: ReleaseInstallProgress[],
        ) => {
            for (const win of BrowserWindow.getAllWindows()) {
                for (const progress of injectedProgressEvents) {
                    win.webContents.send('release-install-progress', progress);
                }
            }
        },
        progressEvents,
    );
}

export async function stubInstallReleaseFailure(
    electronApp: ElectronApplication,
    error: string,
) {
    await electronApp.evaluate(({ ipcMain }, message: string) => {
        ipcMain.removeHandler('install-release');
        ipcMain.handle('install-release', async (_, release) => ({
            success: false,
            error: message,
            version: release.version,
        }));
    }, error);
}

export async function stubAddProjectEditorResolution(
    electronApp: ElectronApplication,
) {
    await electronApp.evaluate(
        (
            { ipcMain },
            {
                fallbackRelease,
                projectPath,
                projectIconPath,
            }: {
                fallbackRelease: InstalledRelease;
                projectPath: string;
                projectIconPath: string;
            },
        ) => {
            ipcMain.removeHandler('open-file-dialog');
            ipcMain.handle('open-file-dialog', async () => ({
                canceled: false,
                filePaths: [projectPath],
                bookmarks: [],
            }));

            ipcMain.removeHandler('add-project');
            ipcMain.handle('add-project', async (_, path: string, options) => {
                if (options?.resolution === 'add_missing') {
                    const projectDirectory = path.replace(
                        /\/project\.godot$/i,
                        '',
                    );
                    const newProject: ProjectDetails = {
                        name: 'Imported-Missing-Editor-Game',
                        path: projectDirectory,
                        icon_path: projectIconPath,
                        version: '4.6.3-stable',
                        version_number: 4.6,
                        renderer: 'FORWARD_PLUS',
                        editor_settings_path: `${projectDirectory}/.godot`,
                        editor_settings_file: `${projectDirectory}/.godot/editor_settings-4.6.tres`,
                        last_opened: null,
                        open_windowed: false,
                        release: {
                            ...fallbackRelease,
                            version: '4.6.3-stable',
                            version_number: 4.6,
                            valid: false,
                        },
                        launch_path:
                            '/Users/docs/Godot/Editors/Godot_4.6.3/Godot.app/Contents/MacOS/Godot',
                        config_version: 5,
                        withVSCode: false,
                        withGit: true,
                        valid: false,
                        invalid_reason: 'missing_editor',
                    };

                    return {
                        success: true,
                        projects: [newProject],
                        newProject,
                    };
                }

                return {
                    success: false,
                    editorResolution: {
                        requested: {
                            channel: 'official',
                            flavor: 'gdscript',
                            base_version: '4.6',
                            version: '4.6.3-stable',
                        },
                        fallback: fallbackRelease,
                        downloadable: {
                            version: '4.6.3-stable',
                            flavor: 'gdscript',
                            prerelease: false,
                        },
                    },
                };
            });
        },
        {
            fallbackRelease: SAMPLE_EDITOR_RESOLUTION_FALLBACK_RELEASE,
            projectPath:
                '/Users/docs/Godot/Projects/imported-missing-editor/project.godot',
            projectIconPath: SAMPLE_PROJECT_ICON_PATH,
        },
    );
}

export async function stubAddProjectRecoveredVSCodeConfig(
    electronApp: ElectronApplication,
) {
    await electronApp.evaluate(
        (
            { ipcMain, BrowserWindow },
            {
                projectPath,
                projectIconPath,
            }: { projectPath: string; projectIconPath: string },
        ) => {
            ipcMain.removeHandler('open-file-dialog');
            ipcMain.handle('open-file-dialog', async () => ({
                canceled: false,
                filePaths: [projectPath],
                bookmarks: [],
            }));

            ipcMain.removeHandler('add-project');
            ipcMain.handle('add-project', async () => {
                const projectDirectory = projectPath.replace(
                    /\/project\.godot$/i,
                    '',
                );
                const newProject: ProjectDetails = {
                    name: 'Recovered-VSCode-Config',
                    path: projectDirectory,
                    icon_path: projectIconPath,
                    version: '4.4.1-stable',
                    version_number: 4.4,
                    renderer: 'FORWARD_PLUS',
                    editor_settings_path: `${projectDirectory}/.godot`,
                    editor_settings_file: `${projectDirectory}/.godot/editor_settings-4.4.tres`,
                    last_opened: null,
                    open_windowed: false,
                    release: {
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
                    launch_path:
                        '/Applications/Godot_4.4.1/Godot.app/Contents/MacOS/Godot',
                    config_version: 5,
                    withVSCode: true,
                    withGit: true,
                    valid: true,
                };
                const projects = [newProject];

                for (const win of BrowserWindow.getAllWindows()) {
                    const webContents = win.webContents as any;
                    webContents.__docsProjects = projects;
                    win.webContents.send('projects-updated', projects);
                }

                return {
                    success: true,
                    projects,
                    newProject,
                    recoveredVSCodeConfigFiles: [
                        '.vscode/settings.json.1712345678901.bad',
                        '.vscode/extensions.json.1712345678902.bad',
                    ],
                };
            });
        },
        {
            projectPath:
                '/Users/docs/Godot/Projects/recovered-vscode-config/project.godot',
            projectIconPath: SAMPLE_PROJECT_ICON_PATH,
        },
    );
}

export async function stubCustomEditorDuplicateRegistration(
    electronApp: ElectronApplication,
) {
    await electronApp.evaluate(
        ({ ipcMain }, duplicateRelease: InstalledRelease) => {
            ipcMain.removeHandler('open-file-dialog');
            ipcMain.handle('open-file-dialog', async () => ({
                canceled: false,
                filePaths: [
                    '/Users/docs/Godot/Editors/StudioCustom47/godotlauncher-editor-manifest.json',
                ],
                bookmarks: [],
            }));

            ipcMain.removeHandler('register-custom-engine');
            ipcMain.handle(
                'register-custom-engine',
                async (
                    _,
                    _manifestPath: string,
                    options?: { replaceExisting?: boolean },
                ) => {
                    if (options?.replaceExisting) {
                        return {
                            success: true,
                            release: duplicateRelease,
                            releases: [duplicateRelease],
                        };
                    }

                    return {
                        success: false,
                        duplicate: duplicateRelease,
                    };
                },
            );
        },
        SAMPLE_CUSTOM_RELEASE,
    );
}

export async function stubInstalledTools(
    electronApp: ElectronApplication,
    tools: CachedTool[],
) {
    await electronApp.evaluate(({ ipcMain }, injectedTools: CachedTool[]) => {
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
    }, tools);
}
