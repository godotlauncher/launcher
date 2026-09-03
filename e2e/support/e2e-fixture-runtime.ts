import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
    type ElectronApplication,
    expect,
} from '@playwright/test';
import type {
    AppBridge,
    CodeEditorIntegrationSettings,
    CreateProjectResult,
    GitIdentity,
    GitIdentitySettings,
    GitLfsTrackingPolicyDescriptor,
    EditorCatalogArchitecture,
    EditorCatalogPlatform,
    EditorCatalogRelease,
    EditorCatalogResult,
    EditorInstallsBridge,
    InstalledRelease,
    LaunchProjectResult,
    ListCreateProjectPublicationTargetsResult,
    ProjectDetails,
    ProjectsBridge,
    ReleaseSummary,
    ToolIntegrationSummary,
    UserPreferences,
} from '@shared/contracts';
import {
    createPreferences,
    DEFAULT_TOOL_INTEGRATIONS,
    SAMPLE_AVAILABLE_PRERELEASES,
    SAMPLE_AVAILABLE_RELEASES,
    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
    SAMPLE_GIT_LFS_TRACKING_POLICY,
    SAMPLE_PREFS,
    SAMPLE_PRERELEASE_CACHE_FILE,
    SAMPLE_PROJECTS,
    SAMPLE_RELEASES_CACHE_FILE,
    SAMPLE_VSCODE_SETTINGS_AVAILABLE,
} from './e2e-fixture-data';
import type {
    ElectronPage,
    OnboardingFixturePlatform,
    OnboardingFixtureStep,
    StubbedAppDataOptions,
    ThemeConfig,
} from './e2e-fixture.types';

const E2E_FIXTURE_MIN_WIDTH = 1024;
const E2E_FIXTURE_MIN_HEIGHT = 600;

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

const fixtureEditorPlatform: EditorCatalogPlatform =
    process.platform === 'win32' ||
    process.platform === 'darwin' ||
    process.platform === 'linux'
        ? process.platform
        : 'linux';
const fixtureEditorArchitecture: EditorCatalogArchitecture =
    process.arch === 'x64' ||
    process.arch === 'arm64' ||
    process.arch === 'ia32' ||
    process.arch === 'arm'
        ? process.arch
        : 'x64';

/**
 * Creates catalog data from the release fixtures used by E2E tests.
 *
 * @param availableReleases - Releases from the stable provider.
 * @param availablePrereleases - Releases from the prerelease provider.
 * @param refreshError - An optional mocked provider refresh error.
 * @returns Catalog data for the dedicated editor catalog bridge.
 */
function createFixtureEditorCatalog(
    availableReleases: ReleaseSummary[],
    availablePrereleases: ReleaseSummary[],
    refreshError?: string,
): EditorCatalogResult {
    const catalog = createFixtureEditorCatalogFile(
        availableReleases,
        availablePrereleases,
    );

    return {
        releases: Object.values(catalog.providers).flatMap(
            (provider) => provider.releases,
        ),
        providers: [
            {
                id: 'official-stable',
                lastFetchedAt:
                    catalog.providers['official-stable'].lastFetchedAt,
                isStale: false,
                ...(refreshError ? { refreshError } : {}),
            },
            {
                id: 'official-prerelease',
                lastFetchedAt:
                    catalog.providers['official-prerelease'].lastFetchedAt,
                isStale: false,
            },
        ],
    };
}

type FixtureEditorCatalogFile = {
    schemaVersion: 1;
    providers: Record<
        'official-stable' | 'official-prerelease',
        {
            integrityMetadataRefreshed: true;
            lastFetchedAt: number;
            lastPublishedAt: string | null;
            releases: EditorCatalogRelease[];
        }
    >;
};

/**
 * Creates a fresh on-disk editor catalogue from deterministic release fixtures.
 *
 * @param availableReleases - Stable releases for the catalogue.
 * @param availablePrereleases - Prereleases for the catalogue.
 * @returns A valid editor catalogue cache file.
 */
