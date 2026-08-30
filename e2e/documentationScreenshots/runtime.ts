import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    type ElectronApplication,
    expect,
    type TestInfo,
} from '@playwright/test';
import type {
    AddProjectOptions,
    AppBridge,
    AppUpdateMessage,
    CodeEditorIntegrationSettings,
    CreateProjectResult,
    GitIdentity,
    GitIdentitySettings,
    GitLfsTrackingPolicyDescriptor,
    InitializeProjectGitResult,
    EditorCatalogArchitecture,
    EditorCatalogPlatform,
    EditorCatalogRelease,
    EditorCatalogResult,
    EditorInstallsBridge,
    InstalledRelease,
    LaunchProjectResult,
    ListCreateProjectPublicationTargetsResult,
    ProjectDetails,
    ProjectGitIdentityResult,
    ProjectsBridge,
    ReleaseInstallProgress,
    ReleaseSummary,
    ToolIntegrationSummary,
    UserPreferences,
} from '@shared/contracts';
import sharp from 'sharp';
import {
    createPreferences,
    DEFAULT_TOOL_INTEGRATIONS,
    SAMPLE_AVAILABLE_PRERELEASES,
    SAMPLE_AVAILABLE_RELEASES,
    SAMPLE_CUSTOM_RELEASE,
    SAMPLE_EDITOR_RESOLUTION_FALLBACK_RELEASE,
    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
    SAMPLE_GIT_LFS_TRACKING_POLICY,
    SAMPLE_PREFS,
    SAMPLE_PRERELEASE_CACHE_FILE,
    SAMPLE_PROJECT_ICON_PATH,
    SAMPLE_PROJECTS,
    SAMPLE_RELEASES_CACHE_FILE,
    SAMPLE_VSCODE_SETTINGS_AVAILABLE,
} from './sampleData';
import type {
    ElectronPage,
    OnboardingScreenshotPlatform,
    OnboardingScreenshotStep,
    StubbedAppDataOptions,
    ThemeConfig,
    UpdateScreenshotState,
} from './types';

const SCREENSHOT_MIN_WIDTH = 1024;
const SCREENSHOT_MIN_HEIGHT = 600;

// Canonical screenshot source for the whole workspace lives outside this
// repo, in the sibling screenshots project, regardless of cwd.
const workspaceRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
);
const canonicalScreensDir = path.join(
    workspaceRoot,
    'screenshots',
    'screens',
);

type AppMethod = Extract<keyof AppBridge, string>;
type AppResult<Method extends AppMethod> = Awaited<
    ReturnType<AppBridge[Method]>
>;
type ProjectsMethod = Extract<keyof ProjectsBridge, string>;
type ProjectsResult<Method extends ProjectsMethod> = Awaited<
    ReturnType<ProjectsBridge[Method]>
>;
type EditorInstallsMethod = Extract<keyof EditorInstallsBridge, string>;
type EditorInstallsResult<Method extends EditorInstallsMethod> = Awaited<
    ReturnType<EditorInstallsBridge[Method]>
>;
type IpcSuccess<Data> = {
    success: true;
    data: Data;
};

const screenshotEditorPlatform: EditorCatalogPlatform =
    process.platform === 'win32' ||
    process.platform === 'darwin' ||
    process.platform === 'linux'
        ? process.platform
        : 'linux';
const screenshotEditorArchitecture: EditorCatalogArchitecture =
    process.arch === 'x64' ||
    process.arch === 'arm64' ||
    process.arch === 'ia32' ||
    process.arch === 'arm'
        ? process.arch
        : 'x64';

/**
 * Creates catalog data from the release fixtures used by screenshots.
 *
 * @param availableReleases - Releases from the stable provider.
 * @param availablePrereleases - Releases from the prerelease provider.
 * @param refreshError - An optional mocked provider refresh error.
 * @returns Catalog data for the dedicated editor catalog bridge.
 */
function createScreenshotEditorCatalog(
    availableReleases: ReleaseSummary[],
    availablePrereleases: ReleaseSummary[],
    refreshError?: string,
): EditorCatalogResult {
    const now = Date.now();

    return {
        releases: [
            ...availableReleases.map((release, releaseIndex) =>
                createScreenshotEditorCatalogRelease(
                    release,
                    releaseIndex,
                    'official-stable',
                    false,
                ),
            ),
            ...availablePrereleases.map((release, releaseIndex) =>
                createScreenshotEditorCatalogRelease(
                    release,
                    releaseIndex,
                    'official-prerelease',
                    true,
                ),
            ),
        ],
        providers: [
            {
                id: 'official-stable',
                lastFetchedAt: now,
                isStale: false,
                ...(refreshError ? { refreshError } : {}),
            },
            {
                id: 'official-prerelease',
                lastFetchedAt: now,
                isStale: false,
            },
        ],
    };
}

