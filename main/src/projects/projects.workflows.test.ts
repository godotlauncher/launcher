import path from 'node:path';
import type {
    CodeEditorId,
    GitIdentity,
    LaunchProjectOptions,
    ProjectDetails,
    RenameProjectOptions,
} from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import type { TrayAvailabilityService } from '../services/tray-availability.service.js';
import type { GitService } from '../tool-integration/integrations/git/git.service.js';
import { JsonStoreConflictError } from '../utils/jsonStore.js';
import type { ProjectCreationService } from './project-creation.service.js';
import type { ProjectImportService } from './project-import.service.js';
import { ProjectsService } from './projects.service.js';
import type { ProjectsStore } from './projects.store.js';

const childProcessMocks = vi.hoisted(() => ({
    spawn: vi.fn(() => ({
        on: vi.fn(),
        unref: vi.fn(),
        stderr: null,
    })),
}));

const checksMocks = vi.hoisted(() => ({
    checkProjectHealth: vi.fn(async (project: ProjectDetails) => project),
    hasProjectHealthChanged: vi.fn(() => false),
}));

vi.mock('../checks.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../checks.js')>()),
    checkProjectHealth: checksMocks.checkProjectHealth,
    hasProjectHealthChanged: checksMocks.hasProjectHealthChanged,
}));

vi.mock('node:child_process', () => ({
    spawn: childProcessMocks.spawn,
}));

const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
    existsSync: fsMocks.existsSync,
    default: {
        existsSync: fsMocks.existsSync,
    },
}));

const platformMocks = vi.hoisted(() => ({
    getDefaultDirs: vi.fn(),
}));

vi.mock('../utils/platform.utils.js', () => platformMocks);

const projectUtilsMocks = vi.hoisted(() => ({
    getProjectsSnapshot: vi.fn(),
    getStoredProjectsList: vi.fn(),
    removeProjectFromList: vi.fn(),
    storeProjectsList: vi.fn(),
}));

const godotUtilsMocks = vi.hoisted(() => ({
    removeProjectEditor: vi.fn(),
    getProjectDefinition: vi.fn(),
    DEFAULT_PROJECT_DEFINITION: new Map(),
}));

vi.mock('../utils/godot.utils.js', () => godotUtilsMocks);

const godotProjectMocks = vi.hoisted(() => ({
    readGodotProjectName: vi.fn(),
    updateGodotProjectName: vi.fn(),
}));

vi.mock('../utils/godotProject.utils.js', () => godotProjectMocks);

const userPreferencesMocks = vi.hoisted(() => ({
    getUserPreferences: vi.fn(),
}));

vi.mock('../commands/userPreferences.js', () => userPreferencesMocks);

const pathResolverMocks = vi.hoisted(() => ({
    getAssetPath: vi.fn(),
}));

vi.mock('../pathResolver.js', () => pathResolverMocks);

const utilsMocks = vi.hoisted(() => ({
    ipcWebContentsSend: vi.fn(),
}));

vi.mock('../utils.js', () => utilsMocks);

const projectLauncherConfigMocks = vi.hoisted(() => ({
    writeProjectLauncherConfig: vi.fn(),
}));

vi.mock('../utils/projectLauncherConfig.utils.js', () => ({
    writeProjectLauncherConfig:
        projectLauncherConfigMocks.writeProjectLauncherConfig,
}));

const mainMocks = vi.hoisted(() => ({
    getMainWindow: vi.fn(),
}));

vi.mock('../mainWindow.js', () => mainMocks);

const trayHelperMocks = vi.hoisted(() => ({
    updateLinuxTray: vi.fn(),
}));

vi.mock('../helpers/tray.helper.js', () => trayHelperMocks);

vi.mock('../i18n/index.js', () => ({
    t: (key: string) => key,
}));

vi.mock('electron', () => ({
    Menu: {
        setApplicationMenu: vi.fn(),
        buildFromTemplate: vi.fn(),
    },
    app: {
        getAppPath: vi.fn(() => '/app/path'),
        isPackaged: false,
        getName: vi.fn(),
        getVersion: vi.fn(() => '1.0.0'),
        getLocale: vi.fn(),
        getPath: vi.fn(),
        on: vi.fn(),
        whenReady: vi.fn(),
        quit: vi.fn(),
        requestSingleInstanceLock: vi.fn(() => true),
        setActivationPolicy: vi.fn(),
        dock: {
            show: vi.fn(),
            hide: vi.fn(),
        },
    },
    BrowserWindow: vi.fn(),
    shell: {
        showItemInFolder: vi.fn(),
        openExternal: vi.fn(),
        openPath: vi.fn(),
    },
    dialog: {
        showOpenDialog: vi.fn(),
        showMessageBox: vi.fn(),
        showErrorBox: vi.fn(),
    },
}));

