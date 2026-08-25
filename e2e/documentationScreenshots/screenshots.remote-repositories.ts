import { type ElectronApplication, expect } from '@playwright/test';
import type {
    AppIntegrationSummary,
    RemoteDiscoveredProject,
    RemoteProjectImportResult,
} from '@shared/contracts';
import { applyTheme, prepareAppWithStubbedData } from './runtime';
import {
    DEFAULT_TOOL_INTEGRATIONS,
    SAMPLE_PROJECTS,
    TOOL_INTEGRATIONS_NO_GIT,
} from './sampleData';
import type { ElectronPage, ScreenshotConfig, ThemeConfig } from './types';

const CONNECTED_GITHUB: AppIntegrationSummary = {
    id: 'github',
    displayName: 'GitHub',
    state: 'connected',
    connectionStage: null,
    connectionOptions: [],
    connections: [
        {
            id: 'connection-username123',
            accountLogin: 'username123',
            accountDisplayName: null,
            state: 'connected',
            accessTargets: [
                {
                    id: 'target-godot-launcher',
                    login: 'godotlauncher',
                    type: 'organization',
                    availability: 'available',
                },
                {
                    id: 'target-username123',
                    login: 'username123',
                    type: 'user',
                    availability: 'available',
                },
                {
                    id: 'target-archive',
                    login: 'archived-studio',
                    type: 'organization',
                    availability: 'unavailable',
                },
            ],
        },
    ],
};

const DISCONNECTED_GITHUB: AppIntegrationSummary = {
    id: 'github',
    displayName: 'GitHub',
    state: 'not-connected',
    connectionStage: null,
    connections: [],
    connectionOptions: [],
};

const CHOOSING_GITHUB: AppIntegrationSummary = {
    id: 'github',
    displayName: 'GitHub',
    state: 'selection-required',
    connectionStage: 'choosing',
    connections: [],
    connectionOptions: [
        {
            id: 'option-godot-launcher',
            login: 'godotlauncher',
            type: 'organization',
        },
        {
            id: 'option-username123',
            login: 'username123',
            type: 'user',
        },
    ],
};

const DISCOVERED_PROJECTS: RemoteDiscoveredProject[] = [
    {
        name: 'Pixel Workshop',
        relativePath: '.',
        projectFilePath:
            '/Users/docs/Godot/Projects/pixel-workshop/project.godot',
        detectedEditor: {
            kind: 'stable-base',
            channel: 'official',
            flavor: 'gdscript',
            baseVersion: '4.4',
        },
    },
    {
        name: 'Platformer Demo',
        relativePath: 'examples/platformer',
        projectFilePath:
            '/Users/docs/Godot/Projects/pixel-workshop/examples/platformer/project.godot',
        detectedEditor: {
            kind: 'exact',
            channel: 'official',
            flavor: 'dotnet',
            baseVersion: '4.3',
            version: '4.3.2-stable',
        },
    },
    {
        name: 'Test Fixture',
        relativePath: 'tests/fixtures/sample-project',
        projectFilePath:
            '/Users/docs/Godot/Projects/pixel-workshop/tests/fixtures/sample-project/project.godot',
        detectedEditor: null,
    },
];

const MIXED_OUTCOME_PROJECTS: RemoteDiscoveredProject[] = [
    {
        name: 'My Awesome Game',
        relativePath: '.',
        projectFilePath:
            '/Users/docs/Godot/Projects/pixel-workshop/project.godot',
        detectedEditor: null,
    },
    {
        name: 'Pixel Workshop',
        relativePath: 'games/pixel-workshop',
        projectFilePath:
            '/Users/docs/Godot/Projects/pixel-workshop/games/pixel-workshop/project.godot',
        detectedEditor: null,
    },
    {
        name: 'Broken Demo',
        relativePath: 'examples/broken',
        projectFilePath:
            '/Users/docs/Godot/Projects/pixel-workshop/examples/broken/project.godot',
        detectedEditor: null,
    },
];