/**
 * Converts one release fixture into the editor catalog shape.
 *
 * @param release - The release fixture to convert.
 * @param releaseIndex - The release position used for stable asset IDs.
 * @param providerId - The provider that supplied the fixture.
 * @param providerPrerelease - Whether the provider contains prereleases.
 * @returns A release for the dedicated editor catalog bridge.
 */
function createScreenshotEditorCatalogRelease(
    release: ReleaseSummary,
    releaseIndex: number,
    providerId: EditorCatalogRelease['providerId'],
    providerPrerelease: boolean,
): EditorCatalogRelease {
    const versionMatch = release.version.match(
        /^(\d+)\.(\d+)(?:\.(\d+))?(?:-([a-z]+)(\d+)?)?/i,
    );
    const baseVersion = release.version.split('-')[0];

    return {
        id: `${providerId}:${release.version}`,
        sourceReleaseId: release.tag ?? release.version,
        providerId,
        tag: release.tag ?? release.version,
        version: release.version,
        baseVersion,
        name: release.name,
        publishedAt: release.published_at,
        prerelease: providerPrerelease || release.prerelease,
        versionParts: {
            major: Number(versionMatch?.[1] ?? 0),
            minor: Number(versionMatch?.[2] ?? 0),
            patch: Number(versionMatch?.[3] ?? 0),
            channel: versionMatch?.[4] ?? 'stable',
            iteration: Number(versionMatch?.[5] ?? 0),
        },
        variants: [false, true].flatMap((mono) => {
            const flavor = mono ? 'dotnet' : 'gdscript';
            const assets = release.assets
                .filter((asset) => asset.mono === mono)
                .map((asset, assetIndex) => ({
                    id: `${releaseIndex}:${flavor}:${assetIndex}`,
                    name: asset.name,
                    downloadUrl: asset.download_url,
                    platform: screenshotEditorPlatform,
                    architecture: screenshotEditorArchitecture,
                }));

            return assets.length > 0
                ? [
                      {
                          id: `${providerId}:${release.version}:${flavor}`,
                          flavor,
                          assets,
                      },
                  ]
                : [];
        }),
    };
}

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

const shimmedElectronApps = new WeakSet<ElectronApplication>();

async function ensureMainProcessNameHelperShim(
    electronApp: ElectronApplication,
) {
    if (shimmedElectronApps.has(electronApp)) {
        return;
    }

    await electronApp.evaluate(() => {
        const target = globalThis as unknown as Record<string, unknown>;
        if (typeof target.__name !== 'function') {
            target.__name = (fn: unknown) => fn;
        }
    });
    shimmedElectronApps.add(electronApp);
}

/**
 * Stubs launcher data requests for one screenshot state.
 *
 * @param electronApp - The Electron app to update.
 * @param preferences - The preferences returned to the renderer.
 * @param projects - The projects returned to the renderer.
 * @param installedReleases - The installed editors returned to the renderer.
 * @param availableReleases - The stable catalog fixtures to return.
 * @param availablePrereleases - The prerelease catalog fixtures to return.
 * @param catalogRefreshError - An optional mocked catalog refresh error.
 * @returns A promise that ends when the handlers are ready.
 */
