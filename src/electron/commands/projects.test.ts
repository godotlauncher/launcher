import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonStoreConflictError } from '../utils/jsonStore.js';
import { initializeProjectGit, setProjectVSCode } from './projects.js';

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
    createNewEditorSettings: vi.fn(),
    updateEditorSettings: vi.fn(),
}));

vi.mock('../utils/godotProject.utils.js', () => godotProjectMocks);

const vscodeUtilsMocks = vi.hoisted(() => ({
    updateVSCodeSettings: vi.fn(),
    addVSCodeNETLaunchConfig: vi.fn(),
    addOrUpdateVSCodeRecommendedExtensions: vi.fn(),
}));

vi.mock('../utils/vscode.utils.js', () => vscodeUtilsMocks);

const gitUtilsMocks = vi.hoisted(() => ({
    gitInit: vi.fn(),
}));

vi.mock('../utils/git.utils.js', () => gitUtilsMocks);

const installedToolsMocks = vi.hoisted(() => ({
    getInstalledTools: vi.fn(),
}));

vi.mock('./installedTools.js', () => installedToolsMocks);

const toolCacheMocks = vi.hoisted(() => ({
    getCachedTools: vi.fn(),
    isToolAvailable: vi.fn(),
    isCacheStale: vi.fn(),
    refreshToolCache: vi.fn(),
}));

vi.mock('../services/toolCache.js', () => toolCacheMocks);

const pathResolverMocks = vi.hoisted(() => ({
    getAssetPath: vi.fn(),
}));

vi.mock('../pathResolver.js', () => pathResolverMocks);

const utilsMocks = vi.hoisted(() => ({
    ipcWebContentsSend: vi.fn(),
}));

vi.mock('../utils.js', () => utilsMocks);

const mainMocks = vi.hoisted(() => ({
    getMainWindow: vi.fn(),
}));

vi.mock('../main.js', () => mainMocks);

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
const { getProjectsSnapshot, storeProjectsList } = projectUtilsMocks;
const { getProjectDefinition } = godotUtilsMocks;
const { createNewEditorSettings, updateEditorSettings } = godotProjectMocks;
const {
    updateVSCodeSettings,
    addVSCodeNETLaunchConfig,
    addOrUpdateVSCodeRecommendedExtensions,
} = vscodeUtilsMocks;
const { gitInit } = gitUtilsMocks;
const { getInstalledTools } = installedToolsMocks;
const { getCachedTools } = toolCacheMocks;
const { getAssetPath } = pathResolverMocks;
const { ipcWebContentsSend } = utilsMocks;
const { getMainWindow } = mainMocks;

let windowMock: { webContents: unknown };

