import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addProject } from './addProject';

const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFile: vi.fn(),
}));

vi.mock('node:fs', () => ({
    existsSync: fsMocks.existsSync,
    readdirSync: fsMocks.readdirSync,
    promises: { readFile: fsMocks.readFile },
    default: {
        existsSync: fsMocks.existsSync,
        readdirSync: fsMocks.readdirSync,
        promises: { readFile: fsMocks.readFile },
    },
}));

const godotProjectMocks = vi.hoisted(() => ({
    parseGodotProjectFile: vi.fn(),
    getProjectNameFromParsed: vi.fn(),
    getProjectRendererFromParsed: vi.fn(),
    getProjectConfigVersionFromParsed: vi.fn(),
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

const platformMocks = vi.hoisted(() => ({
    getDefaultDirs: vi.fn(),
}));

vi.mock('../utils/platform.utils.js', () => platformMocks);

const projectUtilsMocks = vi.hoisted(() => ({
    addProjectToList: vi.fn(),
}));

vi.mock('../utils/projects.utils.js', () => projectUtilsMocks);

const releasesMocks = vi.hoisted(() => ({
    getInstalledReleases: vi.fn(),
}));

vi.mock('./releases.js', () => releasesMocks);

const userPreferencesMocks = vi.hoisted(() => ({
    getUserPreferences: vi.fn(),
}));

vi.mock('./userPreferences.js', () => userPreferencesMocks);

const projectsMocks = vi.hoisted(() => ({
    getProjectsDetails: vi.fn(),
}));

vi.mock('./projects.js', () => projectsMocks);

const installedToolsMocks = vi.hoisted(() => ({
    getInstalledTools: vi.fn(),
}));

vi.mock('./installedTools.js', () => installedToolsMocks);

const godotUtilsMocks = vi.hoisted(() => ({
    DEFAULT_PROJECT_DEFINITION: new Map(),
    getProjectDefinition: vi.fn(),
    SetProjectEditorRelease: vi.fn(),
}));

vi.mock('../utils/godot.utils.js', () => godotUtilsMocks);

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

vi.mock('electron', () => ({
    Menu: {
        setApplicationMenu: vi.fn(),
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
    },
    dialog: {
        showOpenDialog: vi.fn(),
        showMessageBox: vi.fn(),
    },
}));

vi.mock('electron-log', () => ({
    default: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { existsSync, readdirSync, readFile } = fsMocks;
const {
    parseGodotProjectFile,
    getProjectNameFromParsed,
    getProjectRendererFromParsed,
    getProjectConfigVersionFromParsed,
    createNewEditorSettings,
    updateEditorSettings,
} = godotProjectMocks;
const {
    updateVSCodeSettings,
    addVSCodeNETLaunchConfig,
    addOrUpdateVSCodeRecommendedExtensions,
} = vscodeUtilsMocks;
const { getDefaultDirs } = platformMocks;
const { addProjectToList } = projectUtilsMocks;
const { getInstalledReleases } = releasesMocks;
const { getUserPreferences } = userPreferencesMocks;
const { getProjectsDetails } = projectsMocks;
const { getInstalledTools } = installedToolsMocks;
const { getProjectDefinition, SetProjectEditorRelease: setProjectEditorRelease } =
    godotUtilsMocks;

describe('addProject', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        existsSync.mockImplementation((target) =>
            typeof target === 'string' && target.endsWith('project.godot')
        );
        readdirSync.mockReturnValue(['project.godot']);
        readFile.mockResolvedValue('dummy');
        parseGodotProjectFile.mockReturnValue(new Map());
        getProjectNameFromParsed.mockResolvedValue('Sample Project');
        getProjectRendererFromParsed.mockResolvedValue('FORWARD_PLUS');
        getProjectConfigVersionFromParsed.mockResolvedValue(5);

        getDefaultDirs.mockReturnValue({
            configDir: '/config',
            dataDir: '',
            projectDir: '',
            prefsPath: '',
            releaseCachePath: '',
            installedReleasesCachePath: '',
            prereleaseCachePath: '',
        });

        getProjectsDetails.mockResolvedValue([]);
        getUserPreferences.mockResolvedValue({
            prefs_version: 1,
            install_location: '/install',
            config_location: '',
            projects_location: '',
            post_launch_action: 'none',
            auto_check_updates: false,
            auto_start: false,
            start_in_tray: false,
            confirm_project_remove: false,
            first_run: false,
        });

        getInstalledReleases.mockResolvedValue([
            {
                version: '4.3-stable',
                version_number: 4.3,
                install_path: '/install/4.3',
                editor_path: '/install/4.3/Godot',
                platform: 'linux',
                arch: 'x86_64',
                mono: true,
                prerelease: false,
                config_version: 5,
                published_at: null,
                valid: true,
            },
        ]);

        getInstalledTools.mockResolvedValue([]);
        addProjectToList.mockImplementation(async (_path, project) => [project]);
        getProjectDefinition.mockReturnValue({
            editorConfigFilename: () => 'editor_settings-4.tres',
            editorConfigFormat: 3,
        });
        setProjectEditorRelease.mockResolvedValue('/fake/launch');
        
        // Mock VSCode utilities
        updateVSCodeSettings.mockResolvedValue(undefined);
        addVSCodeNETLaunchConfig.mockResolvedValue(undefined);
        addOrUpdateVSCodeRecommendedExtensions.mockResolvedValue(undefined);
        createNewEditorSettings.mockResolvedValue('/fake/editor/settings');
        updateEditorSettings.mockResolvedValue(undefined);
    });

    it('falls back to an installed mono editor when no flavor-specific match is found', async () => {
        const result = await addProject('/fake/project/project.godot');

        expect(result.success).toBe(true);
        expect(result.newProject?.release.mono).toBe(true);
        expect(result.newProject?.release.version).toBe('4.3-stable');
        expect(setProjectEditorRelease).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ mono: true, version: '4.3-stable' })
        );
    });

    it('should not return additionalInfo in the result', async () => {
        const result = await addProject('/fake/project/project.godot');

        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty('additionalInfo');
    });

    it('should create new editor settings when VSCode is detected and settings do not exist', async () => {
        // Setup VSCode tool
        getInstalledTools.mockResolvedValue([
            {
                name: 'VSCode',
                version: '1.85.0',
                path: '/usr/bin/code',
            },
        ]);

        // Mock .vscode folder exists but no editor settings
        existsSync.mockImplementation((target) => {
            if (typeof target === 'string') {
                if (target.endsWith('project.godot')) return true;
                if (target.includes('.vscode')) return true;
                if (target.includes('editor_settings')) return false;
                return false;
            }
            return false;
        });

        const result = await addProject('/fake/project/project.godot');

        expect(result.success).toBe(true);
        expect(createNewEditorSettings).toHaveBeenCalledTimes(1);
        expect(updateEditorSettings).not.toHaveBeenCalled();
        expect(updateVSCodeSettings).toHaveBeenCalledTimes(1);
        expect(addOrUpdateVSCodeRecommendedExtensions).toHaveBeenCalledTimes(1);
    });

    it('should update existing editor settings when VSCode is detected and settings exist', async () => {
        // Setup VSCode tool
        getInstalledTools.mockResolvedValue([
            {
                name: 'VSCode',
                version: '1.85.0',
                path: '/usr/bin/code',
            },
        ]);

        // Mock .vscode folder and editor settings exist
        existsSync.mockImplementation((target) => {
            if (typeof target === 'string') {
                if (target.endsWith('project.godot')) return true;
                if (target.includes('.vscode')) return true;
                if (target.includes('editor_settings')) return true;
                return false;
            }
            return false;
        });

        const result = await addProject('/fake/project/project.godot');

        expect(result.success).toBe(true);
        expect(updateEditorSettings).toHaveBeenCalledTimes(1);
        expect(updateEditorSettings).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                execPath: expect.any(String),
                execFlags: '{project} --goto {file}:{line}:{col}',
                useExternalEditor: true,
                isMono: true,
            })
        );
        expect(createNewEditorSettings).not.toHaveBeenCalled();
        expect(updateVSCodeSettings).toHaveBeenCalledTimes(1);
        expect(addOrUpdateVSCodeRecommendedExtensions).toHaveBeenCalledTimes(1);
    });

    it('should always call updateVSCodeSettings when VSCode is detected', async () => {
        getInstalledTools.mockResolvedValue([
            {
                name: 'VSCode',
                version: '1.85.0',
                path: '/usr/bin/code',
            },
        ]);

        existsSync.mockImplementation((target) => {
            if (typeof target === 'string') {
                if (target.endsWith('project.godot')) return true;
                if (target.includes('.vscode')) return true;
                return false;
            }
            return false;
        });

        const result = await addProject('/fake/project/project.godot');

        expect(result.success).toBe(true);
        expect(updateVSCodeSettings).toHaveBeenCalledWith(
            expect.stringContaining('/fake/project'),
            '/fake/launch',
            4.3,
            true
        );
    });

    it('should call addVSCodeNETLaunchConfig when using mono release', async () => {
        getInstalledTools.mockResolvedValue([
            {
                name: 'VSCode',
                version: '1.85.0',
                path: '/usr/bin/code',
            },
        ]);

        existsSync.mockImplementation((target) => {
            if (typeof target === 'string') {
                if (target.endsWith('project.godot')) return true;
                if (target.includes('.vscode')) return true;
                return false;
            }
            return false;
        });

        const result = await addProject('/fake/project/project.godot');

        expect(result.success).toBe(true);
        expect(addVSCodeNETLaunchConfig).toHaveBeenCalledWith(
            expect.stringContaining('/fake/project'),
            '/fake/launch'
        );
    });

    it('should not call VSCode setup functions when VSCode is not detected', async () => {
        getInstalledTools.mockResolvedValue([]);

        existsSync.mockImplementation((target) => {
            if (typeof target === 'string') {
                if (target.endsWith('project.godot')) return true;
                return false;
            }
            return false;
        });

        const result = await addProject('/fake/project/project.godot');

        expect(result.success).toBe(true);
        expect(createNewEditorSettings).not.toHaveBeenCalled();
        expect(updateEditorSettings).not.toHaveBeenCalled();
        expect(updateVSCodeSettings).not.toHaveBeenCalled();
        expect(addVSCodeNETLaunchConfig).not.toHaveBeenCalled();
        expect(addOrUpdateVSCodeRecommendedExtensions).not.toHaveBeenCalled();
    });

    it('should not call VSCode setup functions when .vscode folder does not exist', async () => {
        getInstalledTools.mockResolvedValue([
            {
                name: 'VSCode',
                version: '1.85.0',
                path: '/usr/bin/code',
            },
        ]);

        existsSync.mockImplementation((target) => {
            if (typeof target === 'string') {
                if (target.endsWith('project.godot')) return true;
                if (target.includes('.vscode')) return false;
                return false;
            }
            return false;
        });

        const result = await addProject('/fake/project/project.godot');

        expect(result.success).toBe(true);
        expect(createNewEditorSettings).not.toHaveBeenCalled();
        expect(updateEditorSettings).not.toHaveBeenCalled();
        expect(updateVSCodeSettings).not.toHaveBeenCalled();
        expect(addVSCodeNETLaunchConfig).not.toHaveBeenCalled();
        expect(addOrUpdateVSCodeRecommendedExtensions).not.toHaveBeenCalled();
    });
});