function createFixtureEditorCatalogFile(
    availableReleases: ReleaseSummary[],
    availablePrereleases: ReleaseSummary[],
): FixtureEditorCatalogFile {
    const lastFetchedAt = Date.now();
    /**
     * Maps one fixture provider into its persisted catalogue state.
     *
     * @param releases - Releases supplied by the provider fixture.
     * @param providerId - Identifier of the persisted provider.
     * @param providerPrerelease - Whether the provider serves prereleases.
     * @returns A fresh persisted provider state.
     */
    const createProvider = (
        releases: ReleaseSummary[],
        providerId: 'official-stable' | 'official-prerelease',
        providerPrerelease: boolean,
    ) => {
        const mappedReleases = releases.map((release, releaseIndex) =>
            createFixtureEditorCatalogRelease(
                release,
                releaseIndex,
                providerId,
                providerPrerelease,
            ),
        );

        return {
            integrityMetadataRefreshed: true as const,
            lastFetchedAt,
            lastPublishedAt: mappedReleases[0]?.publishedAt ?? null,
            releases: mappedReleases,
        };
    };

    return {
        schemaVersion: 1,
        providers: {
            'official-stable': createProvider(
                availableReleases,
                'official-stable',
                false,
            ),
            'official-prerelease': createProvider(
                availablePrereleases,
                'official-prerelease',
                true,
            ),
        },
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
function createFixtureEditorCatalogRelease(
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
                    platform: fixtureEditorPlatform,
                    architecture: fixtureEditorArchitecture,
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

/**
 * Writes JSON fixture data, creating its parent directory when required.
 *
 * @param file - Destination file path.
 * @param data - Value to serialise as JSON.
 * @returns A promise that resolves after the file is written.
 */
export async function writeJson(file: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Seeds an isolated home directory with deterministic Launcher data.
 *
 * @param homeDir - Isolated home directory to populate.
 * @returns A promise that resolves after all fixture files are written.
 */
export async function seedLauncherData(homeDir: string): Promise<void> {
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
    await writeJson(
        path.join(configDir, 'editor-catalog.json'),
        createFixtureEditorCatalogFile(
            SAMPLE_AVAILABLE_RELEASES,
            SAMPLE_AVAILABLE_PRERELEASES,
        ),
    );
    await writeJson(path.join(configDir, 'prefs.json'), SAMPLE_PREFS);
}

/**
 * Creates and seeds an isolated home directory for an Electron E2E run.
 *
 * @returns The path to the seeded temporary home directory.
 */
export async function createFixtureHome(): Promise<string> {
    const tempHome = await fs.mkdtemp(
        path.join(os.tmpdir(), 'gd-launcher-e2e-'),
    );
    await seedLauncherData(tempHome);
    return tempHome;
}

/**
 * Applies a selected application theme through the visible settings controls.
 *
 * @param page - Electron page containing the Launcher UI.
 * @param theme - Theme configuration to apply.
 * @returns A promise that resolves after returning to Projects.
 */
export async function applyTheme(
    page: ElectronPage,
    theme: ThemeConfig,
): Promise<void> {
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

/**
 * Installs the decorator-name shim required by main-process fixture handlers.
 *
 * @param electronApp - Electron application receiving the shim.
 * @returns A promise that resolves after the shim is installed.
 */
async function ensureMainProcessNameHelperShim(
    electronApp: ElectronApplication,
): Promise<void> {
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
 * Stubs launcher data requests for one E2E fixture state.
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
    const editorCatalog = createFixtureEditorCatalog(
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
                webContents.__e2eFixtureProjects = normalizedProjects;
                webContents.__e2eFixtureInstalledReleases =
                    normalizedInstalledReleases;

                if (webContents.__e2eFixturePatchedSend) {
                    continue;
                }

                const originalSend = webContents.send.bind(webContents);
                webContents.__e2eFixturePatchedSend = true;
                webContents.send = (
                    channel: string,
                    payload: unknown,
                    ...args: unknown[]
                ) => {
                    if (channel === 'projects-updated') {
                        return originalSend(
                            channel,
                            webContents.__e2eFixtureProjects ?? payload,
                            ...args,
                        );
                    }
                    if (channel === 'releases-updated') {
                        return originalSend(
                            channel,
                            webContents.__e2eFixtureInstalledReleases ?? payload,
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

/**
 * Replaces code-editor integration settings returned through the bridge.
 *
 * @param electronApp - Electron application whose handler is replaced.
 * @param settings - Integration settings returned to the renderer.
 * @returns A promise that resolves after the handler is ready.
 */
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
/**
 * Replaces the Project launch result returned through the bridge.
 *
 * @param electronApp - Electron application whose handler is replaced.
 * @param result - Launch result returned to the renderer.
 * @returns A promise that resolves after the handler is ready.
 */
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
 * Stubs the repository inspection used before Create Project begins.
 *
 * @param electronApp - Electron app whose bridge handler should be replaced.
 * @param result - Deterministic repository inspection result.
 * @returns A promise that ends when the handler is ready.
 */
export async function stubCreateProjectRepositoryInspection(
    electronApp: ElectronApplication,
    result: ProjectsResult<'inspectCreateProjectRepository'>,
): Promise<void> {
    await electronApp.evaluate(
        (
            { ipcMain },
            injectedResult: ProjectsResult<'inspectCreateProjectRepository'>,
        ) => {
            const channel = 'projects.inspectCreateProjectRepository';
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
 * Stubs the global Git identity returned to Create Project.
 *
 * @param electronApp - Electron app whose bridge handler should be replaced.
 * @param identity - Git identity returned to the renderer.
 * @returns A promise that resolves after the handlers are ready.
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
 * Prepares the application with deterministic fixture handlers and data.
 *
 * @param page - Electron page to reload after fixture handlers are installed.
 * @param electronApp - Electron application whose handlers are replaced.
 * @param options - Optional fixture data overrides.
 * @returns A promise that resolves after the fixture app is ready.
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
    await reloadE2eFixturePage(page);
    await expect(page.getByTestId('btnProjects')).toBeVisible({
        timeout: 15000,
    });
    await focusElectronApp(electronApp);
    await setE2eFixtureViewport(page);
}

/**
 * Sets the running Electron app language through the user-facing selector.
 *
 * @param page - Electron page whose language should change.
 * @param languageName - Stable native language name shown in the selector.
 * @param returnToProjects - Whether to restore the Projects route afterwards.
 * @returns A promise that ends when the selected language is active.
 */
export async function setAppLanguage(
    page: ElectronPage,
    languageName: string,
    returnToProjects = true,
): Promise<void> {
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabAppearance').click();
    const languageSelector = page.getByTestId('selectLanguage');
    await expect(languageSelector).toBeVisible();

    if (!(await languageSelector.innerText()).includes(languageName)) {
        await languageSelector.click();
        await page
            .getByRole('option', { name: languageName, exact: true })
            .click();
        await expect(languageSelector).toContainText(languageName);
    }

    if (returnToProjects) {
        await page.getByTestId('btnProjects').click();
    }
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

const ONBOARDING_FIXTURE_PATHS: Record<
    OnboardingFixturePlatform,
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

/**
 * Prepares the onboarding flow with deterministic fixture data and platform state.
 *
 * @param page - Electron page containing the Launcher UI.
 * @param electronApp - Electron application whose handlers are replaced.
 * @param platform - Platform reported to the onboarding flow.
 * @param step - Onboarding step restored before the reload.
 * @param trayAvailable - Whether the fixture reports a system tray.
 * @returns A promise that resolves when the requested onboarding step is visible.
 */
export async function prepareOnboardingFixture(
    page: ElectronPage,
    electronApp: ElectronApplication,
    platform: OnboardingFixturePlatform,
    step: OnboardingFixtureStep,
    trayAvailable = true,
) {
    const locations = ONBOARDING_FIXTURE_PATHS[platform];
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
                platform: OnboardingFixturePlatform;
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
    await reloadE2eFixturePage(page);
    await expect(page.getByTestId('onboarding-step-heading')).toBeVisible({
        timeout: 15000,
    });
    await page.waitForTimeout(500);
    await page.locator('main').evaluate((element) => {
        element.scrollTo({ top: 0, left: 0 });
    });
}

/**
 * Reloads an Electron page, retrying the transient Chromium collection error.
 *
 * @param page - Electron page to reload.
 * @returns A promise that resolves once the page has loaded.
 */
export async function reloadE2eFixturePage(page: ElectronPage): Promise<void> {
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

/**
 * Ensures that the primary navigation is available after fixture setup.
 *
 * @param page - Electron page containing the Launcher UI.
 * @param electronApp - Electron application whose handlers are replaced.
 * @returns A promise that resolves once navigation is visible.
 */
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

/**
 * Applies the minimum supported Launcher viewport for deterministic E2E flows.
 *
 * @param page - Electron page to resize.
 * @param height - Requested viewport height.
 * @returns A promise that resolves after the viewport is updated.
 */
async function setE2eFixtureViewport(
    page: ElectronPage,
    height = E2E_FIXTURE_MIN_HEIGHT,
): Promise<void> {
    await page.setViewportSize({
        width: E2E_FIXTURE_MIN_WIDTH,
        height: Math.max(E2E_FIXTURE_MIN_HEIGHT, height),
    });
}

/**
 * Replaces tool-integration bridge handlers with deterministic fixture data.
 *
 * @param electronApp - Electron application whose handlers are replaced.
 * @param integrations - Integration summaries returned to the renderer.
 * @returns A promise that resolves after the handlers are ready.
 */
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
 * @returns A promise that resolves after the handler is ready.
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
/**
 * Replaces the global and configured Git identity bridge handlers.
 *
 * @param electronApp - Electron application whose handlers are replaced.
 * @param settings - Combined global identity and Launcher preset values.
 * @returns A promise that resolves after both handlers are ready.
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