describe('setProjectVSCode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getDefaultDirs.mockReturnValue({ configDir: '/config' });
        getAssetPath.mockReturnValue('/assets');
        windowMock = { webContents: {} };
        getMainWindow.mockReturnValue(windowMock);
        // Mock getCachedTools to return VSCode as available by default
        getCachedTools.mockResolvedValue([
            { name: 'VSCode', path: '/Applications/Code', verified: true },
        ]);
        // By default, have storeProjectsList return the updated array it was
        // called with. Tests that need special behavior can override this.
        storeProjectsList.mockImplementation(
            async (_p: string, updated: ProjectDetails[]) =>
                updated as ProjectDetails[],
        );
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
            withVSCode: false,
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
        getInstalledTools.mockResolvedValue([
            { name: 'VSCode', version: '', path: '/Applications/Code' },
        ]);
        existsSync.mockImplementation(
            (target: unknown) =>
                target ===
                '/projects/demo/editor_data/editor_settings-4.2.tres',
        );
        updateEditorSettings.mockResolvedValue(undefined);
        updateVSCodeSettings.mockResolvedValue(undefined);
        addOrUpdateVSCodeRecommendedExtensions.mockResolvedValue(undefined);
        addVSCodeNETLaunchConfig.mockResolvedValue(undefined);

        const result = await setProjectVSCode(project, true);

        const expectedExecPath =
            process.platform === 'darwin'
                ? path.resolve(
                      '/Applications/Code',
                      'Contents',
                      'MacOS',
                      'Electron',
                  )
                : '/Applications/Code';

        expect(updateEditorSettings).toHaveBeenCalledWith(
            '/projects/demo/editor_data/editor_settings-4.2.tres',
            expect.objectContaining({
                execPath: expectedExecPath,
                execFlags: '{project} --goto {file}:{line}:{col}',
                useExternalEditor: true,
                isMono: true,
            }),
        );
        expect(updateVSCodeSettings).toHaveBeenCalledWith(
            '/projects/demo',
            '/godot/godot.exe',
            4.2,
            true,
        );
        expect(addOrUpdateVSCodeRecommendedExtensions).toHaveBeenCalledWith(
            '/projects/demo',
            true,
        );
        expect(addVSCodeNETLaunchConfig).toHaveBeenCalledWith(
            '/projects/demo',
            '/godot/godot.exe',
        );
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
        expect(result.withVSCode).toBe(true);
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
            withVSCode: false,
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
        getInstalledTools.mockResolvedValue([
            { name: 'VSCode', version: '', path: '/Applications/Code' },
        ]);
        existsSync.mockReturnValue(false);
        createNewEditorSettings.mockResolvedValue(
            '/projects/demo/editor_data/editor_settings-4.2.tres',
        );
        updateVSCodeSettings.mockResolvedValue(undefined);
        addOrUpdateVSCodeRecommendedExtensions.mockResolvedValue(undefined);

        const result = await setProjectVSCode(project, true);

        expect(createNewEditorSettings).toHaveBeenCalled();
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
            withVSCode: false,
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
        getCachedTools.mockResolvedValue([
            { name: 'VSCode', path: '/Applications/Code', verified: true },
        ]);
        getInstalledTools.mockResolvedValue([
            { name: 'VSCode', version: '', path: '/Applications/Code' },
        ]);
        existsSync.mockReturnValue(true);
        updateEditorSettings.mockResolvedValue(undefined);
        updateVSCodeSettings.mockResolvedValue(undefined);
        addOrUpdateVSCodeRecommendedExtensions.mockResolvedValue(undefined);
        addVSCodeNETLaunchConfig.mockResolvedValue(undefined);

        const result = await setProjectVSCode(project, true);

        expect(storeProjectsList).toHaveBeenCalledTimes(2);
        expect(result.withVSCode).toBe(true);
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
            withVSCode: true,
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
        updateEditorSettings.mockResolvedValue(undefined);

        const result = await setProjectVSCode(project, false);

        expect(updateEditorSettings).toHaveBeenCalledWith(
            '/projects/demo/editor_data/editor_settings-4.2.tres',
            { useExternalEditor: false },
        );
        expect(result.withVSCode).toBe(false);
        expect(updateVSCodeSettings).not.toHaveBeenCalled();
        expect(addOrUpdateVSCodeRecommendedExtensions).not.toHaveBeenCalled();
    });

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
            withVSCode: false,
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
        // Mock cache as having no VSCode
        getCachedTools.mockResolvedValue([]);
        // Mock full detection also returning no VSCode
        getInstalledTools.mockResolvedValue([]);
        getProjectDefinition.mockReturnValue({
            editorConfigFilename: () => 'editor_settings-4.2.tres',
            editorConfigFormat: 3,
            resources: [],
            projectFilename: 'project.godot',
            configVersion: 5,
            defaultRenderer: 'FORWARD_PLUS',
        });

        await expect(setProjectVSCode(project, true)).rejects.toThrow(
            'projects:toggleVSCode.errors.vscodeNotInstalled',
        );
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
            withVSCode: false,
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
            withVSCode: false,
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
