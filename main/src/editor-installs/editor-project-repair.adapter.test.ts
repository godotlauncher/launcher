import type { ProjectDetails } from '@shared/contracts';
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
    hasSameInstalledEditorIdentity: vi.fn(() => false),
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
});
