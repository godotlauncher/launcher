import path from 'node:path';
import type { ProjectDetails } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import { JsonStoreConflictError } from '../utils/jsonStore.js';
import {
    getProjectGodotName,
    initializeProjectGit,
    launchProject,
    removeProject,
    renameProject,
    setProjectCodeEditor,
} from './projects.js';

const childProcessMocks = vi.hoisted(() => ({
    spawn: vi.fn(() => ({
        on: vi.fn(),
        unref: vi.fn(),
        stderr: null,
    })),
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

vi.mock('../utils/projects.utils.js', () => projectUtilsMocks);

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

const gitUtilsMocks = vi.hoisted(() => ({
    gitInit: vi.fn(),
}));

vi.mock('../utils/git.utils.js', () => gitUtilsMocks);

const userPreferencesMocks = vi.hoisted(() => ({
    getUserPreferences: vi.fn(),
}));

vi.mock('./userPreferences.js', () => userPreferencesMocks);

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
const { gitInit } = gitUtilsMocks;
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

let windowMock: { webContents: unknown };

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
            close: vi.fn(),
        } as unknown as { webContents: unknown };
        getMainWindow.mockReturnValue(windowMock);
        getUserPreferences.mockResolvedValue({ post_launch_action: 'none' });
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

        await launchProject(project, codeEditorIntegrationService);

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
            launchProject(project, codeEditorIntegrationService),
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
            launchProject(project, codeEditorIntegrationService),
        ).resolves.toEqual({
            launched: false,
            reason: 'code_editor_unavailable',
            integration: {
                id: 'vscode',
                displayName: 'Visual Studio Code',
                capabilities: { dotnet: true },
            },
        });

        expect(getProjectsSnapshot).not.toHaveBeenCalled();
        expect(storeProjectsList).not.toHaveBeenCalled();
        expect(writeProjectLauncherConfig).not.toHaveBeenCalled();
        expect(childProcessMocks.spawn).not.toHaveBeenCalled();
    });

    it('launches without scanning when the missing editor warning is explicitly bypassed', async () => {
        const project = createProjectDetails();
        getProjectsSnapshot.mockResolvedValue({
            projects: [project],
            version: 'v1',
        });

        await expect(
            launchProject(project, codeEditorIntegrationService, {
                allowMissingCodeEditor: true,
            }),
        ).resolves.toEqual({ launched: true });

        expect(integrationMocks.rescanIntegration).not.toHaveBeenCalled();
        expect(childProcessMocks.spawn).toHaveBeenCalled();
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

        gitInit.mockResolvedValue(true);
        existsSync.mockImplementation(
            (target: unknown) =>
                typeof target === 'string' &&
                target.endsWith(`${path.sep}.git`),
        );

        const result = await initializeProjectGit({ ...storedProject });

        expect(gitInit).toHaveBeenCalledWith(storedProject.path);
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
        expect(result.withGit).toBe(true);
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
        gitInit.mockResolvedValue(false);
        existsSync.mockReturnValue(false);

        await expect(
            initializeProjectGit({ ...storedProject }),
        ).rejects.toThrow('projects:initGit.errors.initFailed');

        expect(storeProjectsList).not.toHaveBeenCalled();
        expect(ipcWebContentsSend).not.toHaveBeenCalled();
    });
});
