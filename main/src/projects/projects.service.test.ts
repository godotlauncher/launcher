import type { InstalledRelease, ProjectDetails } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    addProject: vi.fn(),
    checkAllProjectsValid: vi.fn(),
    checkProjectValid: vi.fn(),
    createProject: vi.fn(),
    exportProjectEditorSettings: vi.fn(),
    getProjectGitIdentity: vi.fn(),
    getProjectGodotName: vi.fn(),
    getProjectsDetails: vi.fn(),
    importProjectEditorSettings: vi.fn(),
    initializeProjectGit: vi.fn(),
    launchProject: vi.fn(),
    removeProject: vi.fn(),
    renameProject: vi.fn(),
    reorderPinnedProjects: vi.fn(),
    resetProjectCodeEditorConfig: vi.fn(),
    setProjectCodeEditor: vi.fn(),
    setProjectEditor: vi.fn(),
    setProjectGitIdentity: vi.fn(),
    setProjectPinned: vi.fn(),
    setProjectWindowed: vi.fn(),
    ipcWebContentsSend: vi.fn(),
    removeProjectEditor: vi.fn(),
    updateGodotProjectName: vi.fn(),
    updateLinuxTray: vi.fn(),
    writeProjectLauncherConfig: vi.fn(),
}));

vi.mock('electron', () => ({
    app: { getVersion: () => '1.0.0' },
}));
vi.mock('electron-log', () => ({
    default: { warn: vi.fn() },
}));

vi.mock('../checks.js', () => ({
    checkAndUpdateProjects: mocks.checkAllProjectsValid,
    checkProjectValid: mocks.checkProjectValid,
}));
vi.mock('../commands/projectEditorSettings.js', () => ({
    exportProjectEditorSettings: mocks.exportProjectEditorSettings,
    importProjectEditorSettings: mocks.importProjectEditorSettings,
}));
vi.mock('../commands/userPreferences.js', () => ({
    getUserPreferences: vi.fn(),
}));
vi.mock('../codeEditorIntegration/codeEditorIntegration.service.js', () => ({
    CodeEditorIntegrationService: class CodeEditorIntegrationService {},
}));
vi.mock('../helpers/tray.helper.js', () => ({
    updateLinuxTray: mocks.updateLinuxTray,
}));
vi.mock('../i18n/index.js', () => ({
    t: (key: string, values?: { name?: string }) =>
        values?.name ? `${key}:${values.name}` : key,
}));
vi.mock('../mainWindow.js', () => ({
    getMainWindow: () => ({ webContents: { id: 'web-contents' } }),
}));
vi.mock('../services/tray-availability.service.js', () => ({
    TrayAvailabilityService: class TrayAvailabilityService {},
}));
vi.mock('../tool-integration/integrations/git/git.service.js', () => ({
    GitService: class GitService {},
}));
vi.mock('../utils/godot.utils.js', () => ({
    DEFAULT_PROJECT_DEFINITION: new Map(),
    getProjectDefinition: vi.fn(),
    removeProjectEditor: mocks.removeProjectEditor,
    SetProjectEditorRelease: vi.fn(),
}));
vi.mock('../utils/godotProject.utils.js', () => ({
    readGodotProjectName: mocks.getProjectGodotName,
    updateGodotProjectName: mocks.updateGodotProjectName,
}));
vi.mock('../utils/projectLauncherConfig.utils.js', () => ({
    writeProjectLauncherConfig: mocks.writeProjectLauncherConfig,
}));
vi.mock('../utils.js', () => ({
    ipcWebContentsSend: mocks.ipcWebContentsSend,
}));
vi.mock('./projects.store.js', () => ({
    ProjectsStore: class ProjectsStore {},
}));
vi.mock('./project-creation.service.js', () => ({
    ProjectCreationService: class ProjectCreationService {},
}));
vi.mock('./project-import.service.js', () => ({
    ProjectImportService: class ProjectImportService {},
}));

import { ProjectsService } from './projects.service.js';

