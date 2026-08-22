import type {
    AddProjectOptions,
    CreateProjectGitOptions,
    GitIdentity,
    InstalledRelease,
    LaunchProjectOptions,
    ProjectDetails,
    RenameProjectOptions,
} from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));
vi.mock('./projects.service.js', () => ({
    ProjectsService: class ProjectsService {},
}));

import { ProjectsController } from './projects.controller.js';
import type { ProjectsService } from './projects.service.js';

describe('ProjectsController', () => {
    it('delegates the complete project bridge to ProjectsService', async () => {
        const project = { path: '/projects/game' } as ProjectDetails;
        const release = { version: '4.5-stable' } as InstalledRelease;
        const renameOptions = {
            name: 'Renamed',
            renameGodotProject: true,
        } satisfies RenameProjectOptions;
        const addOptions = {
            resolution: 'add_missing',
        } satisfies AddProjectOptions;
        const gitOptions = {
            initialCommit: 'skip',
        } satisfies CreateProjectGitOptions;
        const identity = {
            name: 'Project User',
            email: 'project@example.com',
        } satisfies GitIdentity;
        const launchOptions = {
            allowMissingCodeEditor: true,
        } satisfies LaunchProjectOptions;
        const service = createServiceMock();
        const controller = new ProjectsController(service);

        const remoteRequest = {
            source: 'public-git-url' as const,
            url: 'https://example.com/game.git',
            parentDirectory: '/projects',
            directoryName: 'game',
        };
        await controller.importRemoteProject(remoteRequest);
        await controller.cancelRemoteProjectImport('job-id');
        await controller.inspectPublicGitSource('https://example.com/game.git');
        await controller.listConnectedRepositories('github', 'cursor');
        await controller.getProjectsDetails();
        await controller.createProject(
            'Game',
            release,
            'FORWARD_PLUS',
            'vscode',
            true,
            '/projects/game',
            gitOptions,
        );
        await controller.removeProject(project);
        await controller.renameProject(project, renameOptions);
        await controller.getProjectGodotName(project);
        await controller.addProject('/projects/game', addOptions);
        await controller.setProjectEditor(project, release);
        await controller.setProjectWindowed(project, true);
        await controller.setProjectPinned(project, true);
        await controller.reorderPinnedProjects(['/projects/game']);
        await controller.setProjectCodeEditor(project, 'vscode');
        await controller.resetProjectCodeEditorConfig(project);
        await controller.initializeProjectGit(project);
        await controller.getProjectGitIdentity(project);
        await controller.setProjectGitIdentity(project, identity);
        await controller.exportProjectEditorSettings(project);
        await controller.importProjectEditorSettings(project);
        await controller.launchProject(project, launchOptions);
        await controller.checkProjectValid(project);
        await controller.checkAllProjectsValid();

        expect(service.importRemoteProject).toHaveBeenCalledWith(remoteRequest);
        expect(service.cancelRemoteProjectImport).toHaveBeenCalledWith(
            'job-id',
        );
        expect(service.inspectPublicGitSource).toHaveBeenCalledWith(
            'https://example.com/game.git',
        );
        expect(service.listConnectedRepositories).toHaveBeenCalledWith(
            'github',
            'cursor',
        );
        expect(service.getProjectsDetails).toHaveBeenCalledOnce();
        expect(service.createProject).toHaveBeenCalledWith(
            'Game',
            release,
            'FORWARD_PLUS',
            'vscode',
            true,
            '/projects/game',
            gitOptions,
        );
        expect(service.removeProject).toHaveBeenCalledWith(project);
        expect(service.renameProject).toHaveBeenCalledWith(
            project,
            renameOptions,
        );
        expect(service.getProjectGodotName).toHaveBeenCalledWith(project);
        expect(service.addProject).toHaveBeenCalledWith(
            '/projects/game',
            addOptions,
        );
        expect(service.setProjectEditor).toHaveBeenCalledWith(project, release);
        expect(service.setProjectWindowed).toHaveBeenCalledWith(project, true);
        expect(service.setProjectPinned).toHaveBeenCalledWith(project, true);
        expect(service.reorderPinnedProjects).toHaveBeenCalledWith([
            '/projects/game',
        ]);
        expect(service.setProjectCodeEditor).toHaveBeenCalledWith(
            project,
            'vscode',
        );
        expect(service.resetProjectCodeEditorConfig).toHaveBeenCalledWith(
            project,
        );
        expect(service.initializeProjectGit).toHaveBeenCalledWith(project);
        expect(service.getProjectGitIdentity).toHaveBeenCalledWith(project);
        expect(service.setProjectGitIdentity).toHaveBeenCalledWith(
            project,
            identity,
        );
        expect(service.exportProjectEditorSettings).toHaveBeenCalledWith(
            project,
        );
        expect(service.importProjectEditorSettings).toHaveBeenCalledWith(
            project,
        );
        expect(service.launchProject).toHaveBeenCalledWith(
            project,
            launchOptions,
        );
        expect(service.checkProjectValid).toHaveBeenCalledWith(project);
        expect(service.checkAllProjectsValid).toHaveBeenCalledOnce();
    });
});

/** Creates a complete ProjectsService test double. */
function createServiceMock(): ProjectsService {
    return {
        importRemoteProject: vi.fn(async () => ({
            ok: false,
            jobId: null,
            reason: 'invalid-request',
        })),
        cancelRemoteProjectImport: vi.fn(async (jobId) => ({
            jobId,
            status: 'not-found',
        })),
        inspectPublicGitSource: vi.fn(async () => ({
            ok: false,
            reason: 'invalid-url',
        })),
        listConnectedRepositories: vi.fn(async () => ({
            ok: false,
            reason: 'session-expired',
        })),
        getProjectsDetails: vi.fn(async () => []),
        createProject: vi.fn(async () => ({ success: true })),
        removeProject: vi.fn(async () => []),
        renameProject: vi.fn(async () => ({ success: true })),
        getProjectGodotName: vi.fn(async () => null),
        addProject: vi.fn(async () => ({ success: true })),
        setProjectEditor: vi.fn(async () => ({ success: true })),
        setProjectWindowed: vi.fn(async (project) => project),
        setProjectPinned: vi.fn(async () => []),
        reorderPinnedProjects: vi.fn(async () => []),
        setProjectCodeEditor: vi.fn(async (project) => project),
        resetProjectCodeEditorConfig: vi.fn(async (project) => project),
        initializeProjectGit: vi.fn(async (project) => ({
            project,
            gitSetup: {
                status: 'initialized',
                root: project.path,
                isProjectRoot: true,
                kind: 'standard',
            },
        })),
        getProjectGitIdentity: vi.fn(async () => ({
            status: 'not-a-repository',
        })),
        setProjectGitIdentity: vi.fn(async () => ({
            status: 'not-a-repository',
        })),
        exportProjectEditorSettings: vi.fn(async () => undefined),
        importProjectEditorSettings: vi.fn(async () => undefined),
        launchProject: vi.fn(async () => ({ launched: true })),
        checkProjectValid: vi.fn(async (project) => project),
        checkAllProjectsValid: vi.fn(async () => []),
    } as unknown as ProjectsService;
}