vi.mock('electron-log', () => ({
    default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('electron-updater', () => ({
    default: {
        autoUpdater: {
            on: vi.fn(),
            logger: null,
            channel: null,
            checkForUpdates: vi.fn(),
            checkForUpdatesAndNotify: vi.fn(),
            downloadUpdate: vi.fn(),
            quitAndInstall: vi.fn(),
            setFeedURL: vi.fn(),
            addAuthHeader: vi.fn(),
            isUpdaterActive: vi.fn(),
            currentVersion: '1.0.0',
        },
    },
    UpdateCheckResult: {},
}));

const { existsSync } = fsMocks;
const { getDefaultDirs } = platformMocks;
const { getProjectsSnapshot, removeProjectFromList, storeProjectsList } =
    projectUtilsMocks;
const { getProjectDefinition, removeProjectEditor } = godotUtilsMocks;
const { readGodotProjectName, updateGodotProjectName } = godotProjectMocks;
const { getUserPreferences } = userPreferencesMocks;
const { getAssetPath } = pathResolverMocks;
const { ipcWebContentsSend } = utilsMocks;
const { writeProjectLauncherConfig } = projectLauncherConfigMocks;
const { getMainWindow } = mainMocks;

const codeEditorIntegrationService = {
    assertIntegrationSelectable: vi.fn(),
    applyToProject: vi.fn(),
    disableForProject: vi.fn(),
    rescanIntegration: vi.fn(),
} as unknown as CodeEditorIntegrationService;

const integrationMocks = codeEditorIntegrationService as unknown as {
    assertIntegrationSelectable: ReturnType<typeof vi.fn>;
    applyToProject: ReturnType<typeof vi.fn>;
    disableForProject: ReturnType<typeof vi.fn>;
    rescanIntegration: ReturnType<typeof vi.fn>;
};

const gitService = {
    getIdentity: vi.fn(),
    getLocalIdentity: vi.fn(),
    init: vi.fn(),
    inspectRepository: vi.fn(),
    setIdentity: vi.fn(),
} as unknown as GitService;

const gitServiceMocks = gitService as unknown as {
    getIdentity: ReturnType<typeof vi.fn>;
    getLocalIdentity: ReturnType<typeof vi.fn>;
    init: ReturnType<typeof vi.fn>;
    inspectRepository: ReturnType<typeof vi.fn>;
    setIdentity: ReturnType<typeof vi.fn>;
};

const trayAvailabilityService = {
    isAvailable: vi.fn(async () => true),
};

const projectsStore = {
    list: vi.fn(async () => (await getProjectsSnapshot()).projects),
    update: vi.fn(
        async (
            mutator: (
                projects: ProjectDetails[],
            ) => ProjectDetails[] | Promise<ProjectDetails[]>,
        ) => {
            for (let attempt = 0; attempt < 2; attempt++) {
                const { projects, version } = await getProjectsSnapshot();
                const updated = await mutator(projects);
                if (updated === projects) {
                    return projects;
                }
                try {
                    return await storeProjectsList(
                        path.resolve(
                            getDefaultDirs().configDir,
                            'projects.json',
                        ),
                        updated,
                        { expectedVersion: version },
                    );
                } catch (error) {
                    if (
                        error instanceof JsonStoreConflictError &&
                        attempt === 0
                    ) {
                        continue;
                    }
                    throw error;
                }
            }
            throw new Error('Failed to update project store');
        },
    ),
    remove: vi.fn(async (projectPath: string) =>
        removeProjectFromList(
            path.resolve(getDefaultDirs().configDir, 'projects.json'),
            projectPath,
        ),
    ),
} as unknown as ProjectsStore;

/** Creates the public project service with test-owned collaborators. */
function createProjectsService(
    codeEditors: CodeEditorIntegrationService = codeEditorIntegrationService,
    git: GitService = gitService,
    tray: TrayAvailabilityService = trayAvailabilityService as unknown as TrayAvailabilityService,
): ProjectsService {
    return new ProjectsService(
        codeEditors,
        {} as ProjectImportService,
        git,
        {} as ProjectCreationService,
        tray,
        projectsStore,
        {
            inspectPublicGitSource: vi.fn(),
            listConnectedRepositories: vi.fn(),
        } as unknown as import('./project-remote-source.service.js').ProjectRemoteSourceService,
        {
            importRemoteProject: vi.fn(),
            cancelRemoteProjectImport: vi.fn(),
        } as unknown as import('./project-remote-import.service.js').ProjectRemoteImportService,
    );
}

function launchProject(
    project: ProjectDetails,
    codeEditors: CodeEditorIntegrationService,
    tray: TrayAvailabilityService,
    options?: LaunchProjectOptions,
) {
    return createProjectsService(codeEditors, gitService, tray).launchProject(
        project,
        options,
    );
}

function getProjectGodotName(project: ProjectDetails) {
    return createProjectsService().getProjectGodotName(project);
}

function initializeProjectGit(project: ProjectDetails, git: GitService) {
    return createProjectsService(
        codeEditorIntegrationService,
        git,
    ).initializeProjectGit(project);
}

function getProjectGitIdentity(project: ProjectDetails, git: GitService) {
    return createProjectsService(
        codeEditorIntegrationService,
        git,
    ).getProjectGitIdentity(project);
}

function setProjectGitIdentity(
    project: ProjectDetails,
    identity: GitIdentity,
    git: GitService,
) {
    return createProjectsService(
        codeEditorIntegrationService,
        git,
    ).setProjectGitIdentity(project, identity);
}

function removeProject(project: ProjectDetails) {
    return createProjectsService().removeProject(project);
}

function renameProject(project: ProjectDetails, options: RenameProjectOptions) {
    return createProjectsService().renameProject(project, options);
}

function setProjectPinned(project: ProjectDetails, pinned: boolean) {
    return createProjectsService().setProjectPinned(project, pinned);
}

function reorderPinnedProjects(orderedProjectPaths: string[]) {
    return createProjectsService().reorderPinnedProjects(orderedProjectPaths);
}

function setProjectCodeEditor(
    project: ProjectDetails,
    codeEditorId: CodeEditorId | null,
    codeEditors: CodeEditorIntegrationService,
) {
    return createProjectsService(codeEditors).setProjectCodeEditor(
        project,
        codeEditorId,
    );
}

function resetProjectCodeEditorConfig(
    project: ProjectDetails,
    codeEditors: CodeEditorIntegrationService,
) {
    return createProjectsService(codeEditors).resetProjectCodeEditorConfig(
        project,
    );
}

let windowMock: {
    webContents: unknown;
    hide: ReturnType<typeof vi.fn>;
    minimize: ReturnType<typeof vi.fn>;
};

function createProjectDetails(
    overrides: Partial<ProjectDetails> = {},
): ProjectDetails {
    return {
        name: 'Demo',
        path: '/projects/demo',
        version: '4.3-stable',
        version_number: 4.3,
        renderer: 'FORWARD_PLUS',
        editor_settings_path: '',
        editor_settings_file: '',
        last_opened: null,
        open_windowed: false,
        release: {
            version: '4.3-stable',
            version_number: 4.3,
            install_path: '/godot',
            editor_path: '/godot/godot',
            platform: 'darwin',
            arch: 'arm64',
            mono: false,
            prerelease: false,
            config_version: 5,
            published_at: null,
            valid: true,
        },
        launch_path: '/project/editor/Godot.app',
        config_version: 5,
        codeEditorId: 'vscode',
        withGit: false,
        valid: true,
        ...overrides,
    };
}

describe('launchProject', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getDefaultDirs.mockReturnValue({ configDir: '/config' });
        windowMock = {
            webContents: {},
            minimize: vi.fn(),
            hide: vi.fn(),
        };
        getMainWindow.mockReturnValue(windowMock);
        getUserPreferences.mockResolvedValue({ post_launch_action: 'none' });
        trayAvailabilityService.isAvailable.mockResolvedValue(true);
        storeProjectsList.mockImplementation(
            async (_path, projects, _options) => projects,
        );
        writeProjectLauncherConfig.mockResolvedValue(undefined);
        integrationMocks.rescanIntegration.mockResolvedValue({
            integration: {
                id: 'vscode',
                displayName: 'Visual Studio Code',
                capabilities: { dotnet: true },
            },
            enabled: true,
            isDefault: false,
            customPath: null,
            defaultExecFlags: '',
            execFlagsOverride: null,
            resolvedExecFlags: '',
            installation: {
                integrationId: 'vscode',
                path: '/tools/code',
                version: null,
            },
            resolvedGodotExecPath: '/tools/code',
        });
    });

    it('writes project launcher config when launching a stored project', async () => {
        const project: ProjectDetails = {
            name: 'Demo',
            path: '/projects/demo',
            version: '4.3-stable',
            version_number: 4.3,
            renderer: 'FORWARD_PLUS',
            editor_settings_path: '',
            editor_settings_file: '',
            last_opened: null,
            open_windowed: false,
            release: {
                version: '4.3-stable',
                version_number: 4.3,
                install_path: '/godot',
                editor_path: '/godot/godot',
                platform: 'darwin',
                arch: 'arm64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: '/project/editor/Godot.app',
            config_version: 5,
            codeEditorId: 'vscode',
            withGit: false,
            valid: true,
        };

        getProjectsSnapshot.mockResolvedValue({
            projects: [project],
            version: 'v1',
        });

        await launchProject(
            project,
            codeEditorIntegrationService,
            trayAvailabilityService as never,
        );

        expect(trayAvailabilityService.isAvailable).not.toHaveBeenCalled();
        expect(writeProjectLauncherConfig).toHaveBeenCalledWith(
            '/projects/demo',
            expect.objectContaining({
                release: expect.objectContaining({ version: '4.3-stable' }),
                launcherVersion: '1.0.0',
            }),
        );
        expect(storeProjectsList).toHaveBeenCalledWith(
            path.resolve('/config', 'projects.json'),
            expect.arrayContaining([
                expect.objectContaining({
                    path: '/projects/demo',
                    last_opened: expect.any(Date),
                }),
            ]),
            expect.objectContaining({ expectedVersion: 'v1' }),
        );
    });

    it('still launches when the best-effort sidecar write fails', async () => {
        const project = createProjectDetails();
        getProjectsSnapshot.mockResolvedValue({
            projects: [project],
            version: 'v1',
        });
        writeProjectLauncherConfig.mockRejectedValue(
            new Error('Sidecar is read-only'),
        );

        await expect(
            launchProject(
                project,
                codeEditorIntegrationService,
                trayAvailabilityService as never,
            ),
        ).resolves.toEqual({ launched: true });

        expect(childProcessMocks.spawn).toHaveBeenCalled();
    });

    it('blocks launch without side effects when the selected code editor is unavailable', async () => {
        const project = createProjectDetails();
        integrationMocks.rescanIntegration.mockResolvedValue({
            integration: {
                id: 'vscode',
                displayName: 'Visual Studio Code',
                capabilities: { dotnet: true },
            },
            enabled: false,
            isDefault: false,
            customPath: null,
            defaultExecFlags: '',
            execFlagsOverride: null,
            resolvedExecFlags: '',
            installation: null,
            resolvedGodotExecPath: null,
        });

        await expect(
            launchProject(
                project,
                codeEditorIntegrationService,
                trayAvailabilityService as never,
            ),
        ).resolves.toEqual({
            launched: false,
            reason: 'code_editor_unavailable',
            integration: {
                id: 'vscode',
                displayName: 'Visual Studio Code',
                capabilities: { dotnet: true },
            },
        });

        expect(trayAvailabilityService.isAvailable).not.toHaveBeenCalled();
        expect(getProjectsSnapshot).toHaveBeenCalledOnce();
        expect(checksMocks.checkProjectHealth).toHaveBeenCalledWith(project);
        expect(storeProjectsList).not.toHaveBeenCalled();
        expect(writeProjectLauncherConfig).not.toHaveBeenCalled();
        expect(childProcessMocks.spawn).not.toHaveBeenCalled();
    });

    it('quickly blocks only the selected invalid project', async () => {
        const project = createProjectDetails();
        const invalidProject = {
            ...project,
            release: { ...project.release, valid: false },
            valid: false,
            invalid_reason: 'missing_editor' as const,
        };
        getProjectsSnapshot.mockResolvedValue({
            projects: [project],
            version: 'v1',
        });
        checksMocks.checkProjectHealth.mockResolvedValueOnce(invalidProject);
        checksMocks.hasProjectHealthChanged.mockReturnValueOnce(true);

        await expect(
            launchProject(
                project,
                codeEditorIntegrationService,
                trayAvailabilityService as never,
            ),
        ).resolves.toEqual({
            launched: false,
            reason: 'project_unavailable',
            project: invalidProject,
        });

        expect(checksMocks.checkProjectHealth).toHaveBeenCalledOnce();
        expect(integrationMocks.rescanIntegration).not.toHaveBeenCalled();
        expect(childProcessMocks.spawn).not.toHaveBeenCalled();
    });

    it('launches without a code editor scan when its warning is explicitly bypassed', async () => {
        const project = createProjectDetails();
        getProjectsSnapshot.mockResolvedValue({
            projects: [project],
            version: 'v1',
        });

        await expect(
            launchProject(
                project,
                codeEditorIntegrationService,
                trayAvailabilityService as never,
                {
                    allowMissingCodeEditor: true,
                },
            ),
        ).resolves.toEqual({ launched: true });

        expect(integrationMocks.rescanIntegration).not.toHaveBeenCalled();
        expect(childProcessMocks.spawn).toHaveBeenCalled();
    });

    it.each([
        {
            available: true,
            shouldHide: true,
        },
        {
            available: false,
            shouldHide: false,
        },
    ])(
        'applies close-to-tray only when availability is $available',
        async ({ available, shouldHide }) => {
            const project = createProjectDetails();
            getProjectsSnapshot.mockResolvedValue({
                projects: [project],
                version: 'v1',
            });
            getUserPreferences.mockResolvedValue({
                post_launch_action: 'close_to_tray',
            });
            trayAvailabilityService.isAvailable.mockResolvedValue(available);

            await launchProject(
                project,
                codeEditorIntegrationService,
                trayAvailabilityService as never,
            );

            expect(trayAvailabilityService.isAvailable).toHaveBeenCalledOnce();
            if (shouldHide) {
                expect(windowMock.hide).toHaveBeenCalledOnce();
            } else {
                expect(windowMock.hide).not.toHaveBeenCalled();
            }
        },
    );
});

describe('setProjectPinned', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getDefaultDirs.mockReturnValue({ configDir: '/config' });
        getMainWindow.mockReturnValue({ webContents: {} });
    });

    it('persists pin state and broadcasts the updated list', async () => {
        const project = createProjectDetails();
        getProjectsSnapshot.mockResolvedValue({
            projects: [project],
            version: 'v1',
        });
        storeProjectsList.mockImplementation(
            async (_path, projects) => projects,
        );

        await expect(setProjectPinned(project, true)).resolves.toEqual([
            expect.objectContaining({
                path: project.path,
                pinned: true,
                pinned_order: 0,
            }),
        ]);

        expect(storeProjectsList).toHaveBeenCalledWith(
            path.resolve('/config', 'projects.json'),
            [
                expect.objectContaining({
                    path: project.path,
                    pinned: true,
                    pinned_order: 0,
                }),
            ],
            { expectedVersion: 'v1' },
        );
        expect(ipcWebContentsSend).toHaveBeenCalledWith(
            'projects-updated',
            expect.anything(),
            [expect.objectContaining({ pinned: true })],
        );
    });

    it('retries after a concurrent project-list update', async () => {
        const project = createProjectDetails();
        getProjectsSnapshot
            .mockResolvedValueOnce({ projects: [project], version: 'v1' })
            .mockResolvedValueOnce({ projects: [project], version: 'v2' });
        storeProjectsList
            .mockRejectedValueOnce(
                new JsonStoreConflictError('/config/projects.json'),
            )
            .mockImplementationOnce(async (_path, projects) => projects);

        await setProjectPinned(project, true);

        expect(storeProjectsList).toHaveBeenCalledTimes(2);
        expect(storeProjectsList).toHaveBeenLastCalledWith(
            path.resolve('/config', 'projects.json'),
            [expect.objectContaining({ pinned: true })],
            { expectedVersion: 'v2' },
        );
    });

    it('puts a newly pinned project first and compacts existing order', async () => {
        const existing = createProjectDetails({
            name: 'Existing',
            path: '/projects/existing',
            pinned: true,
            pinned_order: 4,
        });
        const project = createProjectDetails({
            name: 'New Pin',
            path: '/projects/new-pin',
        });
        getProjectsSnapshot.mockResolvedValue({
            projects: [existing, project],
            version: 'v1',
        });
        storeProjectsList.mockImplementation(
            async (_path, projects) => projects,
        );

        const result = await setProjectPinned(project, true);

        expect(result).toEqual([
            expect.objectContaining({
                path: existing.path,
                pinned_order: 1,
            }),
            expect.objectContaining({
                path: project.path,
                pinned_order: 0,
            }),
        ]);
    });

    it('clears an unpinned project order and compacts remaining projects', async () => {
        const project = createProjectDetails({
            pinned: true,
            pinned_order: 0,
        });
        const remaining = createProjectDetails({
            name: 'Remaining',
            path: '/projects/remaining',
            pinned: true,
            pinned_order: 3,
        });
        getProjectsSnapshot.mockResolvedValue({
            projects: [project, remaining],
            version: 'v1',
        });
        storeProjectsList.mockImplementation(
            async (_path, projects) => projects,
        );

        const result = await setProjectPinned(project, false);

        expect(result).toEqual([
            expect.objectContaining({
                path: project.path,
                pinned: false,
                pinned_order: undefined,
            }),
            expect.objectContaining({
                path: remaining.path,
                pinned_order: 0,
            }),
        ]);
    });
});

