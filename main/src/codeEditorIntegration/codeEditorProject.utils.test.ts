import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodeEditorIntegrationService } from './codeEditorIntegration.service.js';
import { resolvePortableCodeEditorIdForWrite } from './codeEditorProject.utils.js';

const projectLauncherConfigMocks = vi.hoisted(() => ({
    readProjectLauncherConfig: vi.fn(),
}));

vi.mock('../utils/projectLauncherConfig.utils.js', () => ({
    readProjectLauncherConfig:
        projectLauncherConfigMocks.readProjectLauncherConfig,
}));

describe('resolvePortableCodeEditorIdForWrite', () => {
    const resolvePortableSelectionId = vi.fn();
    const service = {
        resolvePortableSelectionId,
    } as unknown as CodeEditorIntegrationService;

    beforeEach(() => {
        vi.clearAllMocks();
        resolvePortableSelectionId.mockReturnValue(null);
    });

    it('resolves an existing portable selection against canonical state', async () => {
        projectLauncherConfigMocks.readProjectLauncherConfig.mockResolvedValue({
            code_editor: { id: 'future-editor' },
        });
        resolvePortableSelectionId.mockReturnValue('future-editor');

        await expect(
            resolvePortableCodeEditorIdForWrite('/project', null, service),
        ).resolves.toBe('future-editor');

        expect(resolvePortableSelectionId).toHaveBeenCalledWith(
            null,
            'future-editor',
        );
    });

    it('uses canonical state when the sidecar has no selection', async () => {
        projectLauncherConfigMocks.readProjectLauncherConfig.mockResolvedValue({
            editor: {},
        });
        resolvePortableSelectionId.mockReturnValue('vscode');

        await expect(
            resolvePortableCodeEditorIdForWrite('/project', 'vscode', service),
        ).resolves.toBe('vscode');

        expect(resolvePortableSelectionId).toHaveBeenCalledWith(
            'vscode',
            undefined,
        );
    });
});