/**
 * Installs deterministic handlers for every GitHub connection action.
 *
 * @param electronApp - Electron app whose handlers are replaced.
 * @param integration - Renderer-safe GitHub state returned by every handler.
 * @returns A promise that ends when every handler is installed.
 */
async function stubAppIntegrations(
    electronApp: ElectronApplication,
    integration: AppIntegrationSummary,
): Promise<void> {
    await electronApp.evaluate(
        ({ ipcMain }, injectedIntegration: AppIntegrationSummary) => {
            const methods = [
                'listIntegrations',
                'connect',
                'finishConnections',
                'installConnection',
                'cancel',
                'reconnect',
                'refresh',
                'manageAccess',
                'disconnect',
            ];
            for (const method of methods) {
                const channel = `appIntegrations.${method}`;
                ipcMain.removeHandler(channel);
                ipcMain.handle(channel, async () => ({
                    success: true,
                    data:
                        method === 'listIntegrations'
                            ? [injectedIntegration]
                            : { ok: true, integration: injectedIntegration },
                }));
            }
        },
        integration,
    );
}

/**
 * Opens the Connections settings tab with one deterministic GitHub state.
 *
 * @param page - Electron renderer page to drive.
 * @param electronApp - Electron app whose handlers are replaced.
 * @param theme - Theme applied before the fixture reload.
 * @param integration - GitHub state to present.
 * @returns A promise that ends when the Connections card is visible.
 */
async function openConnections(
    page: ElectronPage,
    electronApp: ElectronApplication,
    theme: ThemeConfig,
    integration: AppIntegrationSummary,
): Promise<void> {
    const existingDrawer = page.getByTestId('drawerBackdrop');
    if (await existingDrawer.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape');
        await expect(existingDrawer).not.toBeVisible();
    }
    await applyTheme(page, theme);
    await stubAppIntegrations(electronApp, integration);
    await prepareAppWithStubbedData(page, electronApp);
    await page.getByTestId('btnSettings').click();
    await page.getByTestId('tabConnections').click();
    await expect(page.getByTestId('app-integration-github')).toBeVisible({
        timeout: 10_000,
    });
    await page.waitForTimeout(400);
}

/**
 * Closes an open documentation drawer before the next screenshot state.
 *
 * @param page - Electron renderer page to drive.
 * @returns A promise that ends when no drawer is visible.
 */
async function closeDrawer(page: ElectronPage): Promise<void> {
    const drawer = page.getByTestId('drawerBackdrop');
    if (await drawer.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape');
        await expect(drawer).not.toBeVisible();
    }
}

/**
 * Waits for the GitHub drawer to finish its opening animation.
 *
 * @param page - Electron renderer page containing the drawer.
 * @returns A promise that ends after the drawer reaches its final position.
 */
async function waitForOpenDrawer(page: ElectronPage): Promise<void> {
    const drawer = page.getByRole('dialog', { name: 'GitHub connections' });
    await expect(drawer).toBeVisible();
    await drawer.evaluate(async (element) => {
        await Promise.all(
            element
                .getAnimations({ subtree: true })
                .map((animation) => animation.finished.catch(() => undefined)),
        );
    });
}

/**
 * Installs deterministic public URL, repository, clone, and add handlers.
 *
 * @param electronApp - Electron app whose handlers are replaced.
 * @param result - Clone and discovery result returned to the renderer.
 * @param pendingProgress - Whether the clone stays pending for progress capture.
 * @returns A promise that ends when every handler is installed.
 */
