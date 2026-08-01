import path from 'node:path';
import type { InstalledRelease, ProjectDetails } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import { setProjectEditor } from './setProjectEditor.js';

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

const userPreferencesMocks = vi.hoisted(() => ({
    getUserPreferences: vi.fn(),
}));

vi.mock('./userPreferences.js', () => userPreferencesMocks);

const projectUtilsMocks = vi.hoisted(() => ({
    getProjectsSnapshot: vi.fn(),
    getStoredProjectsList: vi.fn(),
    storeProjectsList: vi.fn(),
}));

vi.mock('../utils/projects.utils.js', () => projectUtilsMocks);

const godotUtilsMocks = vi.hoisted(() => ({
    DEFAULT_PROJECT_DEFINITION: new Map(),
    getProjectDefinition: vi.fn(),
    SetProjectEditorRelease: vi.fn(),
}));

vi.mock('../utils/godot.utils.js', () => godotUtilsMocks);

const godotProjectMocks = vi.hoisted(() => ({
    createNewEditorSettings: vi.fn(),
    updateEditorSettings: vi.fn(),
}));

vi.mock('../utils/godotProject.utils.js', () => godotProjectMocks);

const installedToolsMocks = vi.hoisted(() => ({
    getInstalledTools: vi.fn(),
}));

vi.mock('./installedTools.js', () => installedToolsMocks);

const vscodeUtilsMocks = vi.hoisted(() => ({
    updateVSCodeSettings: vi.fn(),
    addVSCodeNETLaunchConfig: vi.fn(),
    addOrUpdateVSCodeRecommendedExtensions: vi.fn(),
}));

vi.mock('../utils/vscode.utils.js', () => vscodeUtilsMocks);

const projectLauncherConfigMocks = vi.hoisted(() => ({
    writeProjectLauncherConfig: vi.fn(),
}));

