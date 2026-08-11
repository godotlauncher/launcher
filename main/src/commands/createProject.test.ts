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
    gitConfigSetIdentity: vi.fn(),
    gitInit: vi.fn(),
    gitRenameBranch: vi.fn(),
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
        fsMocks.promises.copyFile.mockResolvedValue(undefined);
        fsMocks.promises.rm.mockResolvedValue(undefined);
        gitMocks.gitInit.mockResolvedValue(true);
        gitMocks.gitRenameBranch.mockResolvedValue(true);
        gitMocks.gitConfigSetIdentity.mockResolvedValue(true);
        gitMocks.gitAddAndCommit.mockResolvedValue(true);
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
            }),
        );
        expect(result.projectDetails?.icon_path).toBe(
            'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        );
        expect(result.projectDetails?.name).toBe('Test Project');
        expect(result.projectDetails?.added_at).toBeInstanceOf(Date);
        expect(godotUtilsMocks.createProjectFile).toHaveBeenCalledWith(
            expect.any(String),
            5,
            release.version_number,
            'Test Project',
            'FORWARD_PLUS',
        );
    });

    it('uses a safe directory segment without changing the display name', async () => {
        const result = await createProject(
            'Example: Project',
            release,
            'FORWARD_PLUS',
            null,
            false,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(result.projectPath).toBe(
            path.resolve('/projects/Example--Project'),
        );
        expect(result.projectDetails?.name).toBe('Example: Project');
        expect(godotUtilsMocks.SetProjectEditorRelease).toHaveBeenCalledWith(
            path.resolve('/install/.editor_config/Example--Project'),
            release,
        );
    });

    it('sanitises the project segment appended to an override base path', async () => {
        const result = await createProject(
            'NUL.txt',
            release,
            'FORWARD_PLUS',
            null,
            false,
            codeEditorIntegrationService,
            path.resolve('/custom/NUL.txt'),
        );

        expect(result.projectPath).toBe(path.resolve('/custom/_NUL.txt'));
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
                mono: false,
            }),
        );
        expect(result.projectDetails?.codeEditorId).toBe('vscode');
        expect(
            projectLauncherConfigMocks.writeProjectLauncherConfig,
        ).toHaveBeenCalledWith(
            path.resolve('/projects/Integrated-Project'),
            expect.objectContaining({
                release: expect.objectContaining({ version: '4.3-stable' }),
                launcherVersion: '1.0.0',
            }),
        );
        expect(result.projectDetails?.editor_settings_file).toBe(
            '/configured/editor_settings.tres',
        );
    });

    it('adds Git metadata before initializing and committing', async () => {
        installedToolsMocks.getInstalledTools.mockResolvedValue([
            {
                name: 'Git',
                path: '/usr/bin/git',
                version: 'git version 2.54.0',
            },
        ]);

        const result = await createProject(
            'Git Project',
            release,
            'FORWARD_PLUS',
            null,
            true,
            codeEditorIntegrationService,
        );

        const projectPath = path.resolve('/projects/Git-Project');
        expect(result.success).toBe(true);
        expect(fsMocks.promises.copyFile).toHaveBeenNthCalledWith(
            1,
            path.resolve('/assets/project_resources/default_gitignore'),
            path.resolve(projectPath, '.gitignore'),
        );
        expect(fsMocks.promises.copyFile).toHaveBeenNthCalledWith(
            2,
            path.resolve('/assets/project_resources/default-gitattributes'),
            path.resolve(projectPath, '.gitattributes'),
        );
        expect(gitMocks.gitInit).toHaveBeenCalledWith(projectPath);
        expect(gitMocks.gitRenameBranch).toHaveBeenCalledWith(projectPath);
        expect(gitMocks.gitAddAndCommit).toHaveBeenCalledWith(projectPath);
        expect(
            projectLauncherConfigMocks.writeProjectLauncherConfig,
        ).toHaveBeenCalledWith(projectPath, {
            release,
            launcherVersion: '1.0.0',
        });

        const copyCallOrders =
            fsMocks.promises.copyFile.mock.invocationCallOrder;
        const launcherConfigCallOrder =
            projectLauncherConfigMocks.writeProjectLauncherConfig.mock
                .invocationCallOrder[0];
        const initCallOrder = gitMocks.gitInit.mock.invocationCallOrder[0];
        const renameCallOrder =
            gitMocks.gitRenameBranch.mock.invocationCallOrder[0];
        const commitCallOrder =
            gitMocks.gitAddAndCommit.mock.invocationCallOrder[0];
        expect(copyCallOrders[0]).toBeLessThan(initCallOrder);
        expect(copyCallOrders[1]).toBeLessThan(initCallOrder);
        expect(launcherConfigCallOrder).toBeLessThan(initCallOrder);
        expect(initCallOrder).toBeLessThan(renameCallOrder);
        expect(renameCallOrder).toBeLessThan(commitCallOrder);
    });

    it('initializes main without staging or committing when commit is skipped', async () => {
        installedToolsMocks.getInstalledTools.mockResolvedValue([
            {
                name: 'Git',
                path: '/usr/bin/git',
                version: 'git version 2.54.0',
            },
        ]);

        const result = await createProject(
            'Skip Commit',
            release,
            'FORWARD_PLUS',
            null,
            true,
            codeEditorIntegrationService,
            undefined,
            { initialCommit: 'skip' },
        );

        const projectPath = path.resolve('/projects/Skip-Commit');
        expect(result.success).toBe(true);
        expect(result.projectDetails?.withGit).toBe(true);
        expect(gitMocks.gitInit).toHaveBeenCalledWith(projectPath);
        expect(gitMocks.gitRenameBranch).toHaveBeenCalledWith(projectPath);
        expect(gitMocks.gitConfigSetIdentity).not.toHaveBeenCalled();
        expect(gitMocks.gitAddAndCommit).not.toHaveBeenCalled();
    });

    it.each(['repository', 'global'] as const)(
        'sets %s identity before creating the initial commit',
        async (scope) => {
            installedToolsMocks.getInstalledTools.mockResolvedValue([
                {
                    name: 'Git',
                    path: '/usr/bin/git',
                    version: 'git version 2.54.0',
                },
            ]);

            const result = await createProject(
                'Identity Project',
                release,
                'FORWARD_PLUS',
                null,
                true,
                codeEditorIntegrationService,
                undefined,
                {
                    initialCommit: 'create',
                    identity: {
                        name: '  John Doe  ',
                        email: '  john.doe@example.com  ',
                        scope,
                    },
                },
            );

            const projectPath = path.resolve('/projects/Identity-Project');
            expect(result.success).toBe(true);
            expect(gitMocks.gitConfigSetIdentity).toHaveBeenCalledWith(
                'John Doe',
                'john.doe@example.com',
                scope,
                projectPath,
            );
            expect(
                gitMocks.gitRenameBranch.mock.invocationCallOrder[0],
            ).toBeLessThan(
                gitMocks.gitConfigSetIdentity.mock.invocationCallOrder[0],
            );
            expect(
                gitMocks.gitConfigSetIdentity.mock.invocationCallOrder[0],
            ).toBeLessThan(
                gitMocks.gitAddAndCommit.mock.invocationCallOrder[0],
            );
        },
    );

    it('rejects blank Git identity before configuration or commit', async () => {
        installedToolsMocks.getInstalledTools.mockResolvedValue([
            {
                name: 'Git',
                path: '/usr/bin/git',
                version: 'git version 2.54.0',
            },
        ]);

        const result = await createProject(
            'Blank Identity',
            release,
            'FORWARD_PLUS',
            null,
            true,
            codeEditorIntegrationService,
            undefined,
            {
                initialCommit: 'create',
                identity: {
                    name: ' ',
                    email: 'john.doe@example.com',
                    scope: 'repository',
                },
            },
        );

        expect(result).toEqual({
            success: false,
            error: 'createProject:errors.invalidGitIdentity',
        });
        expect(gitMocks.gitConfigSetIdentity).not.toHaveBeenCalled();
        expect(gitMocks.gitAddAndCommit).not.toHaveBeenCalled();
        expect(fsMocks.promises.rm).toHaveBeenCalled();
    });

    it.each([
        {
            stage: 'init',
            mock: gitMocks.gitInit,
            expectedRename: false,
            expectedCommit: false,
        },
        {
            stage: 'branch rename',
            mock: gitMocks.gitRenameBranch,
            expectedRename: true,
            expectedCommit: false,
        },
        {
            stage: 'commit',
            mock: gitMocks.gitAddAndCommit,
            expectedRename: true,
            expectedCommit: true,
        },
    ])(
        'cleans up when Git $stage fails',
        async ({ mock, expectedRename, expectedCommit }) => {
            installedToolsMocks.getInstalledTools.mockResolvedValue([
                {
                    name: 'Git',
                    path: '/usr/bin/git',
                    version: 'git version 2.54.0',
                },
            ]);
            mock.mockResolvedValueOnce(false);

            const result = await createProject(
                'Failed Git',
                release,
                'FORWARD_PLUS',
                null,
                true,
                codeEditorIntegrationService,
            );

            expect(result.success).toBe(false);
            expect(fsMocks.promises.rm).toHaveBeenCalledWith(
                path.resolve('/projects/Failed-Git'),
                { recursive: true, force: true },
            );
            expect(gitMocks.gitRenameBranch).toHaveBeenCalledTimes(
                expectedRename ? 1 : 0,
            );
            expect(gitMocks.gitAddAndCommit).toHaveBeenCalledTimes(
                expectedCommit ? 1 : 0,
            );
        },
    );

    it('stops and cleans up when Git identity setup fails', async () => {
        installedToolsMocks.getInstalledTools.mockResolvedValue([
            {
                name: 'Git',
                path: '/usr/bin/git',
                version: 'git version 2.54.0',
            },
        ]);
        gitMocks.gitConfigSetIdentity.mockResolvedValueOnce(false);

        const result = await createProject(
            'Failed Identity',
            release,
            'FORWARD_PLUS',
            null,
            true,
            codeEditorIntegrationService,
            undefined,
            {
                initialCommit: 'create',
                identity: {
                    name: 'John Doe',
                    email: 'john.doe@example.com',
                    scope: 'repository',
                },
            },
        );

        expect(result).toEqual({
            success: false,
            error: 'createProject:errors.failedGitIdentity',
        });
        expect(gitMocks.gitAddAndCommit).not.toHaveBeenCalled();
        expect(fsMocks.promises.rm).toHaveBeenCalled();
    });

    it('does not add Git metadata when Git is disabled', async () => {
        const result = await createProject(
            'No Git Project',
            release,
            'FORWARD_PLUS',
            null,
            false,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(fsMocks.promises.copyFile).not.toHaveBeenCalled();
        expect(gitMocks.gitInit).not.toHaveBeenCalled();
        expect(gitMocks.gitAddAndCommit).not.toHaveBeenCalled();
    });

    it('does not add Git metadata when Git is unavailable', async () => {
        const result = await createProject(
            'Unavailable Git Project',
            release,
            'FORWARD_PLUS',
            null,
            true,
            codeEditorIntegrationService,
        );

        expect(result.success).toBe(true);
        expect(result.projectDetails?.withGit).toBe(false);
        expect(fsMocks.promises.copyFile).not.toHaveBeenCalled();
        expect(gitMocks.gitInit).not.toHaveBeenCalled();
        expect(gitMocks.gitAddAndCommit).not.toHaveBeenCalled();
    });

    it.each(['disabled', 'unavailable'])(
        'rejects a directly requested %s integration before writing project files',
        async (state) => {
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
        },
    );
});
