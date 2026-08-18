import path from 'node:path';
import type {
    CodeEditorId,
    CreateProjectGitOptions,
    InstalledRelease,
    RendererType,
} from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodeEditorIntegrationService } from '../codeEditorIntegration/codeEditorIntegration.service.js';
import type { GitService } from '../tool-integration/integrations/git/git.service.js';
import type { GitLfsService } from '../tool-integration/integrations/git-lfs/git-lfs.service.js';
import { ProjectCreationService } from './project-creation.service.js';
import type { ProjectsStore } from './projects.store.js';

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

const userPreferencesMocks = vi.hoisted(() => ({
    getUserPreferences: vi.fn(),
}));

vi.mock('../commands/userPreferences.js', () => userPreferencesMocks);

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

const gitServiceMocks = {
    addAndCommit: vi.fn(),
    exists: vi.fn(),
    init: vi.fn(),
    inspectRepository: vi.fn(),
    renameBranch: vi.fn(),
    setIdentity: vi.fn(),
};
const gitService = gitServiceMocks as unknown as GitService;
const gitLfsServiceMocks = {
    configureProjectRepository: vi.fn(),
    isAvailable: vi.fn(),
    supportsTrackingPolicy: vi.fn(),
};
const gitLfsService = gitLfsServiceMocks as unknown as GitLfsService;
const projectsStore = {
    put: projectUtilsMocks.addProjectToList,
} as unknown as ProjectsStore;

/**
 * Calls Create Project with the test-owned Git service.
 *
 * @param projectName - Display name for the new project.
 * @param release - Godot editor release assigned to the project.
 * @param renderer - Renderer selected for the project.
 * @param codeEditorId - Optional code editor integration to apply.
 * @param withGit - Whether Git setup is requested.
 * @param codeEditorService - Code editor integration service.
 * @param overwriteProjectPath - Optional target project path.
 * @param gitOptions - Optional Git initialization settings.
 * @returns The project creation result.
 */