export async function stubAppData(
    electronApp: ElectronApplication,
    preferences: UserPreferences,
    projects: ProjectDetails[],
    installedReleases: InstalledRelease[],
    availableReleases: ReleaseSummary[],
    availablePrereleases: ReleaseSummary[],
    catalogRefreshError?: string,
) {
    await ensureMainProcessNameHelperShim(electronApp);
    const editorCatalog = createScreenshotEditorCatalog(
        availableReleases,
        availablePrereleases,
        catalogRefreshError,
    );
    await electronApp.evaluate(
        (
            { ipcMain, BrowserWindow },
            {
                injectedPreferences,
                injectedProjects,
                injectedInstalledReleases,
                injectedAvailableReleases,
                injectedAvailablePrereleases,
                injectedEditorCatalog,
            }: {
                injectedPreferences: UserPreferences;
                injectedProjects: ProjectDetails[];
                injectedInstalledReleases: InstalledRelease[];
                injectedAvailableReleases: ReleaseSummary[];
                injectedAvailablePrereleases: ReleaseSummary[];
                injectedEditorCatalog: EditorCatalogResult;
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

            const appChannel = <Method extends AppMethod>(method: Method) =>
                `app.${method}` as `app.${Method}`;
            const projectsChannel = <Method extends ProjectsMethod>(
                method: Method,
            ) => `projects.${method}` as `projects.${Method}`;
            const editorInstallsChannel = <Method extends EditorInstallsMethod>(
                method: Method,
            ) => `editorInstalls.${method}` as `editorInstalls.${Method}`;
            const ipcSuccess = <Data>(data: Data): IpcSuccess<Data> => ({
                success: true,
                data,
            });

            ipcMain.removeHandler(appChannel('getUserPreferences'));
            ipcMain.handle(
                appChannel('getUserPreferences'),
                async () =>
                    ipcSuccess<AppResult<'getUserPreferences'>>(
                        injectedPreferences,
                    ),
            );

            ipcMain.removeHandler(appChannel('setUserPreferences'));
            ipcMain.handle(
                appChannel('setUserPreferences'),
                async (_, nextPrefs: UserPreferences) =>
                    ipcSuccess<AppResult<'setUserPreferences'>>(nextPrefs),
            );

            ipcMain.removeHandler(projectsChannel('getProjectsDetails'));
            ipcMain.handle(
                projectsChannel('getProjectsDetails'),
                async () =>
                    ipcSuccess<ProjectsResult<'getProjectsDetails'>>(
                        normalizedProjects,
                    ),
            );

            ipcMain.removeHandler(projectsChannel('checkAllProjectsValid'));
            ipcMain.handle(
                projectsChannel('checkAllProjectsValid'),
                async () =>
                    ipcSuccess<ProjectsResult<'checkAllProjectsValid'>>(
                        normalizedProjects,
                    ),
            );

            ipcMain.removeHandler(projectsChannel('checkProjectValid'));
            ipcMain.handle(
                projectsChannel('checkProjectValid'),
                async (_, project: ProjectDetails) =>
                    ipcSuccess<ProjectsResult<'checkProjectValid'>>({
                        ...project,
                        release: {
                            ...project.release,
                            valid: project.release.valid ?? true,
                        },
                        valid: project.valid ?? true,
                    }),
            );

            ipcMain.removeHandler(projectsChannel('getProjectGodotName'));
            ipcMain.handle(
                projectsChannel('getProjectGodotName'),
                async (_, project: ProjectDetails) => {
                    const matchingProject = normalizedProjects.find(
                        (candidate) => candidate.path === project.path,
                    );
                    return ipcSuccess<ProjectsResult<'getProjectGodotName'>>(
                        matchingProject?.name ?? null,
                    );
                },
            );

            ipcMain.removeHandler(
                editorInstallsChannel('getInstalledEditors'),
            );
            ipcMain.handle(
                editorInstallsChannel('getInstalledEditors'),
                async () =>
                    ipcSuccess<
                        EditorInstallsResult<'getInstalledEditors'>
                    >(
                        normalizedInstalledReleases,
                    ),
            );

            ipcMain.removeHandler(
                editorInstallsChannel('revalidateInstalledEditors'),
            );
            ipcMain.handle(
                editorInstallsChannel('revalidateInstalledEditors'),
                async () =>
                    ipcSuccess<
                        EditorInstallsResult<'revalidateInstalledEditors'>
                    >(
                        normalizedInstalledReleases,
                    ),
            );

            ipcMain.removeHandler(appChannel('getAvailableReleases'));
            ipcMain.handle(appChannel('getAvailableReleases'), async () =>
                ipcSuccess<AppResult<'getAvailableReleases'>>({
                    releases: injectedAvailableReleases,
                }),
            );

            ipcMain.removeHandler(appChannel('getAvailablePrereleases'));
            ipcMain.handle(appChannel('getAvailablePrereleases'), async () =>
                ipcSuccess<AppResult<'getAvailablePrereleases'>>({
                    releases: injectedAvailablePrereleases,
                }),
            );

            ipcMain.removeHandler('editorCatalog.getCatalog');
            ipcMain.handle('editorCatalog.getCatalog', async () =>
                ipcSuccess(injectedEditorCatalog),
            );

            ipcMain.removeHandler('editorCatalog.getReleaseById');
            ipcMain.handle(
                'editorCatalog.getReleaseById',
                async (_, id: string) =>
                    ipcSuccess(
                        injectedEditorCatalog.releases.find(
                            (release) => release.id === id,
                        ) ?? null,
                    ),
            );

            ipcMain.removeHandler('editorCatalog.refreshCatalog');
            ipcMain.handle('editorCatalog.refreshCatalog', async () =>
                ipcSuccess(injectedEditorCatalog),
            );

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
            injectedEditorCatalog: editorCatalog,
        },
    );
}

export async function stubCodeEditorIntegrationSettings(
    electronApp: ElectronApplication,
    settings: CodeEditorIntegrationSettings[],
) {
    await electronApp.evaluate(
        (
            { ipcMain },
            injectedSettings: CodeEditorIntegrationSettings[],
        ) => {
            const channel = 'codeEditorIntegration.listIntegrationSettings';
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, async () => ({
                success: true,
                data: injectedSettings,
            }));
        },
        settings,
    );
}
export async function stubProjectLaunchResult(
    electronApp: ElectronApplication,
    result: LaunchProjectResult,
) {
    await electronApp.evaluate(
        ({ ipcMain }, injectedResult: LaunchProjectResult) => {
            const channel = 'projects.launchProject';
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, async () => ({
                success: true,
                data: injectedResult,
            }));
        },
        result,
    );
}