describe('ProjectsService', () => {
    const codeEditors = { id: 'code-editors' };
    const projectImport = { addProject: mocks.addProject };
    const git = {
        getIdentity: vi.fn(),
        getLocalIdentity: vi.fn(),
        init: vi.fn(),
        inspectRepository: vi.fn(),
        setIdentity: vi.fn(),
    };
    const projectCreation = { createProject: mocks.createProject };
    const trayAvailability = { id: 'tray' };
    const store = {
        list: vi.fn(),
        put: vi.fn(),
        remove: vi.fn(),
        replace: vi.fn(),
        snapshot: vi.fn(),
        update: vi.fn(),
    };
    const remoteSources = {
        inspectPublicGitSource: vi.fn(),
        listConnectedRepositories: vi.fn(),
    };
    const remoteImport = {
        importRemoteProject: vi.fn(),
        cancelRemoteProjectImport: vi.fn(),
        resolveRemoteProjectClone: vi.fn(),
    };
    let service: ProjectsService;

    beforeEach(() => {
        vi.clearAllMocks();
        store.list.mockResolvedValue([]);
        store.remove.mockResolvedValue([]);
        service = new ProjectsService(
            codeEditors as never,
            projectImport as never,
            git as never,
            projectCreation as never,
            trayAvailability as never,
            store as never,
            remoteSources as never,
            remoteImport as never,
        );
    });

    it('delegates create and import transactions to internal services', async () => {
        const release = { version: '4.5-stable' } as InstalledRelease;

        await service.createProject(
            'Game',
            release,
            'FORWARD_PLUS',
            'vscode',
            true,
            '/projects/game',
            { initialCommit: 'skip' },
        );
        await service.addProject('/projects/game');
        await service.importRemoteProject({
            source: 'public-git-url',
            url: 'https://example.com/game.git',
            parentDirectory: '/projects',
            directoryName: 'game',
        });
        await service.cancelRemoteProjectImport('job-id');
        await service.resolveRemoteProjectClone('job-id', 'keep');

        expect(mocks.createProject).toHaveBeenCalledWith(
            'Game',
            release,
            'FORWARD_PLUS',
            'vscode',
            true,
            '/projects/game',
            { initialCommit: 'skip' },
        );
        expect(mocks.addProject).toHaveBeenCalledWith(
            '/projects/game',
            undefined,
        );
        expect(remoteImport.importRemoteProject).toHaveBeenCalledOnce();
        expect(remoteImport.cancelRemoteProjectImport).toHaveBeenCalledWith(
            'job-id',
        );
        expect(remoteImport.resolveRemoteProjectClone).toHaveBeenCalledWith(
            'job-id',
            'keep',
        );
    });

    it('preserves stateless workflow arguments', async () => {
        const project = { path: '/projects/game' } as ProjectDetails;

        await service.getProjectGodotName(project);
        await service.exportProjectEditorSettings(project);
        await service.importProjectEditorSettings(project);
        await service.checkProjectValid(project);
        await service.checkAllProjectsValid();

        expect(mocks.getProjectGodotName).toHaveBeenCalledWith(project.path);
        expect(mocks.exportProjectEditorSettings).toHaveBeenCalledWith(project);
        expect(mocks.importProjectEditorSettings).toHaveBeenCalledWith(project);
        expect(mocks.checkProjectValid).toHaveBeenCalledWith(project, {}, git);
        expect(mocks.checkAllProjectsValid).toHaveBeenCalledWith(
            {},
            git,
            store,
        );
    });

    it('lists projects through the canonical store', async () => {
        const projects = [{ path: '/projects/game' }] as ProjectDetails[];
        store.list.mockResolvedValue(projects);

        await expect(service.getProjectsDetails()).resolves.toBe(projects);
    });

    it('persists and publishes a windowed-mode update once', async () => {
        const project = {
            path: '/projects/game',
            open_windowed: false,
        } as ProjectDetails;
        store.update.mockImplementation(async (mutator) => mutator([project]));

        const updated = await service.setProjectWindowed(project, true);

        expect(updated.open_windowed).toBe(true);
        expect(mocks.ipcWebContentsSend).toHaveBeenCalledOnce();
        expect(mocks.ipcWebContentsSend).toHaveBeenCalledWith(
            'projects-updated',
            { id: 'web-contents' },
            [expect.objectContaining({ open_windowed: true })],
        );
    });

    it('does not publish when persistence fails', async () => {
        const project = { path: '/projects/game' } as ProjectDetails;
        store.update.mockRejectedValue(new Error('write failed'));

        await expect(service.setProjectPinned(project, true)).rejects.toThrow(
            'write failed',
        );
        expect(mocks.ipcWebContentsSend).not.toHaveBeenCalled();
    });

    it('preserves pinned ordering rules', async () => {
        const first = {
            path: '/projects/first',
            name: 'First',
            pinned: true,
            pinned_order: 0,
        } as ProjectDetails;
        const second = {
            path: '/projects/second',
            name: 'Second',
            pinned: false,
        } as ProjectDetails;
        store.update.mockImplementation(async (mutator) =>
            mutator([first, second]),
        );

        const projects = await service.setProjectPinned(second, true);

        expect(projects).toEqual([
            expect.objectContaining({ path: first.path, pinned_order: 1 }),
            expect.objectContaining({ path: second.path, pinned_order: 0 }),
        ]);
    });

    it('rejects a pinned reorder when the stored paths changed', async () => {
        const project = {
            path: '/projects/game',
            name: 'Game',
            pinned: true,
            pinned_order: 0,
        } as ProjectDetails;
        store.update.mockImplementation(async (mutator) => mutator([project]));

        await expect(
            service.reorderPinnedProjects(['/projects/other']),
        ).rejects.toThrow('projects:pinning.errors.orderChanged');
        expect(mocks.ipcWebContentsSend).not.toHaveBeenCalled();
    });

    it('renames a project and optionally updates project.godot', async () => {
        const project = {
            path: '/projects/game',
            name: 'Game',
        } as ProjectDetails;
        store.update.mockImplementation(async (mutator) => mutator([project]));

        const result = await service.renameProject(project, {
            name: ' Renamed ',
            renameGodotProject: true,
        });

        expect(mocks.updateGodotProjectName).toHaveBeenCalledWith(
            project.path,
            'Renamed',
        );
        expect(result).toEqual(
            expect.objectContaining({
                success: true,
                project: expect.objectContaining({ name: 'Renamed' }),
            }),
        );
        expect(project.name).toBe('Renamed');
        expect(mocks.ipcWebContentsSend).toHaveBeenCalledOnce();
    });

    it('preserves duplicate-name rename errors without publishing', async () => {
        const project = {
            path: '/projects/game',
            name: 'Game',
        } as ProjectDetails;
        const duplicate = {
            path: '/projects/other',
            name: 'Duplicate',
        } as ProjectDetails;
        store.update.mockImplementation(async (mutator) =>
            mutator([project, duplicate]),
        );

        await expect(
            service.renameProject(project, {
                name: 'Duplicate',
                renameGodotProject: true,
            }),
        ).resolves.toEqual({
            success: false,
            error: 'projects:renameProject.errors.nameExists:Duplicate',
            errorField: 'name',
        });
        expect(mocks.updateGodotProjectName).not.toHaveBeenCalled();
        expect(mocks.ipcWebContentsSend).not.toHaveBeenCalled();
    });

    it('removes project-owned editor files before persistence', async () => {
        const project = {
            path: '/projects/game',
            name: 'Game',
            release: { version: '4.5-stable' },
        } as ProjectDetails;

        await service.removeProject(project);

        expect(mocks.writeProjectLauncherConfig).toHaveBeenCalled();
        expect(mocks.removeProjectEditor).toHaveBeenCalledWith(project);
        expect(store.remove).toHaveBeenCalledWith(project.path);
        expect(mocks.ipcWebContentsSend).toHaveBeenCalledOnce();
    });
});
