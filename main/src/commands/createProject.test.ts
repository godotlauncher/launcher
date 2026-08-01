import path from 'node:path';
import type { InstalledRelease } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import { createProject } from './createProject.js';

const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
    promises: {
        lstat: vi.fn(),
        readdir: vi.fn(),
        mkdir: vi.fn(),
        writeFile: vi.fn(),
        copyFile: vi.fn(),
        rm: vi.fn(),
    },
}));

vi.mock('node:fs', () => ({
    existsSync: fsMocks.existsSync,
    promises: fsMocks.promises,
    default: {
        existsSync: fsMocks.existsSync,
        promises: fsMocks.promises,
    },
}));

vi.mock('electron', () => ({
    app: {
        getVersion: vi.fn(() => '1.0.0'),
    },
}));

vi.mock('electron-log', () => ({
    default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../i18n/index.js', () => ({
    t: (key: string) => key,
}));

vi.mock('../pathResolver.js', () => ({
    getAssetPath: vi.fn(() => '/assets'),
}));

const gitMocks = vi.hoisted(() => ({
    gitAddAndCommit: vi.fn(),
    gitInit: vi.fn(),
}));

vi.mock('../utils/git.utils.js', () => gitMocks);

const godotUtilsMocks = vi.hoisted(() => ({
    createProjectFile: vi.fn(),
    DEFAULT_PROJECT_DEFINITION: new Map(),
    getProjectDefinition: vi.fn(),
    SetProjectEditorRelease: vi.fn(),
}));

vi.mock('../utils/godot.utils.js', () => godotUtilsMocks);

const godotProjectMocks = vi.hoisted(() => ({
    createNewEditorSettings: vi.fn(),
    getProjectIconUrlFromParsed: vi.fn(),
    parseGodotProjectFile: vi.fn(),
}));

vi.mock('../utils/godotProject.utils.js', () => godotProjectMocks);

const platformMocks = vi.hoisted(() => ({
    getDefaultDirs: vi.fn(),
}));

vi.mock('../utils/platform.utils.js', () => platformMocks);

const projectUtilsMocks = vi.hoisted(() => ({
    addProjectToList: vi.fn(),
}));

vi.mock('../utils/projects.utils.js', () => projectUtilsMocks);

const installedToolsMocks = vi.hoisted(() => ({
    getInstalledTools: vi.fn(),
}));

vi.mock('./installedTools.js', () => installedToolsMocks);

const userPreferencesMocks = vi.hoisted(() => ({
    getUserPreferences: vi.fn(),
}));

vi.mock('./userPreferences.js', () => userPreferencesMocks);

const projectLauncherConfigMocks = vi.hoisted(() => ({
    writeProjectLauncherConfig: vi.fn(),
}));

vi.mock('../utils/projectLauncherConfig.utils.js', () => ({
    writeProjectLauncherConfig:
        projectLauncherConfigMocks.writeProjectLauncherConfig,
}));

const codeEditorIntegrationServiceMocks = {
    assertIntegrationSelectable: vi.fn(),
    applyToProject: vi.fn(),
};
const codeEditorIntegrationService =
    codeEditorIntegrationServiceMocks as unknown as CodeEditorIntegrationService;