describe('reorderPinnedProjects', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getDefaultDirs.mockReturnValue({ configDir: '/config' });
        getMainWindow.mockReturnValue({ webContents: {} });
    });

    it('persists and broadcasts the complete pinned order', async () => {
        const first = createProjectDetails({
            name: 'First',
            path: '/projects/first',
            pinned: true,
            pinned_order: 0,
        });
        const second = createProjectDetails({
            name: 'Second',
            path: '/projects/second',
            pinned: true,
            pinned_order: 1,
        });
        getProjectsSnapshot.mockResolvedValue({
            projects: [first, second],
            version: 'v1',
        });
        storeProjectsList.mockImplementation(
            async (_path, projects) => projects,
        );

        const result = await reorderPinnedProjects([second.path, first.path]);

        expect(result).toEqual([
            expect.objectContaining({ path: first.path, pinned_order: 1 }),
            expect.objectContaining({ path: second.path, pinned_order: 0 }),
        ]);
        expect(storeProjectsList).toHaveBeenCalledWith(
            path.resolve('/config', 'projects.json'),
            expect.any(Array),
            { expectedVersion: 'v1' },
        );
        expect(ipcWebContentsSend).toHaveBeenCalledWith(
            'projects-updated',
            expect.anything(),
            result,
        );
    });

    it.each([
        ['/projects/first'],
        ['/projects/first', '/projects/first'],
        ['/projects/first', '/projects/unknown'],
    ])('rejects a stale or invalid pinned path set', async (...paths) => {
        const first = createProjectDetails({
            path: '/projects/first',
            pinned: true,
            pinned_order: 0,
        });
        const second = createProjectDetails({
            path: '/projects/second',
            pinned: true,
            pinned_order: 1,
        });
        getProjectsSnapshot.mockResolvedValue({
            projects: [first, second],
            version: 'v1',
        });

        await expect(reorderPinnedProjects(paths)).rejects.toThrow(
            'projects:pinning.errors.orderChanged',
        );
        expect(storeProjectsList).not.toHaveBeenCalled();
    });

    it('retries a write conflict against the latest matching pinned set', async () => {
        const first = createProjectDetails({
            path: '/projects/first',
            pinned: true,
            pinned_order: 0,
        });
        const second = createProjectDetails({
            path: '/projects/second',
            pinned: true,
            pinned_order: 1,
        });
        getProjectsSnapshot
            .mockResolvedValueOnce({
                projects: [first, second],
                version: 'v1',
            })
            .mockResolvedValueOnce({
                projects: [first, second],
                version: 'v2',
            });
        storeProjectsList
            .mockRejectedValueOnce(
                new JsonStoreConflictError('/config/projects.json'),
            )
            .mockImplementationOnce(async (_path, projects) => projects);

        await reorderPinnedProjects([second.path, first.path]);

        expect(storeProjectsList).toHaveBeenCalledTimes(2);
        expect(storeProjectsList).toHaveBeenLastCalledWith(
            path.resolve('/config', 'projects.json'),
            expect.any(Array),
            { expectedVersion: 'v2' },
        );
    });
});