function createProject(
    projectName: string,
    release: InstalledRelease,
    renderer: RendererType[5],
    codeEditorId: CodeEditorId | null,
    withGit: boolean,
    codeEditorService: CodeEditorIntegrationService,
    overwriteProjectPath?: string,
    gitOptions?: CreateProjectGitOptions,
) {
    return new ProjectCreationService(
        codeEditorService,
        gitService,
        gitLfsService,
        projectsStore,
    ).createProject(
        projectName,
        release,
        renderer,
        codeEditorId,
        withGit,
        overwriteProjectPath,
        gitOptions,
    );
}

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
        gitServiceMocks.exists.mockResolvedValue(true);
        gitServiceMocks.init.mockResolvedValue(true);
        gitServiceMocks.renameBranch.mockResolvedValue(true);
        gitServiceMocks.setIdentity.mockResolvedValue(true);
        gitServiceMocks.addAndCommit.mockResolvedValue(true);
        gitLfsServiceMocks.isAvailable.mockResolvedValue(true);
        gitLfsServiceMocks.supportsTrackingPolicy.mockReturnValue(true);
        gitLfsServiceMocks.configureProjectRepository.mockResolvedValue({
            status: 'configured',
            trackingPolicy: 'godot-recommended-v1',
        });
        gitServiceMocks.inspectRepository.mockImplementation(
            async (projectPath: string) =>
                gitServiceMocks.init.mock.calls.length === 0
                    ? { status: 'not-a-repository' as const }
                    : {
                          status: 'inside-work-tree' as const,
                          root: projectPath,
                          isProjectRoot: true,
                          kind: 'standard' as const,
                      },
        );
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

    it('initializes Git before adding metadata and committing', async () => {
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
        expect(gitServiceMocks.init).toHaveBeenCalledWith(projectPath);
        expect(gitServiceMocks.renameBranch).toHaveBeenCalledWith(projectPath);
        expect(gitServiceMocks.addAndCommit).toHaveBeenCalledWith(projectPath);
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
        const initCallOrder = gitServiceMocks.init.mock.invocationCallOrder[0];
        const renameCallOrder =
            gitServiceMocks.renameBranch.mock.invocationCallOrder[0];
        const commitCallOrder =
            gitServiceMocks.addAndCommit.mock.invocationCallOrder[0];
        expect(initCallOrder).toBeLessThan(copyCallOrders[0]);
        expect(initCallOrder).toBeLessThan(copyCallOrders[1]);
        expect(launcherConfigCallOrder).toBeLessThan(initCallOrder);
        expect(initCallOrder).toBeLessThan(renameCallOrder);
        expect(renameCallOrder).toBeLessThan(commitCallOrder);
    });

    it('initializes main without staging or committing when commit is skipped', async () => {
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
        expect(gitServiceMocks.init).toHaveBeenCalledWith(projectPath);
        expect(gitServiceMocks.renameBranch).toHaveBeenCalledWith(projectPath);
        expect(gitServiceMocks.setIdentity).not.toHaveBeenCalled();
        expect(gitServiceMocks.addAndCommit).not.toHaveBeenCalled();
    });

    it('configures requested Git LFS before branch rename and commit', async () => {
        const result = await createProject(
            'LFS Project',
            release,
            'FORWARD_PLUS',
            null,
            true,
            codeEditorIntegrationService,
            undefined,
            {
                initialCommit: 'create',
                gitLfs: { trackingPolicy: 'godot-recommended-v1' },
            },
        );

        expect(result.gitLfsSetup).toEqual({
            status: 'configured',
            trackingPolicy: 'godot-recommended-v1',
        });
        expect(
            gitLfsServiceMocks.configureProjectRepository,
        ).toHaveBeenCalledWith(
            path.resolve('/projects/LFS-Project'),
            'godot-recommended-v1',
        );
        expect(
            gitLfsServiceMocks.configureProjectRepository.mock
                .invocationCallOrder[0],
        ).toBeLessThan(
            gitServiceMocks.renameBranch.mock.invocationCallOrder[0],
        );
        expect(
            gitLfsServiceMocks.configureProjectRepository.mock
                .invocationCallOrder[0],
        ).toBeLessThan(
            gitServiceMocks.addAndCommit.mock.invocationCallOrder[0],
        );
    });

    it('configures Git LFS when the initial commit is skipped', async () => {
        const result = await createProject(
            'LFS Skip Commit',
            release,
            'FORWARD_PLUS',
            null,
            true,
            codeEditorIntegrationService,
            undefined,
            {
                initialCommit: 'skip',
                gitLfs: { trackingPolicy: 'godot-recommended-v1' },
            },
        );

        expect(result.success).toBe(true);
        expect(
            gitLfsServiceMocks.configureProjectRepository,
        ).toHaveBeenCalledOnce();
        expect(gitServiceMocks.addAndCommit).not.toHaveBeenCalled();
    });

    it.each([
        {
            name: 'Git',
            prepare: () => gitServiceMocks.exists.mockResolvedValueOnce(false),
            error: 'createProject:errors.gitLfsRequiresGit',
        },
        {
            name: 'Git LFS',
            prepare: () =>
                gitLfsServiceMocks.isAvailable.mockResolvedValueOnce(false),
            error: 'createProject:errors.gitLfsUnavailable',
        },
    ])(
        'fails before writing project files when $name is unavailable',
        async ({ prepare, error }) => {
            prepare();
            const result = await createProject(
                'Unavailable LFS',
                release,
                'FORWARD_PLUS',
                null,
                true,
                codeEditorIntegrationService,
                undefined,
                {
                    initialCommit: 'create',
                    gitLfs: { trackingPolicy: 'godot-recommended-v1' },
                },
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe(error);
            expect(godotUtilsMocks.createProjectFile).not.toHaveBeenCalled();
            expect(fsMocks.promises.mkdir).not.toHaveBeenCalled();
            expect(gitServiceMocks.init).not.toHaveBeenCalled();
        },
    );

    it('refuses an enclosing repository before project or Git mutation', async () => {
        gitServiceMocks.inspectRepository.mockResolvedValueOnce({
            status: 'inside-work-tree',
            root: '/projects',
            isProjectRoot: false,
            kind: 'standard',
        });

        const result = await createProject(
            'Nested LFS',
            release,
            'FORWARD_PLUS',
            null,
            true,
            codeEditorIntegrationService,
            undefined,
            {
                initialCommit: 'create',
                gitLfs: { trackingPolicy: 'godot-recommended-v1' },
            },
        );

        expect(result.error).toBe(
            'createProject:errors.gitLfsExistingRepository',
        );
        expect(godotUtilsMocks.createProjectFile).not.toHaveBeenCalled();
        expect(gitServiceMocks.init).not.toHaveBeenCalled();
        expect(
            gitLfsServiceMocks.configureProjectRepository,
        ).not.toHaveBeenCalled();
    });

    it.each(['install', 'track', 'verify'] as const)(
        'rolls back and stops after Git LFS %s failure',
        async (stage) => {
            gitLfsServiceMocks.configureProjectRepository.mockResolvedValueOnce(
                { status: 'failed', stage },
            );

            const result = await createProject(
                'Failed LFS',
                release,
                'FORWARD_PLUS',
                'vscode',
                true,
                codeEditorIntegrationService,
                undefined,
                {
                    initialCommit: 'create',
                    gitLfs: { trackingPolicy: 'godot-recommended-v1' },
                },
            );

            expect(result.gitLfsSetup).toEqual({
                status: 'failed',
                stage,
                recovery: 'completed',
            });
            expect(gitServiceMocks.renameBranch).not.toHaveBeenCalled();
            expect(gitServiceMocks.addAndCommit).not.toHaveBeenCalled();
            expect(
                codeEditorIntegrationServiceMocks.applyToProject,
            ).not.toHaveBeenCalled();
            expect(
                godotUtilsMocks.SetProjectEditorRelease,
            ).not.toHaveBeenCalled();
            expect(projectUtilsMocks.addProjectToList).not.toHaveBeenCalled();
            expect(fsMocks.promises.rm).toHaveBeenCalledWith(
                path.resolve('/projects/Failed-LFS'),
                { recursive: true, force: true },
            );
        },
    );

    it('fails closed when Git LFS becomes unavailable during setup', async () => {
        gitLfsServiceMocks.configureProjectRepository.mockResolvedValueOnce({
            status: 'unavailable',
        });

        const result = await createProject(
            'Lost LFS',
            release,
            'FORWARD_PLUS',
            null,
            true,
            codeEditorIntegrationService,
            undefined,
            {
                initialCommit: 'create',
                gitLfs: { trackingPolicy: 'godot-recommended-v1' },
            },
        );

        expect(result.gitLfsSetup).toEqual({
            status: 'unavailable',
            recovery: 'completed',
        });
        expect(gitServiceMocks.renameBranch).not.toHaveBeenCalled();
        expect(gitServiceMocks.addAndCommit).not.toHaveBeenCalled();
    });

    it('reports verification recovery when the new Git root cannot be created', async () => {
        gitServiceMocks.init.mockResolvedValueOnce(false);
        gitServiceMocks.inspectRepository
            .mockResolvedValueOnce({ status: 'not-a-repository' })
            .mockResolvedValueOnce({ status: 'not-a-repository' })
            .mockResolvedValueOnce({ status: 'not-a-repository' });

        const result = await createProject(
            'No Git Root',
            release,
            'FORWARD_PLUS',
            null,
            true,
            codeEditorIntegrationService,
            undefined,
            {
                initialCommit: 'create',
                gitLfs: { trackingPolicy: 'godot-recommended-v1' },
            },
        );

        expect(result.gitLfsSetup).toEqual({
            status: 'failed',
            stage: 'verify',
            recovery: 'completed',
        });
        expect(
            gitLfsServiceMocks.configureProjectRepository,
        ).not.toHaveBeenCalled();
        expect(gitServiceMocks.renameBranch).not.toHaveBeenCalled();
    });

    it('preserves a user-supplied empty root and removes only attempt entries', async () => {
        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.promises.lstat.mockResolvedValue({ isDirectory: () => true });
        fsMocks.promises.readdir.mockResolvedValue([]);
        gitLfsServiceMocks.configureProjectRepository.mockResolvedValueOnce({
            status: 'failed',
            stage: 'track',
        });

        await createProject(
            'Existing Empty',
            release,
            'FORWARD_PLUS',
            null,
            true,
            codeEditorIntegrationService,
            undefined,
            {
                initialCommit: 'create',
                gitLfs: { trackingPolicy: 'godot-recommended-v1' },
            },
        );

        const projectPath = path.resolve('/projects/Existing-Empty');
        expect(fsMocks.promises.rm).not.toHaveBeenCalledWith(projectPath, {
            recursive: true,
            force: true,
        });
        for (const [target] of fsMocks.promises.rm.mock.calls) {
            expect(path.dirname(target)).toBe(projectPath);
        }
    });

    it('reports the original stage and manual path when recovery fails', async () => {
        gitLfsServiceMocks.configureProjectRepository.mockResolvedValueOnce({
            status: 'failed',
            stage: 'install',
        });
        fsMocks.promises.rm.mockRejectedValueOnce(new Error('busy'));

        const result = await createProject(
            'Manual Recovery',
            release,
            'FORWARD_PLUS',
            null,
            true,
            codeEditorIntegrationService,
            undefined,
            {
                initialCommit: 'create',
                gitLfs: { trackingPolicy: 'godot-recommended-v1' },
            },
        );

        expect(result).toMatchObject({
            success: false,
            projectPath: path.resolve('/projects/Manual-Recovery'),
            error: 'createProject:errors.failedProjectRecovery',
            gitLfsSetup: {
                status: 'failed',
                stage: 'install',
                recovery: 'failed',
            },
        });
    });

    it.each(['repository', 'global'] as const)(
        'sets %s identity before creating the initial commit',
        async (scope) => {
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
            expect(gitServiceMocks.setIdentity).toHaveBeenCalledWith(
                'John Doe',
                'john.doe@example.com',
                scope,
                projectPath,
            );
            expect(
                gitServiceMocks.renameBranch.mock.invocationCallOrder[0],
            ).toBeLessThan(
                gitServiceMocks.setIdentity.mock.invocationCallOrder[0],
            );
            expect(
                gitServiceMocks.setIdentity.mock.invocationCallOrder[0],
            ).toBeLessThan(
                gitServiceMocks.addAndCommit.mock.invocationCallOrder[0],
            );
        },
    );

    it('rejects blank Git identity before configuration or commit', async () => {
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
        expect(gitServiceMocks.setIdentity).not.toHaveBeenCalled();
        expect(gitServiceMocks.addAndCommit).not.toHaveBeenCalled();
        expect(fsMocks.promises.rm).toHaveBeenCalled();
    });

    it.each([
        {
            stage: 'init',
            mock: gitServiceMocks.init,
            expectedRename: false,
            expectedCommit: false,
        },
        {
            stage: 'branch rename',
            mock: gitServiceMocks.renameBranch,
            expectedRename: true,
            expectedCommit: false,
        },
        {
            stage: 'commit',
            mock: gitServiceMocks.addAndCommit,
            expectedRename: true,
            expectedCommit: true,
        },
    ])(
        'cleans up when Git $stage fails',
        async ({ mock, expectedRename, expectedCommit }) => {
            mock.mockResolvedValueOnce(false);
            if (mock === gitServiceMocks.init) {
                gitServiceMocks.inspectRepository
                    .mockResolvedValueOnce({ status: 'not-a-repository' })
                    .mockResolvedValueOnce({ status: 'not-a-repository' });
            }

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
            expect(gitServiceMocks.renameBranch).toHaveBeenCalledTimes(
                expectedRename ? 1 : 0,
            );
            expect(gitServiceMocks.addAndCommit).toHaveBeenCalledTimes(
                expectedCommit ? 1 : 0,
            );
        },
    );

    it('stops and cleans up when Git identity setup fails', async () => {
        gitServiceMocks.setIdentity.mockResolvedValueOnce(false);

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
        expect(gitServiceMocks.addAndCommit).not.toHaveBeenCalled();
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
        expect(gitServiceMocks.exists).not.toHaveBeenCalled();
        expect(gitServiceMocks.init).not.toHaveBeenCalled();
        expect(gitServiceMocks.addAndCommit).not.toHaveBeenCalled();
    });

    it('does not add Git metadata when Git is unavailable', async () => {
        gitServiceMocks.exists.mockResolvedValueOnce(false);

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
        expect(gitServiceMocks.exists).toHaveBeenCalledOnce();
        expect(gitServiceMocks.init).not.toHaveBeenCalled();
        expect(gitServiceMocks.addAndCommit).not.toHaveBeenCalled();
    });

    it('uses an enclosing repository without performing Git mutations', async () => {
        const projectPath = path.resolve('/projects/Parent/Git-Project');
        gitServiceMocks.inspectRepository.mockResolvedValue({
            status: 'inside-work-tree',
            root: path.resolve('/projects/Parent'),
            isProjectRoot: false,
            kind: 'standard',
        });

        const result = await createProject(
            'Git Project',
            release,
            'FORWARD_PLUS',
            null,
            true,
            codeEditorIntegrationService,
            projectPath,
        );

        expect(result.success).toBe(true);
        expect(result.projectDetails?.withGit).toBe(true);
        expect(result.gitSetup).toEqual({
            status: 'existing-repository',
            root: path.resolve('/projects/Parent'),
            isProjectRoot: false,
            kind: 'standard',
        });
        expect(fsMocks.promises.copyFile).not.toHaveBeenCalled();
        expect(gitServiceMocks.init).not.toHaveBeenCalled();
        expect(gitServiceMocks.renameBranch).not.toHaveBeenCalled();
        expect(gitServiceMocks.setIdentity).not.toHaveBeenCalled();
        expect(gitServiceMocks.addAndCommit).not.toHaveBeenCalled();
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