describe('createProject', () => {
    const release: InstalledRelease = {
        version: '4.3-stable',
        version_number: 4.3,
        install_path: '/install/4.3',
        editor_path: '/install/4.3/Godot',
        platform: 'darwin',
        arch: 'arm64',
        mono: false,
        prerelease: false,
        config_version: 5,
        published_at: null,
        valid: true,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        fsMocks.existsSync.mockReturnValue(false);
        fsMocks.promises.mkdir.mockResolvedValue(undefined);
        fsMocks.promises.writeFile.mockResolvedValue(undefined);
        fsMocks.promises.rm.mockResolvedValue(undefined);
        installedToolsMocks.getInstalledTools.mockResolvedValue([]);
        userPreferencesMocks.getUserPreferences.mockResolvedValue({
            projects_location: '/projects',
            install_location: '/install',
        });
        godotUtilsMocks.getProjectDefinition.mockReturnValue({
            configVersion: 5,
            defaultRenderer: 'FORWARD_PLUS',
            resources: [],
            projectFilename: 'project.godot',
            editorConfigFilename: () => 'editor_settings-4.3.tres',
            editorConfigFormat: 3,
        });
        godotUtilsMocks.createProjectFile.mockResolvedValue('project file');
        godotProjectMocks.parseGodotProjectFile.mockReturnValue(new Map());
        godotProjectMocks.getProjectIconUrlFromParsed.mockReturnValue(
            'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        );
        godotUtilsMocks.SetProjectEditorRelease.mockResolvedValue(
            '/launch/Godot',
        );
        platformMocks.getDefaultDirs.mockReturnValue({
            configDir: '/config',
            dataDir: '',
            projectDir: '',
            prefsPath: '',
            releaseCachePath: '',
            installedReleasesCachePath: '',
            prereleaseCachePath: '',
        });
        projectUtilsMocks.addProjectToList.mockResolvedValue([]);
        projectLauncherConfigMocks.writeProjectLauncherConfig.mockResolvedValue(
            undefined,
        );
        codeEditorIntegrationServiceMocks.assertIntegrationSelectable.mockResolvedValue(
            undefined,
        );
        codeEditorIntegrationServiceMocks.applyToProject.mockResolvedValue({
            editorSettingsFile: '/configured/editor_settings.tres',
            recoveredConfigFiles: [],
        });
    });

    it('writes project launcher config after creating a project', async () => {
        const result = await createProject(
            'Test Project',
            release,
            'FORWARD_PLUS',
            null,
            false,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(
            projectLauncherConfigMocks.writeProjectLauncherConfig,
        ).toHaveBeenCalledWith(
            path.resolve('/projects/Test-Project'),
            expect.objectContaining({
                release: expect.objectContaining({ version: '4.3-stable' }),
                launcherVersion: '1.0.0',
                codeEditorId: null,
            }),
        );
        expect(result.projectDetails?.icon_path).toBe(
            'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        );
    });

    it('applies and persists the selected code editor integration', async () => {
        const result = await createProject(
            'Integrated Project',
            release,
            'FORWARD_PLUS',
            'vscode',
            false,
            codeEditorIntegrationService,
        );

        expect(
            codeEditorIntegrationServiceMocks.applyToProject,
        ).toHaveBeenCalledWith(
            'vscode',
            expect.objectContaining({
                projectPath: path.resolve('/projects/Integrated-Project'),
                configurationMode: 'create',
                mono: false,
            }),
        );
        expect(result.projectDetails?.codeEditorId).toBe('vscode');
        expect(result.projectDetails?.withVSCode).toBe(true);
        expect(
            projectLauncherConfigMocks.writeProjectLauncherConfig,
        ).toHaveBeenCalledWith(
            path.resolve('/projects/Integrated-Project'),
            expect.objectContaining({
                release: expect.objectContaining({ version: '4.3-stable' }),
                launcherVersion: '1.0.0',
                codeEditorId: 'vscode',
            }),
        );
        expect(result.projectDetails?.editor_settings_file).toBe(
            '/configured/editor_settings.tres',
        );
    });

    it.each([
        'disabled',
        'unavailable',
    ])('rejects a directly requested %s integration before writing project files', async (state) => {
        codeEditorIntegrationServiceMocks.assertIntegrationSelectable.mockRejectedValue(
            new Error(`Visual Studio Code is ${state}.`),
        );

        const result = await createProject(
            'Rejected Project',
            release,
            'FORWARD_PLUS',
            'vscode',
            false,
            codeEditorIntegrationService,
        );

        expect(result).toEqual({
            success: false,
            error: `Visual Studio Code is ${state}.`,
        });
        expect(
            codeEditorIntegrationServiceMocks.assertIntegrationSelectable,
        ).toHaveBeenCalledWith('vscode');
        expect(godotUtilsMocks.createProjectFile).not.toHaveBeenCalled();
        expect(fsMocks.promises.mkdir).not.toHaveBeenCalled();
        expect(fsMocks.promises.writeFile).not.toHaveBeenCalled();
        expect(fsMocks.promises.rm).not.toHaveBeenCalled();
        expect(projectUtilsMocks.addProjectToList).not.toHaveBeenCalled();
    });
});
