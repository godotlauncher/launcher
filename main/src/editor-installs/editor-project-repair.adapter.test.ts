import type { InstalledRelease, ProjectDetails } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    checkAndUpdateProjects: vi.fn(),
    getMainWindow: vi.fn(),
    ipcWebContentsSend: vi.fn(),
}));

vi.mock('../checks.js', () => ({
    checkAndUpdateProjects: mocks.checkAndUpdateProjects,
}));
vi.mock('../mainWindow.js', () => ({
    getMainWindow: mocks.getMainWindow,
}));
vi.mock('../utils.js', () => ({
    ipcWebContentsSend: mocks.ipcWebContentsSend,
}));
vi.mock('../codeEditorIntegration/codeEditorIntegration.service.js', () => ({
    CodeEditorIntegrationService: class CodeEditorIntegrationService {},
}));
vi.mock('../projects/projects.store.js', () => ({
    ProjectsStore: class ProjectsStore {},
}));
vi.mock('../utils/godot.utils.js', () => ({
    removeProjectEditor: vi.fn(),
}));
vi.mock('./installed-editor.store.js', () => ({
    hasSameInstalledEditorIdentity: vi.fn(
        (first: InstalledRelease, second: InstalledRelease) =>
            first.version === second.version && first.mono === second.mono,
    ),
}));
vi.mock('./project-editor-repair.util.js', () => ({
    setProjectEditor: vi.fn(),
}));
vi.mock('electron-log', () => ({
    default: { warn: vi.fn() },
}));

import { EditorProjectRepairAdapter } from './editor-project-repair.adapter.js';

describe('EditorProjectRepairAdapter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('publishes projects after install-driven revalidation', async () => {
        const projects = [{ path: '/projects/game' }] as ProjectDetails[];
        const webContents = { isDestroyed: vi.fn(() => false) };
        const store = { id: 'projects-store' };
        mocks.checkAndUpdateProjects.mockResolvedValue(projects);
        mocks.getMainWindow.mockReturnValue({ webContents });
        const adapter = new EditorProjectRepairAdapter(
            {} as never,
            store as never,
        );

        await adapter.revalidateProjects();

        expect(mocks.checkAndUpdateProjects).toHaveBeenCalledWith(
            {},
            undefined,
            store,
        );
        expect(mocks.ipcWebContentsSend).toHaveBeenCalledWith(
            'projects-updated',
            webContents,
            projects,
        );
    });

    it('counts unavailable projects by version/flavour or assigned editor path', async () => {
        const release = {
            version: '4.7-stable',
            mono: false,
            editor_path: '/editors/Godot',
        } as InstalledRelease;
        const missingProject = {
            name: 'Missing project',
            valid: false,
            release: { ...release, editor_path: '/old/Godot' },
        };
        const samePath = {
            name: 'Same path',
            release: {
                version: 'custom',
                mono: false,
                editor_path: release.editor_path,
            },
        };
        const dotnet = {
            name: 'Other flavour',
            release: { ...release, mono: true, editor_path: '/dotnet/Godot' },
        };
        const projects = [missingProject, samePath, dotnet] as ProjectDetails[];
        const adapter = new EditorProjectRepairAdapter(
            {} as never,
            {
                list: vi.fn().mockResolvedValue(projects),
            } as never,
        );

        expect(await adapter.getProjectsUsingEditor(release)).toEqual([
            missingProject,
            samePath,
        ]);
    });
});