async function stubRemoteRepositoryImport(
    electronApp: ElectronApplication,
    result: RemoteProjectImportResult,
    pendingProgress = false,
): Promise<void> {
    await electronApp.evaluate(
        (
            { BrowserWindow, ipcMain },
            injected: {
                result: RemoteProjectImportResult;
                pendingProgress: boolean;
            },
        ) => {
            ipcMain.removeHandler('projects.inspectPublicGitSource');
            ipcMain.handle('projects.inspectPublicGitSource', async () => ({
                success: true,
                data: {
                    ok: true,
                    canonicalUrl:
                        'https://github.com/godotlauncher/pixel-workshop.git',
                    suggestedDirectoryName: 'pixel-workshop',
                },
            }));
            ipcMain.removeHandler('projects.listConnectedRepositories');
            ipcMain.handle('projects.listConnectedRepositories', async () => ({
                success: true,
                data: {
                    ok: true,
                    page: {
                        repositories: [
                            {
                                repositoryRef: 'repo-pixel-workshop',
                                providerId: 'github',
                                owner: 'godotlauncher',
                                name: 'pixel-workshop',
                                visibility: 'private',
                                alreadyImported: false,
                            },
                            {
                                repositoryRef: 'repo-launcher',
                                providerId: 'github',
                                owner: 'godotlauncher',
                                name: 'launcher',
                                visibility: 'public',
                                alreadyImported: true,
                            },
                            {
                                repositoryRef: 'repo-prototypes',
                                providerId: 'github',
                                owner: 'username123',
                                name: 'godot-prototypes',
                                visibility: 'private',
                                alreadyImported: false,
                            },
                        ],
                        nextCursor: 'next-page',
                    },
                },
            }));
            ipcMain.removeHandler('projects.importRemoteProject');
            ipcMain.handle('projects.importRemoteProject', async () => {
                if (!injected.pendingProgress) {
                    return { success: true, data: injected.result };
                }
                const window = BrowserWindow.getAllWindows().find((candidate) =>
                    candidate.webContents
                        .getURL()
                        .startsWith('http://localhost:5123'),
                );
                setTimeout(() => {
                    window?.webContents.send('remote-project-import-progress', {
                        jobId: 'docs-clone-job',
                        stage: 'cloning',
                        canCancel: true,
                        percent: 58,
                    });
                }, 100);
                return await new Promise(() => undefined);
            });
            ipcMain.removeHandler('projects.cancelRemoteProjectImport');
            ipcMain.handle(
                'projects.cancelRemoteProjectImport',
                async () => ({
                    success: true,
                    data: { jobId: 'docs-clone-job', status: 'cancelling' },
                }),
            );
            ipcMain.removeHandler('projects.addProject');
            ipcMain.handle(
                'projects.addProject',
                async (_event, projectFilePath: string) => ({
                    success: true,
                    data: projectFilePath.includes('/examples/broken/')
                        ? { success: false, error: 'Invalid project metadata' }
                        : { success: true },
                }),
            );
        },
        { result, pendingProgress },
    );
}

/**
 * Installs a deterministic submodule initialisation flow for screenshot states.
 *
 * @param electronApp - Electron app whose handler is replaced.
 * @param outcome - Whether initialisation stays active or stops with a failure.
 * @returns A promise that ends when the handler is installed.
 */
async function stubRemoteProjectSubmodules(
    electronApp: ElectronApplication,
    outcome: 'pending' | 'failure',
): Promise<void> {
    await electronApp.evaluate(
        ({ BrowserWindow, ipcMain }, injectedOutcome) => {
            ipcMain.removeHandler(
                'projects.initialiseRemoteProjectSubmodules',
            );
            ipcMain.handle(
                'projects.initialiseRemoteProjectSubmodules',
                async (_event, jobId: string) => {
                    const window = BrowserWindow.getAllWindows().find(
                        (candidate) =>
                            candidate.webContents
                                .getURL()
                                .startsWith('http://localhost:5123'),
                    );
                    const publishActivity = (
                        delay: number,
                        activity: Record<string, string | number>,
                    ) => {
                        setTimeout(() => {
                            window?.webContents.send(
                                'remote-project-import-progress',
                                {
                                    jobId,
                                    stage: 'initialising-submodules',
                                    canCancel: true,
                                    activity,
                                },
                            );
                        }, delay);
                    };

                    publishActivity(20, { type: 'found', count: 2 });
                    publishActivity(40, {
                        type: 'validating',
                        path: 'addons/godot-cpp',
                    });
                    publishActivity(60, {
                        type: 'initialising',
                        path: 'addons/godot-cpp',
                    });
                    publishActivity(80, {
                        type: 'initialised',
                        path: 'addons/godot-cpp',
                    });
                    publishActivity(100, {
                        type: 'validating',
                        path: 'addons/private-extension',
                    });

                    if (injectedOutcome === 'pending') {
                        return await new Promise(() => undefined);
                    }

                    publishActivity(120, {
                        type: 'stopped',
                        path: 'addons/private-extension',
                    });
                    return await new Promise((resolve) => {
                        setTimeout(
                            () =>
                                resolve({
                                    success: true,
                                    data: {
                                        ok: false,
                                        jobId,
                                        reason: 'unsupported-submodule',
                                    },
                                }),
                            150,
                        );
                    });
                },
            );
        },
        outcome,
    );
}