describe('removeProject', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getDefaultDirs.mockReturnValue({ configDir: '/config' });
        removeProjectEditor.mockResolvedValue(undefined);
        removeProjectFromList.mockResolvedValue([]);
        writeProjectLauncherConfig.mockResolvedValue(undefined);
    });

    it('writes project launcher config before removing a project', async () => {
        const project: ProjectDetails = {
            name: 'Demo',
            path: '/projects/demo',
            version: '4.3-stable',
            version_number: 4.3,
            renderer: 'FORWARD_PLUS',
            editor_settings_path: '',
            editor_settings_file: '',
            last_opened: new Date('2024-05-06T07:08:09.000Z'),
            open_windowed: false,
            release: {
                version: '4.3-stable',
                version_number: 4.3,
                install_path: '/godot',
                editor_path: '/godot/godot',
                platform: 'darwin',
                arch: 'arm64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: '/project/editor/Godot.app',
            config_version: 5,
            codeEditorId: 'vscode',
            withGit: false,
            valid: true,
        };

        await removeProject(project);

        expect(writeProjectLauncherConfig).toHaveBeenCalledWith(
            '/projects/demo',
            expect.objectContaining({
                release: expect.objectContaining({ version: '4.3-stable' }),
                launcherVersion: '1.0.0',
            }),
        );
        const [, input] = writeProjectLauncherConfig.mock.calls[0];
        expect(input).not.toHaveProperty('codeEditorId');
        expect(removeProjectFromList).toHaveBeenCalledWith(
            path.resolve('/config', 'projects.json'),
            '/projects/demo',
        );
    });

    it('still removes local state when the best-effort sidecar write fails', async () => {
        const project = createProjectDetails();
        writeProjectLauncherConfig.mockRejectedValue(
            new Error('Sidecar is read-only'),
        );

        await expect(removeProject(project)).resolves.toEqual([]);

        expect(removeProjectEditor).toHaveBeenCalledWith(project);
        expect(removeProjectFromList).toHaveBeenCalledWith(
            path.resolve('/config', 'projects.json'),
            '/projects/demo',
        );
    });
});

describe('renameProject', () => {
    const createProject = (overrides: Partial<ProjectDetails> = {}) =>
        ({
            name: 'Demo',
            path: '/projects/demo',
            version: '4.2',
            version_number: 4.2,
            renderer: 'FORWARD_PLUS',
            editor_settings_path: '/launcher/editors/Demo/editor_data',
            editor_settings_file:
                '/launcher/editors/Demo/editor_data/editor_settings-4.2.tres',
            last_opened: null,
            open_windowed: false,
            release: {
                version: '4.2',
                version_number: 4.2,
                install_path: '/godot',
                editor_path: '/godot/godot.exe',
                platform: 'win32',
                arch: 'x86_64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: '/launcher/editors/Demo/godot.exe',
            config_version: 5,
            codeEditorId: null,
            withGit: false,
            valid: true,
            ...overrides,
        }) satisfies ProjectDetails;

    beforeEach(() => {
        vi.clearAllMocks();
        getDefaultDirs.mockReturnValue({ configDir: '/config' });
        windowMock = { webContents: {} };
        getMainWindow.mockReturnValue(windowMock);
        updateGodotProjectName.mockResolvedValue(undefined);
        storeProjectsList.mockImplementation(
            async (_path, projects, _options) => projects,
        );
    });

    it('renames the launcher project name by path', async () => {
        const project = createProject();
        getProjectsSnapshot.mockResolvedValue({
            projects: [project],
            version: 'v1',
        });

        const result = await renameProject(project, {
            name: ' Renamed Demo ',
            renameGodotProject: false,
        });

        expect(result.success).toBe(true);
        expect(result.project).toEqual(
            expect.objectContaining({
                name: 'Renamed Demo',
                path: '/projects/demo',
                launch_path: '/launcher/editors/Demo/godot.exe',
                editor_settings_path: '/launcher/editors/Demo/editor_data',
                editor_settings_file:
                    '/launcher/editors/Demo/editor_data/editor_settings-4.2.tres',
            }),
        );
        expect(updateGodotProjectName).not.toHaveBeenCalled();
        expect(storeProjectsList).toHaveBeenCalledWith(
            path.resolve('/config', 'projects.json'),
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'Renamed Demo',
                    path: '/projects/demo',
                }),
            ]),
            expect.objectContaining({ expectedVersion: 'v1' }),
        );
        expect(ipcWebContentsSend).toHaveBeenCalledWith(
            'projects-updated',
            windowMock.webContents,
            expect.any(Array),
        );
    });

    it('renames the launcher and Godot project names together', async () => {
        const project = createProject();
        getProjectsSnapshot.mockResolvedValue({
            projects: [project],
            version: 'v1',
        });

        const result = await renameProject(project, {
            name: 'Renamed Demo',
            renameGodotProject: true,
        });

        expect(result.success).toBe(true);
        expect(updateGodotProjectName).toHaveBeenCalledWith(
            '/projects/demo',
            'Renamed Demo',
        );
        expect(result.project?.name).toBe('Renamed Demo');
    });

    it('rejects duplicate launcher names from other project paths', async () => {
        const project = createProject();
        getProjectsSnapshot.mockResolvedValue({
            projects: [
                project,
                createProject({
                    name: 'Existing Name',
                    path: '/projects/existing',
                }),
            ],
            version: 'v1',
        });

        const result = await renameProject(project, {
            name: 'Existing Name',
            renameGodotProject: true,
        });

        expect(result).toEqual(
            expect.objectContaining({
                success: false,
                errorField: 'name',
            }),
        );
        expect(updateGodotProjectName).not.toHaveBeenCalled();
        expect(storeProjectsList).not.toHaveBeenCalled();
    });

    it('reports Godot project rename failures on the Godot field', async () => {
        const project = createProject();
        getProjectsSnapshot.mockResolvedValue({
            projects: [project],
            version: 'v1',
        });
        updateGodotProjectName.mockRejectedValue(
            new Error('Cannot write file'),
        );

        const result = await renameProject(project, {
            name: 'Renamed Demo',
            renameGodotProject: true,
        });

        expect(result).toEqual({
            success: false,
            error: 'Cannot write file',
            errorField: 'godot',
        });
        expect(storeProjectsList).not.toHaveBeenCalled();
    });

    it('retries when the project list changes while renaming', async () => {
        const project = createProject();
        getProjectsSnapshot
            .mockResolvedValueOnce({ projects: [project], version: 'v1' })
            .mockResolvedValueOnce({ projects: [project], version: 'v2' });
        storeProjectsList
            .mockRejectedValueOnce(
                new JsonStoreConflictError('/config/projects.json'),
            )
            .mockImplementationOnce(
                async (_path, projects, _options) => projects,
            );

        const result = await renameProject(project, {
            name: 'Renamed Demo',
            renameGodotProject: false,
        });

        expect(result.success).toBe(true);
        expect(storeProjectsList).toHaveBeenCalledTimes(2);
    });

    it('reads the current Godot project name', async () => {
        const project = createProject();
        readGodotProjectName.mockResolvedValue('Demo');

        await expect(getProjectGodotName(project)).resolves.toBe('Demo');
        expect(readGodotProjectName).toHaveBeenCalledWith('/projects/demo');
    });
});