/**
 * Stubs the GitHub owner routes available to Create Project publishing.
 *
 * @param electronApp - Electron app whose bridge handler should be replaced.
 * @param result - Deterministic renderer-safe owner target result.
 * @returns A promise that ends when the handler is ready.
 */
export async function stubCreateProjectPublicationTargets(
    electronApp: ElectronApplication,
    result: ListCreateProjectPublicationTargetsResult,
): Promise<void> {
    await electronApp.evaluate(
        (
            { ipcMain },
            injectedResult: ListCreateProjectPublicationTargetsResult,
        ) => {
            const channel = 'projects.listCreateProjectPublicationTargets';
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, async () => ({
                success: true,
                data: injectedResult,
            }));
        },
        result,
    );
}

/**
 * Stubs the cautious repository-name availability result used by Create Project.
 *
 * @param electronApp - Electron app whose bridge handler should be replaced.
 * @param result - Deterministic renderer-safe availability result.
 * @returns A promise that ends when the handler is ready.
 */
export async function stubCreateProjectRepositoryNameAvailability(
    electronApp: ElectronApplication,
    result: ProjectsResult<'checkCreateProjectRepositoryNameAvailability'>,
): Promise<void> {
    await electronApp.evaluate(
        (
            { ipcMain },
            injectedResult: ProjectsResult<'checkCreateProjectRepositoryNameAvailability'>,
        ) => {
            const channel =
                'projects.checkCreateProjectRepositoryNameAvailability';
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, async () => ({
                success: true,
                data: injectedResult,
            }));
        },
        result,
    );
}

/**
 * Stubs one complete Create Project result without touching the filesystem.
 *
 * @param electronApp - Electron app whose bridge handler should be replaced.
 * @param result - Deterministic renderer-safe creation result.
 * @returns A promise that ends when the handler is ready.
 */
export async function stubCreateProjectResult(
    electronApp: ElectronApplication,
    result: CreateProjectResult,
): Promise<void> {
    await electronApp.evaluate(
        ({ ipcMain }, injectedResult: CreateProjectResult) => {
            const channel = 'projects.createProject';
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, async () => ({
                success: true,
                data: injectedResult,
            }));
        },
        result,
    );
}

/**
 * Stubs sequential process-local Create Project publication retry results.
 *
 * @param electronApp - Electron app whose bridge handler should be replaced.
 * @param results - Deterministic renderer-safe retry results in call order.
 * @returns A promise that ends when the handler is ready.
 */
export async function stubRetryCreateProjectPublicationResults(
    electronApp: ElectronApplication,
    results: CreateProjectResult[],
): Promise<void> {
    await electronApp.evaluate(
        ({ ipcMain }, injectedResults: CreateProjectResult[]) => {
            const channel = 'projects.retryCreateProjectPublication';
            let index = 0;
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, async () => ({
                success: true,
                data: injectedResults[
                    Math.min(index++, injectedResults.length - 1)
                ],
            }));
        },
        results,
    );
}

/**
 * Stubs discarding a process-local Create Project publication attempt.
 *
 * @param electronApp - Electron app whose bridge handler should be replaced.
 * @returns A promise that ends when the discard handler is ready.
 */
export async function stubDiscardCreateProjectPublication(
    electronApp: ElectronApplication,
): Promise<void> {
    await electronApp.evaluate(({ ipcMain }) => {
        const channel = 'projects.discardCreateProjectPublication';
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, async () => ({
            success: true,
            data: undefined,
        }));
    });
}

/**
 * Stubs the effective Git identity shown in Project Settings.
 *
 * @param electronApp - The Electron app whose handler should be replaced.
 * @param result - Effective project identity result returned to the renderer.
 * @returns A promise that ends when the handler is ready.
 */
export async function stubProjectGitIdentity(
    electronApp: ElectronApplication,
    result: ProjectGitIdentityResult,
) {
    await electronApp.evaluate(
        ({ ipcMain }, injectedResult: ProjectGitIdentityResult) => {
            const channel = 'projects.getProjectGitIdentity';
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, async () => ({
                success: true,
                data: injectedResult,
            }));
        },
        result,
    );
}

/**
 * Stubs the global Git identity returned to Create Project.
 *
 * @param electronApp - The Electron app whose handler should be replaced.
 * @param identity - Global Git identity values returned to the renderer.
 * @returns A promise that ends when the handler is ready.
 */