/**
 * Makes the two screenshot projects request different downloadable editors.
 *
 * @param electronApp - Electron app whose project-add handler is replaced.
 * @returns A promise that ends when the handler is installed.
 */
async function stubRemoteMissingEditorPlan(
    electronApp: ElectronApplication,
): Promise<void> {
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('projects.addProject');
        ipcMain.handle(
            'projects.addProject',
            async (_event, projectFilePath: string) => {
                const dotnet = projectFilePath.includes('/examples/platformer/');
                const baseVersion = dotnet ? '4.3' : '4.4';
                return {
                    success: true,
                    data: {
                        success: false,
                        editorResolution: {
                            requested: {
                                kind: 'stable-base',
                                channel: 'official',
                                flavor: dotnet ? 'dotnet' : 'gdscript',
                                base_version: baseVersion,
                            },
                            downloadable: {
                                match: 'stable-base',
                                base_version: baseVersion,
                                flavor: dotnet ? 'dotnet' : 'gdscript',
                            },
                        },
                    },
                };
            },
        );
    });
}

/**
 * Opens one remote import source after refreshing its deterministic fixtures.
 *
 * @param page - Electron renderer page to drive.
 * @param electronApp - Electron app whose handlers are replaced.
 * @param theme - Screenshot theme to apply.
 * @param source - Remote source modal to open.
 * @param result - Clone and discovery result returned to the renderer.
 * @param pendingProgress - Whether the clone stays pending for progress capture.
 * @returns The visible remote import modal.
 */
async function openRemoteSource(
    page: ElectronPage,
    electronApp: ElectronApplication,
    theme: ThemeConfig,
    source: 'public' | 'github',
    result: RemoteProjectImportResult = {
        ok: true,
        jobId: 'docs-clone-job',
        repositoryPath: '/Users/docs/Godot/Projects/pixel-workshop',
        projects: DISCOVERED_PROJECTS,
        hasSubmodules: false,
    },
    pendingProgress = false,
): Promise<ReturnType<ElectronPage['getByRole']>> {
    await closeDrawer(page);
    await stubAppIntegrations(electronApp, DISCONNECTED_GITHUB);
    await stubRemoteRepositoryImport(electronApp, result, pendingProgress);
    await prepareAppWithStubbedData(page, electronApp, {
        toolIntegrations: DEFAULT_TOOL_INTEGRATIONS,
    });
    await applyTheme(page, theme);
    await page.getByTestId('btnProjects').click();
    await page.getByTestId('btnProjectAdd').click();
    await page
        .getByTestId(
            source === 'public'
                ? 'btnAddProjectPublicGit'
                : 'btnAddProjectGitHub',
        )
        .click();
    const modal = page.getByRole('dialog', {
        name:
            source === 'public'
                ? 'Clone public Git repository'
                : 'Import from GitHub',
    });
    await expect(modal).toBeVisible({ timeout: 10_000 });
    return modal;
}