describe('setProjectCodeEditor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getDefaultDirs.mockReturnValue({ configDir: '/config' });
        getAssetPath.mockReturnValue('/assets');
        windowMock = { webContents: {} };
        getMainWindow.mockReturnValue(windowMock);
        // By default, have storeProjectsList return the updated array it was
        // called with. Tests that need special behavior can override this.
        storeProjectsList.mockImplementation(
            async (_p: string, updated: ProjectDetails[]) =>
                updated as ProjectDetails[],
        );

        integrationMocks.assertIntegrationSelectable.mockResolvedValue(
            undefined,
        );
        integrationMocks.applyToProject.mockImplementation(
            async (_id, context) => ({
                editorSettingsFile: context.editorSettingsFile,
                recoveredConfigFiles: [],
            }),
        );
        integrationMocks.disableForProject.mockResolvedValue(undefined);
        writeProjectLauncherConfig.mockResolvedValue(undefined);
    });
    it('enables VS Code integration using existing editor settings', async () => {
        const project: ProjectDetails = {
            name: 'Demo',
            path: '/projects/demo',
            version: '4.2',
            version_number: 4.2,
            renderer: 'FORWARD_PLUS',
            editor_settings_path: '/projects/demo/editor_data',
            editor_settings_file:
                '/projects/demo/editor_data/editor_settings-4.2.tres',
            last_opened: null,
            open_windowed: false,
            release: {
                version: '4.2',
                version_number: 4.2,
                install_path: '/godot',
                editor_path: '/godot/godot.exe',
                platform: 'win32',
                arch: 'x86_64',
                mono: true,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: '/godot/godot.exe',
            config_version: 5,
            codeEditorId: null,
            withGit: false,
            valid: true,
        };

        const storedProjects = [
            JSON.parse(JSON.stringify(project)) as ProjectDetails,
        ];

        getProjectsSnapshot.mockResolvedValue({
            projects: storedProjects,
            version: 'v1',
        });
        storeProjectsList.mockImplementation(
            async (_p: string, updated: ProjectDetails[]) =>
                updated as ProjectDetails[],
        );
        getProjectDefinition.mockReturnValue({
            editorConfigFilename: () => 'editor_settings-4.2.tres',
            editorConfigFormat: 3,
            resources: [],
            projectFilename: 'project.godot',
            configVersion: 5,
            defaultRenderer: 'FORWARD_PLUS',
        });
        existsSync.mockImplementation(
            (target: unknown) =>
                target ===
                '/projects/demo/editor_data/editor_settings-4.2.tres',
        );

        const result = await setProjectCodeEditor(
            project,
            'vscode',
            codeEditorIntegrationService,
        );

        expect(integrationMocks.applyToProject).toHaveBeenCalledWith(
            'vscode',
            expect.objectContaining({
                projectPath: '/projects/demo',
                godotLaunchPath: '/godot/godot.exe',
                godotVersion: 4.2,
                mono: true,
            }),
        );
        expect(writeProjectLauncherConfig).not.toHaveBeenCalled();
        expect(storeProjectsList).toHaveBeenCalledWith(
            path.resolve('/config', 'projects.json'),
            expect.any(Array),
            expect.objectContaining({ expectedVersion: 'v1' }),
        );
        expect(ipcWebContentsSend).toHaveBeenCalledWith(
            'projects-updated',
            windowMock.webContents,
            expect.any(Array),
        );
        expect(result.codeEditorId).toBe('vscode');
    });

    it('passes the previous editor when switching integrations', async () => {
        const project = createProjectDetails({ codeEditorId: 'vscode' });
        getProjectsSnapshot.mockResolvedValue({
            projects: [project],
            version: 'v1',
        });
        getProjectDefinition.mockReturnValue({
            editorConfigFilename: () => 'editor_settings-4.3.tres',
            editorConfigFormat: 3,
            resources: [],
            projectFilename: 'project.godot',
            configVersion: 5,
            defaultRenderer: 'FORWARD_PLUS',
        });

        await setProjectCodeEditor(
            project,
            'vscodium',
            codeEditorIntegrationService,
        );

        expect(integrationMocks.applyToProject).toHaveBeenCalledWith(
            'vscodium',
            expect.objectContaining({ previousCodeEditorId: 'vscode' }),
        );
    });

    it('persists the local selection without writing the sidecar', async () => {
        const project: ProjectDetails = {
            name: 'Demo',
            path: '/projects/demo',
            version: '4.2',
            version_number: 4.2,
            renderer: 'FORWARD_PLUS',
            editor_settings_path: '/projects/demo/editor_data',
            editor_settings_file:
                '/projects/demo/editor_data/editor_settings-4.2.tres',
            last_opened: null,
            open_windowed: false,
            release: {
                version: '4.2',
                version_number: 4.2,
                install_path: '/godot',
                editor_path: '/godot/godot.exe',
                platform: 'win32',
                arch: 'x86_64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: '/godot/godot.exe',
            config_version: 5,
            codeEditorId: null,
            withGit: false,
            valid: true,
        };

        getProjectsSnapshot.mockResolvedValue({
            projects: [JSON.parse(JSON.stringify(project)) as ProjectDetails],
            version: 'v1',
        });
        getProjectDefinition.mockReturnValue({
            editorConfigFilename: () => 'editor_settings-4.2.tres',
            editorConfigFormat: 3,
            resources: [],
            projectFilename: 'project.godot',
            configVersion: 5,
            defaultRenderer: 'FORWARD_PLUS',
        });
        writeProjectLauncherConfig.mockRejectedValueOnce(
            new Error('Cannot write .godotlauncher'),
        );

        await expect(
            setProjectCodeEditor(
                project,
                'vscode',
                codeEditorIntegrationService,
            ),
        ).resolves.toMatchObject({ codeEditorId: 'vscode' });

        expect(integrationMocks.applyToProject).toHaveBeenCalledOnce();
        expect(writeProjectLauncherConfig).not.toHaveBeenCalled();
        expect(storeProjectsList).toHaveBeenCalledOnce();
        expect(project.codeEditorId).toBe('vscode');
    });
    it('returns recovered VS Code config files when enabling integration', async () => {
        const project: ProjectDetails = {
            name: 'Demo',
            path: '/projects/demo',
            version: '4.2',
            version_number: 4.2,
            renderer: 'FORWARD_PLUS',
            editor_settings_path: '/projects/demo/editor_data',
            editor_settings_file:
                '/projects/demo/editor_data/editor_settings-4.2.tres',
            last_opened: null,
            open_windowed: false,
            release: {
                version: '4.2',
                version_number: 4.2,
                install_path: '/godot',
                editor_path: '/godot/godot.exe',
                platform: 'win32',
                arch: 'x86_64',
                mono: true,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: '/godot/godot.exe',
            config_version: 5,
            codeEditorId: null,
            withGit: false,
            valid: true,
        };

        getProjectsSnapshot.mockResolvedValue({
            projects: [JSON.parse(JSON.stringify(project)) as ProjectDetails],
            version: 'v1',
        });
        getProjectDefinition.mockReturnValue({
            editorConfigFilename: () => 'editor_settings-4.2.tres',
            editorConfigFormat: 3,
            resources: [],
            projectFilename: 'project.godot',
            configVersion: 5,
            defaultRenderer: 'FORWARD_PLUS',
        });
        existsSync.mockImplementation(
            (target: unknown) =>
                target ===
                '/projects/demo/editor_data/editor_settings-4.2.tres',
        );

        integrationMocks.applyToProject.mockResolvedValue({
            editorSettingsFile:
                '/projects/demo/editor_data/editor_settings-4.2.tres',
            recoveredConfigFiles: [
                '.vscode/settings.json.1712345678901.bad',
                '.vscode/launch.json.1712345678902.bad',
                '.vscode/extensions.json.1712345678903.bad',
            ],
        });
        const result = await setProjectCodeEditor(
            project,
            'vscode',
            codeEditorIntegrationService,
        );

        expect(result.recoveredCodeEditorConfigFiles).toEqual([
            '.vscode/settings.json.1712345678901.bad',
            '.vscode/launch.json.1712345678902.bad',
            '.vscode/extensions.json.1712345678903.bad',
        ]);
    });

    it('creates editor settings when enabling VS Code with no existing file', async () => {
        const project: ProjectDetails = {
            name: 'Demo',
            path: '/projects/demo',
            version: '4.2',
            version_number: 4.2,
            renderer: 'FORWARD_PLUS',
            editor_settings_path: '',
            editor_settings_file: '',
            last_opened: null,
            open_windowed: false,
            release: {
                version: '4.2',
                version_number: 4.2,
                install_path: '/godot',
                editor_path: '/godot/godot.exe',
                platform: 'win32',
                arch: 'x86_64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: '/godot/godot.exe',
            config_version: 5,
            codeEditorId: null,
            withGit: false,
            valid: true,
        };

        const storedProjects = [
            JSON.parse(JSON.stringify(project)) as ProjectDetails,
        ];

        getProjectsSnapshot.mockResolvedValue({
            projects: storedProjects,
            version: 'v1',
        });
        storeProjectsList.mockImplementation(
            async (_p: string, updated: ProjectDetails[]) =>
                updated as ProjectDetails[],
        );
        getProjectDefinition.mockReturnValue({
            editorConfigFilename: () => 'editor_settings-4.2.tres',
            editorConfigFormat: 3,
            resources: [],
            projectFilename: 'project.godot',
            configVersion: 5,
            defaultRenderer: 'FORWARD_PLUS',
        });
        existsSync.mockReturnValue(false);

        integrationMocks.applyToProject.mockResolvedValue({
            editorSettingsFile:
                '/projects/demo/editor_data/editor_settings-4.2.tres',
            recoveredConfigFiles: [],
        });
        const result = await setProjectCodeEditor(
            project,
            'vscode',
            codeEditorIntegrationService,
        );

        expect(integrationMocks.applyToProject).toHaveBeenCalledOnce();
        expect(result.editor_settings_file).toBe(
            '/projects/demo/editor_data/editor_settings-4.2.tres',
        );
        expect(result.editor_settings_path).toBe('/projects/demo/editor_data');
    });

    it('retries when VS Code toggle races with concurrent updates', async () => {
        const project: ProjectDetails = {
            name: 'Demo',
            path: '/projects/demo',
            version: '4.2',
            version_number: 4.2,
            renderer: 'FORWARD_PLUS',
            editor_settings_path: '/projects/demo/editor_data',
            editor_settings_file:
                '/projects/demo/editor_data/editor_settings-4.2.tres',
            last_opened: null,
            open_windowed: false,
            release: {
                version: '4.2',
                version_number: 4.2,
                install_path: '/godot',
                editor_path: '/godot/godot.exe',
                platform: 'win32',
                arch: 'x86_64',
                mono: true,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: '/godot/godot.exe',
            config_version: 5,
            codeEditorId: null,
            withGit: false,
            valid: true,
        };

        const storedProjects = [
            JSON.parse(JSON.stringify(project)) as ProjectDetails,
        ];

        getProjectsSnapshot
            .mockResolvedValueOnce({ projects: storedProjects, version: 'v1' })
            .mockResolvedValueOnce({ projects: storedProjects, version: 'v2' });
        storeProjectsList
            .mockRejectedValueOnce(
                new JsonStoreConflictError('/config/projects.json'),
            )
            .mockImplementationOnce(
                async (_p: string, updated: ProjectDetails[]) =>
                    updated as ProjectDetails[],
            );
        getProjectDefinition.mockReturnValue({
            editorConfigFilename: () => 'editor_settings-4.2.tres',
            editorConfigFormat: 3,
            resources: [],
            projectFilename: 'project.godot',
            configVersion: 5,
            defaultRenderer: 'FORWARD_PLUS',
        });
        existsSync.mockReturnValue(true);

        await setProjectCodeEditor(
            project,
            'vscode',
            codeEditorIntegrationService,
        );

        expect(storeProjectsList).toHaveBeenCalledTimes(2);
    });

    it('disables VS Code integration by toggling the external editor flag', async () => {
        const project: ProjectDetails = {
            name: 'Demo',
            path: '/projects/demo',
            version: '4.2',
            version_number: 4.2,
            renderer: 'FORWARD_PLUS',
            editor_settings_path: '/projects/demo/editor_data',
            editor_settings_file:
                '/projects/demo/editor_data/editor_settings-4.2.tres',
            last_opened: null,
            open_windowed: false,
            release: {
                version: '4.2',
                version_number: 4.2,
                install_path: '/godot',
                editor_path: '/godot/godot.exe',
                platform: 'win32',
                arch: 'x86_64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: '/godot/godot.exe',
            config_version: 5,
            codeEditorId: null,
            withGit: false,
            valid: true,
        };

        const storedProjects = [
            JSON.parse(JSON.stringify(project)) as ProjectDetails,
        ];

        getProjectsSnapshot.mockResolvedValue({
            projects: storedProjects,
            version: 'v1',
        });
        storeProjectsList.mockImplementation(
            async (_p: string, updated: ProjectDetails[]) =>
                updated as ProjectDetails[],
        );
        existsSync.mockImplementation(
            (target: unknown) =>
                target ===
                '/projects/demo/editor_data/editor_settings-4.2.tres',
        );

        const result = await setProjectCodeEditor(
            project,
            null,
            codeEditorIntegrationService,
        );

        expect(integrationMocks.disableForProject).toHaveBeenCalledWith(
            '/projects/demo/editor_data/editor_settings-4.2.tres',
            'standard',
        );
        expect(writeProjectLauncherConfig).not.toHaveBeenCalled();
        expect(result.codeEditorId).toBeNull();
    });

    it.each(['disabled', 'unavailable'])(
        'rejects a directly requested %s integration before project mutation',
        async (state) => {
            const project = createProjectDetails({
                codeEditorId: null,
                launch_path: '/godot/godot.exe',
            });
            getProjectsSnapshot.mockResolvedValue({
                projects: [project],
                version: 'v1',
            });
            integrationMocks.assertIntegrationSelectable.mockRejectedValue(
                new Error(`Visual Studio Code is ${state}.`),
            );

            await expect(
                setProjectCodeEditor(
                    project,
                    'vscode',
                    codeEditorIntegrationService,
                ),
            ).rejects.toThrow(`Visual Studio Code is ${state}.`);

            expect(integrationMocks.applyToProject).not.toHaveBeenCalled();
            expect(writeProjectLauncherConfig).not.toHaveBeenCalled();
            expect(storeProjectsList).not.toHaveBeenCalled();
        },
    );

    it('keeps an already selected disabled integration as a no-op', async () => {
        const project = createProjectDetails();
        getProjectsSnapshot.mockResolvedValue({
            projects: [project],
            version: 'v1',
        });
        integrationMocks.assertIntegrationSelectable.mockRejectedValue(
            new Error('Visual Studio Code is disabled.'),
        );

        const result = await setProjectCodeEditor(
            project,
            'vscode',
            codeEditorIntegrationService,
        );

        expect(result.codeEditorId).toBe('vscode');
        expect(
            integrationMocks.assertIntegrationSelectable,
        ).not.toHaveBeenCalled();
        expect(writeProjectLauncherConfig).not.toHaveBeenCalled();
    });

    it.each([
        {
            selection: 'known integration',
            project: {
                codeEditorId: null,
            },
            requestedId: 'vscode' as const,
        },
        {
            selection: 'None',
            project: {
                codeEditorId: 'vscode' as const,
            },
            requestedId: null,
        },
    ])(
        'persists explicit $selection locally without writing the sidecar',
        async ({ project: projectOverrides, requestedId }) => {
            const project = createProjectDetails(projectOverrides);
            getProjectsSnapshot.mockResolvedValue({
                projects: [project],
                version: 'v1',
            });
            getProjectDefinition.mockReturnValue({
                editorConfigFilename: () => 'editor_settings-4.3.tres',
                editorConfigFormat: 3,
                resources: [],
                projectFilename: 'project.godot',
                configVersion: 5,
                defaultRenderer: 'FORWARD_PLUS',
            });

            await setProjectCodeEditor(
                project,
                requestedId,
                codeEditorIntegrationService,
            );

            expect(project.codeEditorId).toBe(requestedId);
            expect(writeProjectLauncherConfig).not.toHaveBeenCalled();
        },
    );

    it('throws when VS Code is not installed', async () => {
        const project: ProjectDetails = {
            name: 'Demo',
            path: '/projects/demo',
            version: '4.2',
            version_number: 4.2,
            renderer: 'FORWARD_PLUS',
            editor_settings_path: '',
            editor_settings_file: '',
            last_opened: null,
            open_windowed: false,
            release: {
                version: '4.2',
                version_number: 4.2,
                install_path: '/godot',
                editor_path: '/godot/godot.exe',
                platform: 'win32',
                arch: 'x86_64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: '/godot/godot.exe',
            config_version: 5,
            codeEditorId: null,
            withGit: false,
            valid: true,
        };

        const storedProjects = [
            JSON.parse(JSON.stringify(project)) as ProjectDetails,
        ];

        getProjectsSnapshot.mockResolvedValue({
            projects: storedProjects,
            version: 'v1',
        });
        storeProjectsList.mockResolvedValue(storedProjects);
        getProjectDefinition.mockReturnValue({
            editorConfigFilename: () => 'editor_settings-4.2.tres',
            editorConfigFormat: 3,
            resources: [],
            projectFilename: 'project.godot',
            configVersion: 5,
            defaultRenderer: 'FORWARD_PLUS',
        });

        integrationMocks.applyToProject.mockRejectedValue(
            new Error('Visual Studio Code installation was not found.'),
        );
        await expect(
            setProjectCodeEditor(
                project,
                'vscode',
                codeEditorIntegrationService,
            ),
        ).rejects.toThrow('Visual Studio Code installation was not found.');
        expect(storeProjectsList).not.toHaveBeenCalled();
    });
});

describe('resetProjectCodeEditorConfig', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getDefaultDirs.mockReturnValue({ configDir: '/config' });
        windowMock = { webContents: {} };
        getMainWindow.mockReturnValue(windowMock);
        storeProjectsList.mockImplementation(
            async (_path: string, projects: ProjectDetails[]) => projects,
        );
        integrationMocks.assertIntegrationSelectable.mockResolvedValue(
            undefined,
        );
        getProjectDefinition.mockReturnValue({
            editorConfigFilename: () => 'editor_settings-4.3.tres',
            editorConfigFormat: 3,
            resources: [],
            projectFilename: 'project.godot',
            configVersion: 5,
            defaultRenderer: 'FORWARD_PLUS',
        });
    });

    it('reapplies the persisted editor without running switch cleanup', async () => {
        const project = createProjectDetails({
            codeEditorId: 'vscodium',
            editor_settings_file:
                '/project/editor/editor_data/editor_settings-4.3.tres',
            editor_settings_path: '/project/editor/editor_data',
        });
        getProjectsSnapshot.mockResolvedValue({
            projects: [structuredClone(project)],
            version: 'v1',
        });
        integrationMocks.applyToProject.mockResolvedValue({
            editorSettingsFile: project.editor_settings_file,
            recoveredConfigFiles: ['.vscode/launch.json.1.bad'],
        });

        const result = await resetProjectCodeEditorConfig(
            project,
            codeEditorIntegrationService,
        );

        expect(
            integrationMocks.assertIntegrationSelectable,
        ).toHaveBeenCalledWith('vscodium');
        expect(integrationMocks.applyToProject).toHaveBeenCalledWith(
            'vscodium',
            expect.objectContaining({
                projectPath: project.path,
                previousCodeEditorId: null,
            }),
        );
        expect(result).toMatchObject({
            codeEditorId: 'vscodium',
            recoveredCodeEditorConfigFiles: ['.vscode/launch.json.1.bad'],
        });
        expect(storeProjectsList).toHaveBeenCalledWith(
            expect.stringContaining('projects.json'),
            expect.any(Array),
            { expectedVersion: 'v1' },
        );
    });

    it('rejects reset when the project has no selected editor', async () => {
        const project = createProjectDetails({ codeEditorId: null });
        getProjectsSnapshot.mockResolvedValue({
            projects: [project],
            version: 'v1',
        });

        await expect(
            resetProjectCodeEditorConfig(project, codeEditorIntegrationService),
        ).rejects.toThrow('projects:setCodeEditor.errors.noEditorSelected');

        expect(integrationMocks.applyToProject).not.toHaveBeenCalled();
        expect(storeProjectsList).not.toHaveBeenCalled();
    });
});

describe('initializeProjectGit', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getDefaultDirs.mockReturnValue({ configDir: '/config' });
        windowMock = { webContents: {} };
        getMainWindow.mockReturnValue(windowMock);
    });

    it('initializes git repository and updates project metadata', async () => {
        const storedProject: ProjectDetails = {
            name: 'Demo',
            path: '/projects/demo',
            version: '4.2',
            version_number: 4.2,
            renderer: 'FORWARD_PLUS',
            editor_settings_path: '',
            editor_settings_file: '',
            last_opened: null,
            open_windowed: false,
            release: {
                version: '4.2',
                version_number: 4.2,
                install_path: '/godot',
                editor_path: '/godot/godot.exe',
                platform: 'win32',
                arch: 'x86_64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: '/godot/godot.exe',
            config_version: 5,
            codeEditorId: null,
            withGit: false,
            valid: true,
        };

        const storedProjects = [storedProject];
        getProjectsSnapshot.mockResolvedValue({
            projects: storedProjects,
            version: 'v1',
        });
        storeProjectsList.mockImplementation(
            async (_path, projects, _options) => projects,
        );

        gitServiceMocks.init.mockResolvedValue(true);
        gitServiceMocks.inspectRepository
            .mockResolvedValueOnce({ status: 'not-a-repository' })
            .mockResolvedValueOnce({
                status: 'inside-work-tree',
                root: storedProject.path,
                isProjectRoot: true,
                kind: 'standard',
            });

        const result = await initializeProjectGit(
            { ...storedProject },
            gitService,
        );

        expect(gitServiceMocks.init).toHaveBeenCalledWith(storedProject.path);
        expect(storeProjectsList).toHaveBeenCalledWith(
            expect.stringContaining('projects.json'),
            expect.any(Array),
            expect.objectContaining({ expectedVersion: 'v1' }),
        );
        const persisted = storeProjectsList.mock
            .calls[0][1] as ProjectDetails[];
        expect(persisted[0].withGit).toBe(true);
        expect(ipcWebContentsSend).toHaveBeenCalledWith(
            'projects-updated',
            windowMock.webContents,
            expect.arrayContaining([
                expect.objectContaining({
                    path: storedProject.path,
                    withGit: true,
                }),
            ]),
        );
        expect(result.project.withGit).toBe(true);
        expect(result.gitSetup.status).toBe('initialized');
    });

    it('throws when git initialization fails', async () => {
        const storedProject: ProjectDetails = {
            name: 'Demo',
            path: '/projects/demo',
            version: '4.2',
            version_number: 4.2,
            renderer: 'FORWARD_PLUS',
            editor_settings_path: '',
            editor_settings_file: '',
            last_opened: null,
            open_windowed: false,
            release: {
                version: '4.2',
                version_number: 4.2,
                install_path: '/godot',
                editor_path: '/godot/godot.exe',
                platform: 'win32',
                arch: 'x86_64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
            launch_path: '/godot/godot.exe',
            config_version: 5,
            codeEditorId: null,
            withGit: false,
            valid: true,
        };

        getProjectsSnapshot.mockResolvedValue({
            projects: [storedProject],
            version: 'v1',
        });
        gitServiceMocks.init.mockResolvedValue(false);
        gitServiceMocks.inspectRepository.mockResolvedValue({
            status: 'not-a-repository',
        });

        await expect(
            initializeProjectGit({ ...storedProject }, gitService),
        ).rejects.toThrow('projects:initGit.errors.initFailed');

        expect(storeProjectsList).not.toHaveBeenCalled();
        expect(ipcWebContentsSend).not.toHaveBeenCalled();
    });

    it('accepts an enclosing repository without initializing Git', async () => {
        const storedProject = createProjectDetails({
            path: '/projects/parent/demo',
            withGit: false,
        });
        getProjectsSnapshot.mockResolvedValue({
            projects: [storedProject],
            version: 'v1',
        });
        storeProjectsList.mockImplementation(
            async (_path, projects, _options) => projects,
        );
        gitServiceMocks.inspectRepository.mockResolvedValue({
            status: 'inside-work-tree',
            root: '/projects/parent',
            isProjectRoot: false,
            kind: 'standard',
        });

        const result = await initializeProjectGit(storedProject, gitService);

        expect(result.project.withGit).toBe(true);
        expect(result.gitSetup).toEqual({
            status: 'existing-repository',
            root: '/projects/parent',
            isProjectRoot: false,
            kind: 'standard',
        });
        expect(gitServiceMocks.init).not.toHaveBeenCalled();
    });
});

describe('project Git identity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getDefaultDirs.mockReturnValue({ configDir: '/config' });
    });

    it('reports repository and inherited identity sources', async () => {
        const project = createProjectDetails({
            path: '/projects/demo',
            withGit: true,
        });
        getProjectsSnapshot.mockResolvedValue({
            projects: [project],
            version: 'v1',
        });
        gitServiceMocks.inspectRepository.mockResolvedValue({
            status: 'inside-work-tree',
            root: project.path,
            isProjectRoot: true,
            kind: 'standard',
        });
        gitServiceMocks.getIdentity.mockResolvedValue({
            name: 'Local Name',
            email: 'inherited@example.com',
        });
        gitServiceMocks.getLocalIdentity.mockResolvedValue({
            name: 'Local Name',
            email: '',
        });

        await expect(
            getProjectGitIdentity(project, gitService),
        ).resolves.toEqual(
            expect.objectContaining({
                status: 'available',
                canUpdate: true,
                name: { value: 'Local Name', source: 'repository' },
                email: {
                    value: 'inherited@example.com',
                    source: 'inherited',
                },
            }),
        );
    });

    it.each([
        {
            root: '/projects',
            isProjectRoot: false,
            kind: 'standard' as const,
        },
        {
            root: '/projects/demo',
            isProjectRoot: true,
            kind: 'linked-worktree' as const,
        },
    ])('refuses local updates for $kind repositories', async (inspection) => {
        const project = createProjectDetails({
            path: '/projects/demo',
            withGit: true,
        });
        getProjectsSnapshot.mockResolvedValue({
            projects: [project],
            version: 'v1',
        });
        gitServiceMocks.inspectRepository.mockResolvedValue({
            status: 'inside-work-tree',
            ...inspection,
        });

        await expect(
            setProjectGitIdentity(
                project,
                { name: 'Mario', email: 'mario@example.com' },
                gitService,
            ),
        ).rejects.toThrow(
            'projects:editProject.sourceControl.updateNotAllowed',
        );
        expect(gitServiceMocks.setIdentity).not.toHaveBeenCalled();
    });

    it('updates an exact repository root and returns refreshed identity', async () => {
        const project = createProjectDetails({
            path: '/projects/demo',
            withGit: true,
        });
        getProjectsSnapshot.mockResolvedValue({
            projects: [project],
            version: 'v1',
        });
        gitServiceMocks.inspectRepository.mockResolvedValue({
            status: 'inside-work-tree',
            root: project.path,
            isProjectRoot: true,
            kind: 'submodule',
        });
        gitServiceMocks.setIdentity.mockResolvedValue(true);
        gitServiceMocks.getIdentity.mockResolvedValue({
            name: 'Mario',
            email: 'mario@example.com',
        });
        gitServiceMocks.getLocalIdentity.mockResolvedValue({
            name: 'Mario',
            email: 'mario@example.com',
        });

        const result = await setProjectGitIdentity(
            project,
            { name: ' Mario ', email: ' mario@example.com ' },
            gitService,
        );

        expect(gitServiceMocks.setIdentity).toHaveBeenCalledWith(
            ' Mario ',
            ' mario@example.com ',
            'repository',
            project.path,
        );
        expect(result).toMatchObject({ status: 'available', canUpdate: true });
    });
});