vi.mock('../utils/projectLauncherConfig.utils.js', () => ({
    writeProjectLauncherConfig:
        projectLauncherConfigMocks.writeProjectLauncherConfig,
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

const { existsSync } = fsMocks;
const { getDefaultDirs } = platformMocks;
const { getUserPreferences } = userPreferencesMocks;
const { getProjectsSnapshot, storeProjectsList } = projectUtilsMocks;
const { getProjectDefinition, SetProjectEditorRelease } = godotUtilsMocks;
const { createNewEditorSettings, updateEditorSettings } = godotProjectMocks;
const { getInstalledTools } = installedToolsMocks;
const codeEditorIntegrationService = {
    scanIntegration: vi.fn(),
    applyToProject: vi.fn(),
    disableForProject: vi.fn(),
} as unknown as CodeEditorIntegrationService;

const integrationMocks = codeEditorIntegrationService as unknown as {
    scanIntegration: ReturnType<typeof vi.fn>;
    applyToProject: ReturnType<typeof vi.fn>;
    disableForProject: ReturnType<typeof vi.fn>;
};

const {
    updateVSCodeSettings,
    addVSCodeNETLaunchConfig,
    addOrUpdateVSCodeRecommendedExtensions,
} = vscodeUtilsMocks;
const { writeProjectLauncherConfig } = projectLauncherConfigMocks;

describe('setProjectEditor', () => {
    let mockProject: ProjectDetails;
    let mockNewRelease: InstalledRelease;
    let mockOldRelease: InstalledRelease;

    beforeEach(() => {
        vi.clearAllMocks();

        mockOldRelease = {
            version: '4.2-stable',
            version_number: 4.2,
            install_path: '/install/4.2',
            editor_path: '/install/4.2/Godot',
            platform: 'linux',
            arch: 'x86_64',
            mono: false,
            prerelease: false,
            config_version: 5,
            published_at: null,
            valid: true,
        };

        mockNewRelease = {
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
        };

        mockProject = {
            name: 'Test Project',
            version: '4.2-stable',
            version_number: 4.2,
            renderer: 'FORWARD_PLUS',
            path: '/fake/project',
            editor_settings_path: '/fake/editor/data',
            editor_settings_file: '/fake/editor/data/editor_settings-4.2.tres',
            last_opened: null,
            release: mockOldRelease,
            launch_path: '/fake/launch/old',
            config_version: 5,
            withVSCode: true,
            codeEditorId: 'vscode',
            withGit: false,
            valid: true,
        };

        getDefaultDirs.mockReturnValue({
            configDir: '/config',
            dataDir: '',
            projectDir: '',
            prefsPath: '',
            releaseCachePath: '',
            installedReleasesCachePath: '',
            prereleaseCachePath: '',
        });

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

        getProjectsSnapshot.mockResolvedValue({
            projects: [mockProject],
            version: 'v1',
        });
        storeProjectsList.mockImplementation(
            async (_path, projects, _options) => projects,
        );

        getProjectDefinition.mockReturnValue({
            editorConfigFilename: () => 'editor_settings-4.3.tres',
            editorConfigFormat: 3,
        });

        SetProjectEditorRelease.mockResolvedValue('/fake/launch/new');

        getInstalledTools.mockResolvedValue([
            {
                name: 'VSCode',
                version: '1.85.0',
                path: '/usr/bin/code',
            },
        ]);

        existsSync.mockReturnValue(false);

        // Mock VSCode utilities
        updateVSCodeSettings.mockResolvedValue(undefined);
        addVSCodeNETLaunchConfig.mockResolvedValue(undefined);
        addOrUpdateVSCodeRecommendedExtensions.mockResolvedValue(undefined);
        createNewEditorSettings.mockResolvedValue('/fake/editor/settings');
        updateEditorSettings.mockResolvedValue(undefined);
        writeProjectLauncherConfig.mockResolvedValue(undefined);
        integrationMocks.scanIntegration.mockResolvedValue({
            integrationId: 'vscode',
            path: '/usr/bin/code',
            version: null,
        });
        integrationMocks.applyToProject.mockImplementation(
            async (_id, context) => ({
                editorSettingsFile: context.editorSettingsFile,
                recoveredConfigFiles: [],
            }),
        );
        integrationMocks.disableForProject.mockResolvedValue(undefined);
    });

    it('should successfully change project editor version', async () => {
        const result = await setProjectEditor(
            mockProject,
            mockNewRelease,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(result.projects).toBeDefined();
        expect(result.projects?.[0].version).toBe('4.3-stable');
        expect(result.projects?.[0].release.version).toBe('4.3-stable');
        expect(writeProjectLauncherConfig).toHaveBeenCalledWith(
            '/fake/project',
            expect.objectContaining({
                release: expect.objectContaining({ version: '4.3-stable' }),
                launcherVersion: '1.0.0',
                lastOpened: null,
                codeEditorId: 'vscode',
            }),
        );
    });

    it('should not return additionalInfo in the result', async () => {
        const result = await setProjectEditor(
            mockProject,
            mockNewRelease,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(result).not.toHaveProperty('additionalInfo');
    });

    it('delegates the target Godot settings file to the selected integration', async () => {
        existsSync.mockReturnValue(false);

        const result = await setProjectEditor(
            mockProject,
            mockNewRelease,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(integrationMocks.applyToProject).toHaveBeenCalledWith(
            'vscode',
            expect.objectContaining({
                editorSettingsFile: expect.stringContaining(
                    'editor_settings-4.3.tres',
                ),
            }),
        );
    });

    it('should reuse the existing editor folder when the project name changes', async () => {
        mockProject.name = 'Renamed Project';

        const result = await setProjectEditor(
            mockProject,
            mockNewRelease,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(SetProjectEditorRelease).toHaveBeenCalledWith(
            path.dirname('/fake/launch/old'),
            mockNewRelease,
            mockOldRelease,
        );
    });

    it('uses update mode when applying the selected integration', async () => {
        existsSync.mockReturnValue(true);

        const result = await setProjectEditor(
            mockProject,
            mockNewRelease,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(integrationMocks.applyToProject).toHaveBeenCalledWith(
            'vscode',
            expect.objectContaining({ configurationMode: 'update' }),
        );
    });

    it('passes the changed Godot editor context to the integration', async () => {
        const result = await setProjectEditor(
            mockProject,
            mockNewRelease,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(integrationMocks.applyToProject).toHaveBeenCalledWith(
            'vscode',
            expect.objectContaining({
                projectPath: '/fake/project',
                godotLaunchPath: '/fake/launch/new',
                godotVersion: 4.3,
                mono: true,
            }),
        );
    });

    it('applies project-specific integration configuration once', async () => {
        const result = await setProjectEditor(
            mockProject,
            mockNewRelease,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(integrationMocks.applyToProject).toHaveBeenCalledOnce();
    });

    it('passes .NET flavor changes to the integration', async () => {
        const result = await setProjectEditor(
            mockProject,
            mockNewRelease,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(integrationMocks.applyToProject).toHaveBeenCalledWith(
            'vscode',
            expect.objectContaining({ mono: true }),
        );
    });

    it('passes standard flavor changes to the integration', async () => {
        mockNewRelease.mono = false;

        const result = await setProjectEditor(
            mockProject,
            mockNewRelease,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(integrationMocks.applyToProject).toHaveBeenCalledWith(
            'vscode',
            expect.objectContaining({ mono: false }),
        );
    });

    it('disables external editor settings when no integration is selected', async () => {
        mockProject.codeEditorId = null;
        mockProject.withVSCode = false;

        const result = await setProjectEditor(
            mockProject,
            mockNewRelease,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(integrationMocks.applyToProject).not.toHaveBeenCalled();
        expect(integrationMocks.disableForProject).toHaveBeenCalledWith(
            expect.stringContaining('editor_settings-4.3.tres'),
        );
    });

    it('preserves selection when the integration executable is unavailable', async () => {
        integrationMocks.scanIntegration.mockResolvedValue(null);

        const result = await setProjectEditor(
            mockProject,
            mockNewRelease,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(integrationMocks.applyToProject).not.toHaveBeenCalled();
        expect(result.projects?.[0].codeEditorId).toBe('vscode');
    });

    it('should return error when trying to use same release', async () => {
        const result = await setProjectEditor(
            mockProject,
            mockOldRelease,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(result.projects).toEqual([mockProject]);
    });

    it('should return error when project is not found', async () => {
        getProjectsSnapshot.mockResolvedValue({ projects: [], version: 'v1' });

        const result = await setProjectEditor(
            mockProject,
            mockNewRelease,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('should return error when trying to change to different major version', async () => {
        mockNewRelease.version_number = 3.5;

        const result = await setProjectEditor(
            mockProject,
            mockNewRelease,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });

    it('passes mono true when switching from standard to .NET', async () => {
        mockProject.release.mono = false;
        mockNewRelease.mono = true;
        existsSync.mockReturnValue(true);

        const result = await setProjectEditor(
            mockProject,
            mockNewRelease,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(integrationMocks.applyToProject).toHaveBeenCalledWith(
            'vscode',
            expect.objectContaining({ mono: true }),
        );
    });

    it('passes mono false when switching from .NET to standard', async () => {
        mockProject.release.mono = true;
        mockNewRelease.mono = false;
        existsSync.mockReturnValue(true);

        const result = await setProjectEditor(
            mockProject,
            mockNewRelease,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(integrationMocks.applyToProject).toHaveBeenCalledWith(
            'vscode',
            expect.objectContaining({ mono: false }),
        );
    });
});