export async function stubGlobalGitIdentity(
    electronApp: ElectronApplication,
    identity: GitIdentity,
) {
    await stubGitIdentitySettings(electronApp, {
        globalIdentity: identity,
        projectPreset: null,
    });
}

/**
 * Stubs the Git identity settings returned to Settings and Create Project.
 *
 * @param electronApp - The Electron app whose handlers should be replaced.
 * @param settings - Combined global identity and Launcher preset values.
 * @returns A promise that ends when both compatibility handlers are ready.
 */
export async function stubGitIdentitySettings(
    electronApp: ElectronApplication,
    settings: GitIdentitySettings,
) {
    await electronApp.evaluate(
        ({ ipcMain }, injectedSettings: GitIdentitySettings) => {
            const globalChannel = 'git.getGlobalIdentity';
            ipcMain.removeHandler(globalChannel);
            ipcMain.handle(globalChannel, async () => ({
                success: true,
                data: injectedSettings.globalIdentity,
            }));

            const settingsChannel = 'git.getIdentitySettings';
            ipcMain.removeHandler(settingsChannel);
            ipcMain.handle(settingsChannel, async () => ({
                success: true,
                data: injectedSettings,
            }));
        },
        settings,
    );
}

export async function stubProjectGitInitializationFailure(
    electronApp: ElectronApplication,
    error: string,
) {
    await electronApp.evaluate(({ ipcMain }, message: string) => {
        const channel = 'projects.initializeProjectGit';
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, async () => ({
            success: false,
            error: {
                type: 'Error',
                message,
            },
        }));
    }, error);
}

/**
 * Stubs a successful project Git initialization result.
 *
 * @param electronApp - The Electron app whose handler should be replaced.
 * @param result - Structured Git initialization result returned to the renderer.
 * @returns A promise that ends when the handler is ready.
 */
export async function stubProjectGitInitializationResult(
    electronApp: ElectronApplication,
    result: InitializeProjectGitResult,
) {
    await electronApp.evaluate(
        ({ ipcMain }, injectedResult: InitializeProjectGitResult) => {
            const channel = 'projects.initializeProjectGit';
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, async () => ({
                success: true,
                data: injectedResult,
            }));
        },
        result,
    );
}

export async function stubCodeEditorIntegrationRescan(
    electronApp: ElectronApplication,
    settings: CodeEditorIntegrationSettings,
    pending = false,
) {
    await electronApp.evaluate(
        (
            { ipcMain },
            injected: {
                settings: CodeEditorIntegrationSettings;
                pending: boolean;
            },
        ) => {
            const state = globalThis as typeof globalThis & {
                __docsCodeEditorRescanRelease?: () => void;
            };
            state.__docsCodeEditorRescanRelease = undefined;

            const channel = 'codeEditorIntegration.rescanIntegration';
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, async () => {
                if (injected.pending) {
                    await new Promise<void>((resolve) => {
                        state.__docsCodeEditorRescanRelease = resolve;
                    });
                }

                return {
                    success: true,
                    data: injected.settings,
                };
            });
        },
        { settings, pending },
    );
}

export async function releasePendingCodeEditorIntegrationRescan(
    electronApp: ElectronApplication,
) {
    await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __docsCodeEditorRescanRelease?: () => void;
        };
        const release = state.__docsCodeEditorRescanRelease;
        if (!release) {
            throw new Error('No pending code editor rescan was found.');
        }

        state.__docsCodeEditorRescanRelease = undefined;
        release();
    });
}

/**
 * Prepares the screenshot app with mocked launcher data.
 *
 * @param page - The Electron page to reload.
 * @param electronApp - The Electron app that owns the mocked handlers.
 * @param options - Optional data overrides for the screenshot state.
 * @returns A promise that ends when the mocked page is ready.
 */
export async function prepareAppWithStubbedData(
    page: ElectronPage,
    electronApp: ElectronApplication,
    options: StubbedAppDataOptions = {},
) {
    await stubCodeEditorIntegrationSettings(
        electronApp,
        options.codeEditorSettings ?? [SAMPLE_VSCODE_SETTINGS_AVAILABLE],
    );
    await stubProjectLaunchResult(
        electronApp,
        options.projectLaunchResult ?? { launched: true },
    );
    await retryCollectedElectronPromise(() =>
        stubAppData(
            electronApp,
            options.preferences ?? SAMPLE_PREFS,
            options.projects ?? SAMPLE_PROJECTS,
            options.installedReleases ?? SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
            options.availableReleases ?? SAMPLE_AVAILABLE_RELEASES,
            options.availablePrereleases ?? SAMPLE_AVAILABLE_PRERELEASES,
            options.catalogRefreshError,
        ),
    );
    await retryCollectedElectronPromise(() =>
        stubToolIntegrations(
            electronApp,
            options.toolIntegrations ?? DEFAULT_TOOL_INTEGRATIONS,
        ),
    );
    await retryCollectedElectronPromise(() =>
        stubGitLfsTrackingPolicy(
            electronApp,
            options.gitLfsTrackingPolicy ?? SAMPLE_GIT_LFS_TRACKING_POLICY,
        ),
    );
    await reloadScreenshotPage(page);
    await expect(page.getByTestId('btnProjects')).toBeVisible({
        timeout: 15000,
    });
    await focusElectronApp(electronApp);
    await setScreenshotViewport(page);
}