/**
 * Advances the public repository workflow to the clone destination.
 *
 * @param page - Electron renderer page to drive.
 * @param electronApp - Electron app whose handlers are replaced.
 * @param theme - Screenshot theme to apply.
 * @param result - Optional clone and discovery result.
 * @param pendingProgress - Whether the clone stays pending for progress capture.
 * @returns The remote import modal on its destination step.
 */
async function openPublicDestination(
    page: ElectronPage,
    electronApp: ElectronApplication,
    theme: ThemeConfig,
    result?: RemoteProjectImportResult,
    pendingProgress = false,
) {
    const modal = await openRemoteSource(
        page,
        electronApp,
        theme,
        'public',
        result,
        pendingProgress,
    );
    await modal
        .getByTestId('inputPublicGitRepositoryUrl')
        .fill('https://github.com/godotlauncher/pixel-workshop.git');
    await modal.getByRole('button', { name: 'Continue' }).click();
    await expect(modal.getByText('Clone to')).toBeVisible();
    return modal;
}

export const REMOTE_REPOSITORY_SCREENSHOTS: ScreenshotConfig[] = [
    {
        fileBase: 'screen_settings_connections_disconnected',
        description: 'Connections settings with GitHub disconnected',
        navigate: (page, electronApp, theme) =>
            openConnections(page, electronApp, theme, DISCONNECTED_GITHUB),
    },
    {
        fileBase: 'screen_settings_connections_connected',
        description: 'Connections settings with GitHub connected',
        navigate: (page, electronApp, theme) =>
            openConnections(page, electronApp, theme, CONNECTED_GITHUB),
    },
    {
        fileBase: 'screen_settings_github_connections',
        description: 'GitHub connection management drawer',
        viewportHeight: 800,
        navigate: async (page, electronApp, theme) => {
            await openConnections(page, electronApp, theme, CONNECTED_GITHUB);
            await page
                .getByRole('button', { name: 'Manage GitHub connections' })
                .click();
            await expect(
                page.getByRole('dialog', { name: 'GitHub connections' }),
            ).toBeVisible();
            await waitForOpenDrawer(page);
        },
        cleanup: closeDrawer,
    },
    {
        fileBase: 'screen_settings_github_connection_selection',
        description: 'GitHub installation selection drawer',
        viewportHeight: 800,
        navigate: async (page, electronApp, theme) => {
            await openConnections(page, electronApp, theme, CHOOSING_GITHUB);
            await expect(
                page.getByRole('dialog', { name: 'GitHub connections' }),
            ).toContainText('Choose connections');
            await waitForOpenDrawer(page);
        },
        cleanup: closeDrawer,
    },
    {
        fileBase: 'screen_projects_add_source_menu',
        description: 'Add Project source menu with remote sources available',
        navigate: async (page, electronApp, theme) => {
            await closeDrawer(page);
            await stubAppIntegrations(electronApp, DISCONNECTED_GITHUB);
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectAdd').click();
            await expect(
                page.getByRole('dialog', { name: 'Add project from' }),
            ).toBeVisible();
        },
    },
    {
        fileBase: 'screen_projects_add_source_menu_git_unavailable',
        description: 'Add Project source menu with remote sources disabled',
        navigate: async (page, electronApp, theme) => {
            await closeDrawer(page);
            await stubAppIntegrations(electronApp, DISCONNECTED_GITHUB);
            await prepareAppWithStubbedData(page, electronApp, {
                toolIntegrations: TOOL_INTEGRATIONS_NO_GIT,
            });
            await applyTheme(page, theme);
            await page.getByTestId('btnProjects').click();
            await page.getByTestId('btnProjectAdd').click();
            await expect(page.getByTestId('btnAddProjectPublicGit')).toBeDisabled();
        },
    },
    {
        fileBase: 'screen_projects_clone_public_repository',
        description: 'Public Git repository URL entry',
        viewportHeight: 800,
        navigate: async (page, electronApp, theme) => {
            const modal = await openRemoteSource(
                page,
                electronApp,
                theme,
                'public',
            );
            await expect(
                modal.getByTestId('inputPublicGitRepositoryUrl'),
            ).toBeFocused();
        },
    },
    {
        fileBase: 'screen_projects_github_repository_selection',
        description: 'Connected GitHub repository selection',
        viewportHeight: 800,
        navigate: async (page, electronApp, theme) => {
            const modal = await openRemoteSource(
                page,
                electronApp,
                theme,
                'github',
            );
            await modal
                .getByRole('button', {
                    name: 'godotlauncher/pixel-workshop',
                })
                .click();
            await expect(
                modal.getByRole('button', {
                    name: 'godotlauncher/pixel-workshop',
                }),
            ).toHaveAttribute('aria-pressed', 'true');
        },
    },
    {
        fileBase: 'screen_projects_remote_clone_destination',
        description: 'Remote repository clone destination',
        viewportHeight: 800,
        navigate: async (page, electronApp, theme) => {
            await openPublicDestination(page, electronApp, theme);
        },
    },
    {
        fileBase: 'screen_projects_remote_clone_progress',
        description: 'Remote repository clone progress',
        viewportHeight: 800,
        navigate: async (page, electronApp, theme) => {
            const modal = await openPublicDestination(
                page,
                electronApp,
                theme,
                undefined,
                true,
            );
            await modal.getByRole('button', { name: 'Clone repository' }).click();
            await electronApp.evaluate(({ BrowserWindow }) => {
                const window = BrowserWindow.getAllWindows().find((candidate) =>
                    candidate.webContents
                        .getURL()
                        .startsWith('http://localhost:5123'),
                );
                window?.webContents.send('remote-project-import-progress', {
                    jobId: 'docs-clone-job',
                    stage: 'cloning',
                    canCancel: true,
                    percent: 58,
                });
            });
            await expect(
                modal.getByText('Cloning the repository...'),
            ).toBeVisible();
        },
    },
    {
        fileBase: 'screen_projects_remote_submodules_detected',
        description: 'Detected Git submodules before project review',
        viewportHeight: 800,
        navigate: async (page, electronApp, theme) => {
            const modal = await openPublicDestination(page, electronApp, theme, {
                ok: true,
                jobId: 'docs-clone-job',
                repositoryPath: '/Users/docs/Godot/Projects/pixel-workshop',
                projects: [],
                hasSubmodules: true,
            });
            await modal.getByRole('button', { name: 'Clone repository' }).click();
            await expect(
                modal.getByText('This repository uses Git submodules'),
            ).toBeVisible();
        },
    },
    {
        fileBase: 'screen_projects_remote_submodules_initialising',
        description: 'Public Git submodule initialisation activity',
        viewportHeight: 800,
        navigate: async (page, electronApp, theme) => {
            const modal = await openPublicDestination(page, electronApp, theme, {
                ok: true,
                jobId: 'docs-clone-job',
                repositoryPath: '/Users/docs/Godot/Projects/pixel-workshop',
                projects: [],
                hasSubmodules: true,
            });
            await stubRemoteProjectSubmodules(electronApp, 'pending');
            await modal.getByRole('button', { name: 'Clone repository' }).click();
            await modal.getByTestId('btnInitialiseSubmodules').click();
            await expect(
                modal.getByText('Validating addons/private-extension'),
            ).toBeVisible();
        },
    },
    {
        fileBase: 'screen_projects_remote_submodules_failed',
        description: 'Stopped Git submodule initialisation with recovery actions',
        viewportHeight: 800,
        navigate: async (page, electronApp, theme) => {
            const modal = await openPublicDestination(page, electronApp, theme, {
                ok: true,
                jobId: 'docs-clone-job',
                repositoryPath: '/Users/docs/Godot/Projects/pixel-workshop',
                projects: [],
                hasSubmodules: true,
            });
            await stubRemoteProjectSubmodules(electronApp, 'failure');
            await modal.getByRole('button', { name: 'Clone repository' }).click();
            await modal.getByTestId('btnInitialiseSubmodules').click();
            await expect(modal.getByRole('alert')).toBeVisible();
            await expect(
                modal.getByText('Stopped at addons/private-extension'),
            ).toBeVisible();
        },
    },
    {
        fileBase: 'screen_projects_remote_project_review',
        description: 'Discovered projects selection review',
        viewportHeight: 800,
        navigate: async (page, electronApp, theme) => {
            const modal = await openPublicDestination(page, electronApp, theme);
            await modal.getByRole('button', { name: 'Clone repository' }).click();
            await expect(modal.getByText('Choose projects to add')).toBeVisible();
            await modal.getByText('Test Fixture').locator('..').click();
            await expect(modal.getByRole('checkbox').nth(3)).not.toBeChecked();
        },
    },
    {
        fileBase: 'screen_projects_remote_editors_required',
        description: 'Grouped missing editors for a repository import',
        viewportHeight: 800,
        navigate: async (page, electronApp, theme) => {
            const modal = await openPublicDestination(page, electronApp, theme, {
                ok: true,
                jobId: 'docs-clone-job',
                repositoryPath: '/Users/docs/Godot/Projects/pixel-workshop',
                projects: DISCOVERED_PROJECTS.slice(0, 2),
                hasSubmodules: false,
            });
            await stubRemoteMissingEditorPlan(electronApp);
            await modal.getByRole('button', { name: 'Clone repository' }).click();
            await modal.getByTestId('btnAddDiscoveredProjects').click();
            await expect(modal.getByText('Editors required')).toBeVisible();
            await expect(
                modal.getByTestId('remoteProjectEditorPlan'),
            ).toContainText('Pixel Workshop');
            await expect(
                modal.getByTestId('remoteProjectEditorPlan'),
            ).toContainText('Platformer Demo');
        },
    },
    {
        fileBase: 'screen_projects_remote_no_projects',
        description: 'Cloned repository with no Godot projects discovered',
        viewportHeight: 800,
        navigate: async (page, electronApp, theme) => {
            const modal = await openPublicDestination(page, electronApp, theme, {
                ok: true,
                jobId: 'docs-clone-job',
                repositoryPath: '/Users/docs/Godot/Projects/pixel-workshop',
                projects: [],
                hasSubmodules: false,
            });
            await modal.getByRole('button', { name: 'Clone repository' }).click();
            await expect(
                modal.getByText(
                    'No valid Godot projects were found. The cloned repository has been kept.',
                ),
            ).toBeVisible();
        },
    },
    {
        fileBase: 'screen_projects_remote_import_complete',
        description: 'Remote project import with added, skipped, and failed results',
        viewportHeight: 800,
        navigate: async (page, electronApp, theme) => {
            const modal = await openPublicDestination(page, electronApp, theme, {
                ok: true,
                jobId: 'docs-clone-job',
                repositoryPath: '/Users/docs/Godot/Projects/pixel-workshop',
                projects: MIXED_OUTCOME_PROJECTS,
                hasSubmodules: false,
            });
            await modal.getByRole('button', { name: 'Clone repository' }).click();
            await modal.getByTestId('btnAddDiscoveredProjects').click();
            await expect(modal.getByText('Project import complete')).toBeVisible();
            await expect(modal.getByText(/Invalid project metadata/)).toBeVisible();
        },
    },
    {
        fileBase: 'screen_projects_remote_clone_preserved',
        description: 'Remote discovery failure with cloned repository preserved',
        viewportHeight: 800,
        navigate: async (page, electronApp, theme) => {
            const modal = await openPublicDestination(page, electronApp, theme, {
                ok: false,
                jobId: 'docs-clone-job',
                reason: 'discovery-limit-exceeded',
                repositoryPath: '/Users/docs/Godot/Projects/pixel-workshop',
            });
            await modal.getByRole('button', { name: 'Clone repository' }).click();
            await expect(modal.getByRole('alert')).toBeVisible();
            await expect(modal).toContainText(
                'The repository was cloned successfully and has been kept at this location.',
            );
        },
    },
];