/**
 * Activates the Electron app and its launcher window for keyboard interaction.
 *
 * @param electronApp - The Electron app to activate.
 * @returns A promise that ends after the launcher window receives focus.
 */
async function focusElectronApp(
    electronApp: ElectronApplication,
): Promise<void> {
    await electronApp.evaluate(({ app, BrowserWindow }) => {
        app.focus({ steal: true });
        const launcherWindow = BrowserWindow.getAllWindows().find((window) =>
            window.webContents.getURL().startsWith('http://localhost:5123'),
        );
        launcherWindow?.focus();
        return true;
    });
}

/**
 * Retries an idempotent Electron fixture operation if Chromium collects it.
 *
 * @param operation - The fixture operation to run.
 * @returns A promise that ends after the operation succeeds.
 */
async function retryCollectedElectronPromise(
    operation: () => Promise<unknown>,
): Promise<void> {
    try {
        await operation();
    } catch (error) {
        if (
            !(error instanceof Error) ||
            !error.message.includes('Resulting promise was garbage collected')
        ) {
            throw error;
        }

        await operation();
    }
}

const ONBOARDING_SCREENSHOT_PATHS: Record<
    OnboardingScreenshotPlatform,
    { projectsLocation: string; editorLocation: string }
> = {
    win32: {
        projectsLocation: 'C:\\Users\\docs\\Godot\\Projects',
        editorLocation: 'C:\\Users\\docs\\Godot\\Editors',
    },
    darwin: {
        projectsLocation: '/Users/docs/Godot/Projects',
        editorLocation: '/Users/docs/Godot/Editors',
    },
    linux: {
        projectsLocation: '/home/docs/Godot/Projects',
        editorLocation: '/home/docs/Godot/Editors',
    },
};

export async function prepareOnboardingScreenshot(
    page: ElectronPage,
    electronApp: ElectronApplication,
    platform: OnboardingScreenshotPlatform,
    step: OnboardingScreenshotStep,
    trayAvailable = true,
) {
    const locations = ONBOARDING_SCREENSHOT_PATHS[platform];
    const preferences = createPreferences({
        first_run: true,
        projects_location: locations.projectsLocation,
        install_location: locations.editorLocation,
        windows_enable_symlinks: false,
        language: 'en',
    });

    await stubCodeEditorIntegrationSettings(electronApp, [
        {
            ...SAMPLE_VSCODE_SETTINGS_AVAILABLE,
            isDefault: true,
        },
    ]);
    await stubAppData(
        electronApp,
        preferences,
        SAMPLE_PROJECTS,
        SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
        SAMPLE_AVAILABLE_RELEASES,
        SAMPLE_AVAILABLE_PRERELEASES,
    );
    await electronApp.evaluate(
        (
            { ipcMain },
            injected: {
                platform: OnboardingScreenshotPlatform;
                locations: {
                    projectsLocation: string;
                    editorLocation: string;
                };
                trayAvailable: boolean;
            },
        ) => {
            const ipcSuccess = <Data>(data: Data) => ({
                success: true as const,
                data,
            });
            const handlers = {
                getPlatform: async () => ipcSuccess(injected.platform),
                getOnboardingRecommendedLocations: async () =>
                    ipcSuccess(injected.locations),
                getTrayAvailability: async () =>
                    ipcSuccess(injected.trayAvailable),
            };

            for (const [method, handler] of Object.entries(handlers)) {
                const channel = `app.${method}`;
                ipcMain.removeHandler(channel);
                ipcMain.handle(channel, handler);
            }
        },
        { platform, locations, trayAvailable },
    );
    await page.evaluate((onboardingStep) => {
        localStorage.setItem(
            'godot-launcher.onboarding.step',
            onboardingStep,
        );
    }, step);
    await reloadScreenshotPage(page);
    await expect(page.getByTestId('onboarding-step-heading')).toBeVisible({
        timeout: 15000,
    });
    await page.waitForTimeout(500);
    await page.locator('main').evaluate((element) => {
        element.scrollTo({ top: 0, left: 0 });
    });
}

export async function reloadScreenshotPage(page: ElectronPage) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await page.reload({ waitUntil: 'load', timeout: 15000 });
            return;
        } catch (error) {
            lastError = error;
            if (page.isClosed()) {
                throw error;
            }
            await new Promise((resolve) => {
                setTimeout(resolve, 500 * attempt);
            });
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

export function getInstallsView(page: ElectronPage) {
    return page
        .locator('section')
        .filter({ has: page.getByTestId('installsTitle') });
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

/**
 * Captures one canonical documentation screenshot and converts it to WebP.
 *
 * @param page - Electron page containing the prepared screenshot state.
 * @param testInfo - Playwright test metadata used to attach the output.
 * @param baseName - Filename without its extension.
 * @param description - Description shown for the Playwright attachment.
 * @param fullPage - Whether to capture all scrollable content or only the viewport.
 * @param preservePointer - Whether the prepared pointer-hover state should remain visible.
 */
export async function captureScreenshot(
    page: ElectronPage,
    testInfo: TestInfo,
    baseName: string,
    description: string,
    fullPage = true,
    preservePointer = false,
) {
    const outputDir = canonicalScreensDir;
    const pngPath = path.join(outputDir, `${baseName}.png`);
    const webpPath = path.join(outputDir, `${baseName}.webp`);
    await fs.mkdir(outputDir, { recursive: true });

    if (!preservePointer) {
        await page.mouse.move(0, 0);
    }

    await page.screenshot({
        path: pngPath,
        fullPage,
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
        .locator('[data-project-path]')
        .filter({ has: page.getByText(projectName, { exact: true }) })
        .first();
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
        const editorInstallsChannel = <Method extends EditorInstallsMethod>(
            method: Method,
        ) => `editorInstalls.${method}` as `editorInstalls.${Method}`;
        const ipcSuccess = <Data>(data: Data): IpcSuccess<Data> => ({
            success: true,
            data,
        });

        const channel = editorInstallsChannel('installEditor');
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, async (_, release: ReleaseSummary) =>
            ipcSuccess<EditorInstallsResult<'installEditor'>>({
                success: false,
                error: message,
                version: release.version,
            }),
        );
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
            const appChannel = <Method extends AppMethod>(method: Method) =>
                `app.${method}` as `app.${Method}`;
            const projectsChannel = <Method extends ProjectsMethod>(
                method: Method,
            ) => `projects.${method}` as `projects.${Method}`;
            const ipcSuccess = <Data>(data: Data): IpcSuccess<Data> => ({
                success: true,
                data,
            });

            const openFileDialogChannel = appChannel('openFileDialog');
            ipcMain.removeHandler(openFileDialogChannel);
            ipcMain.handle(openFileDialogChannel, async () =>
                ipcSuccess<AppResult<'openFileDialog'>>({
                    canceled: false,
                    filePaths: [projectPath],
                    bookmarks: [],
                }),
            );

            const addProjectChannel = projectsChannel('addProject');
            ipcMain.removeHandler(addProjectChannel);
            ipcMain.handle(addProjectChannel, async (_, path: string, options?: AddProjectOptions) => {
                if (options?.resolution === 'add_missing') {
                    const projectDirectory = path.replace(
                        /\/project\.godot$/i,
                        '',
                    );
                    const newProject: ProjectDetails = {
                        name: 'Imported Missing Editor Game',
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
                        codeEditorId: null,
                        withGit: true,
                        valid: false,
                        invalid_reason: 'missing_editor',
                    };

                    return ipcSuccess<ProjectsResult<'addProject'>>({
                        success: true,
                        projects: [newProject],
                        newProject,
                    });
                }

                return ipcSuccess<ProjectsResult<'addProject'>>({
                    success: false,
                    editorResolution: {
                        requested: {
                            kind: 'exact',
                            channel: 'official',
                            flavor: 'gdscript',
                            base_version: '4.6',
                            version: '4.6.3-stable',
                        },
                        fallback: fallbackRelease,
                        downloadable: {
                            match: 'exact',
                            version: '4.6.3-stable',
                            flavor: 'gdscript',
                            prerelease: false,
                        },
                    },
                });
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

export async function stubAddProjectRecoveredCodeEditorConfig(
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
            const appChannel = <Method extends AppMethod>(method: Method) =>
                `app.${method}` as `app.${Method}`;
            const projectsChannel = <Method extends ProjectsMethod>(
                method: Method,
            ) => `projects.${method}` as `projects.${Method}`;
            const ipcSuccess = <Data>(data: Data): IpcSuccess<Data> => ({
                success: true,
                data,
            });

            const openFileDialogChannel = appChannel('openFileDialog');
            ipcMain.removeHandler(openFileDialogChannel);
            ipcMain.handle(openFileDialogChannel, async () =>
                ipcSuccess<AppResult<'openFileDialog'>>({
                    canceled: false,
                    filePaths: [projectPath],
                    bookmarks: [],
                }),
            );

            const addProjectChannel = projectsChannel('addProject');
            ipcMain.removeHandler(addProjectChannel);
            ipcMain.handle(addProjectChannel, async () => {
                const projectDirectory = projectPath.replace(
                    /\/project\.godot$/i,
                    '',
                );
                const newProject: ProjectDetails = {
                    name: 'Recovered VS Code Config',
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
                    codeEditorId: 'vscode',
                    withGit: true,
                    valid: true,
                };
                const projects = [newProject];

                for (const win of BrowserWindow.getAllWindows()) {
                    const webContents = win.webContents as any;
                    webContents.__docsProjects = projects;
                    win.webContents.send('projects-updated', projects);
                }

                return ipcSuccess<ProjectsResult<'addProject'>>({
                    success: true,
                    projects,
                    newProject,
                    recoveredCodeEditorConfigFiles: [
                        '.vscode/settings.json.1712345678901.bad',
                        '.vscode/extensions.json.1712345678902.bad',
                    ],
                });
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
            const appChannel = <Method extends AppMethod>(method: Method) =>
                `app.${method}` as `app.${Method}`;
            const editorInstallsChannel = <Method extends EditorInstallsMethod>(
                method: Method,
            ) => `editorInstalls.${method}` as `editorInstalls.${Method}`;
            const ipcSuccess = <Data>(data: Data): IpcSuccess<Data> => ({
                success: true,
                data,
            });

            const openFileDialogChannel = appChannel('openFileDialog');
            ipcMain.removeHandler(openFileDialogChannel);
            ipcMain.handle(openFileDialogChannel, async () =>
                ipcSuccess<AppResult<'openFileDialog'>>({
                    canceled: false,
                    filePaths: [
                        '/Users/docs/Godot/Editors/StudioCustom47/godotlauncher-editor-manifest.json',
                    ],
                    bookmarks: [],
                }),
            );

            const registerChannel =
                editorInstallsChannel('registerCustomEditor');
            ipcMain.removeHandler(registerChannel);
            ipcMain.handle(
                registerChannel,
                async (
                    _,
                    _manifestPath: string,
                    options?: { replaceExisting?: boolean },
                ) => {
                    if (options?.replaceExisting) {
                        return ipcSuccess<
                            EditorInstallsResult<'registerCustomEditor'>
                        >({
                            success: true,
                            release: duplicateRelease,
                            releases: [duplicateRelease],
                        });
                    }

                    return ipcSuccess<
                        EditorInstallsResult<'registerCustomEditor'>
                    >({
                        success: false,
                        duplicate: duplicateRelease,
                    });
                },
            );
        },
        SAMPLE_CUSTOM_RELEASE,
    );
}

export async function stubToolIntegrations(
    electronApp: ElectronApplication,
    integrations: ToolIntegrationSummary[],
) {
    await electronApp.evaluate(
        ({ ipcMain }, injectedIntegrations: ToolIntegrationSummary[]) => {
        const ipcSuccess = <Data>(data: Data): IpcSuccess<Data> => ({
            success: true,
            data,
        });

            for (const method of ['listIntegrations', 'rescanIntegrations']) {
                const channel = `toolIntegration.${method}`;
                ipcMain.removeHandler(channel);
                ipcMain.handle(channel, async () =>
                    ipcSuccess(injectedIntegrations),
                );
            }

            for (const method of ['refreshIntegration', 'rescanIntegration']) {
                const channel = `toolIntegration.${method}`;
                ipcMain.removeHandler(channel);
                ipcMain.handle(channel, async (_, toolId: string) => {
                    const integration = injectedIntegrations.find(
                        (candidate) => candidate.id === toolId,
                    );
                    if (!integration) {
                        throw new Error(`Unknown tool integration: ${toolId}`);
                    }
                    return ipcSuccess(integration);
                });
            }
        },
        integrations,
    );
}

/**
 * Stubs the main-owned Git LFS policy used by Create Project.
 *
 * @param electronApp - Electron app whose bridge handler should be replaced.
 * @param policy - Deterministic tracking policy returned to the renderer.
 */
export async function stubGitLfsTrackingPolicy(
    electronApp: ElectronApplication,
    policy: GitLfsTrackingPolicyDescriptor,
): Promise<void> {
    await electronApp.evaluate(
        (
            { ipcMain },
            injectedPolicy: GitLfsTrackingPolicyDescriptor,
        ) => {
            ipcMain.removeHandler('gitLfs.getTrackingPolicy');
            ipcMain.handle('gitLfs.getTrackingPolicy', async () => ({
                success: true,
                data: injectedPolicy,
            }));
        },
        policy,
    );
}
