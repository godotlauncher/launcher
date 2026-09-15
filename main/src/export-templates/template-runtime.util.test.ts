import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    connectEmptyTemplateFolder,
    templateConnectionStatus,
} from './template-files.util.js';
import { connectProjectTemplates } from './template-runtime.util.js';

vi.mock('node:fs', () => ({ promises: { unlink: vi.fn(), mkdir: vi.fn() } }));
vi.mock('electron-log', () => ({ default: { warn: vi.fn() } }));
vi.mock('../config/current-app-config.js', () => ({
    getCurrentAppConfig: () => ({
        e2eFixtures: true,
        paths: { configDir: path.resolve('fixture-config') },
    }),
}));
vi.mock('./template-files.util.js', () => ({
    connectEmptyTemplateFolder: vi.fn(),
    templateConnectionStatus: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());

describe('project template connection', () => {
    it('keeps an official editor usable when its link cannot be created', async () => {
        vi.mocked(connectEmptyTemplateFolder).mockRejectedValue(
            new Error('permission'),
        );
        await expect(
            connectProjectTemplates(path.resolve('editor'), {
                source: 'official',
            }),
        ).resolves.toBeUndefined();
        expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
    it('detaches only the shared link when selecting a custom editor', async () => {
        vi.mocked(templateConnectionStatus).mockResolvedValue('shared');
        const editor = path.resolve('editor');
        await connectProjectTemplates(editor, { source: 'custom' });
        expect(fs.promises.unlink).toHaveBeenCalledWith(
            path.join(editor, 'editor_data', 'export_templates'),
        );
        expect(fs.promises.mkdir).toHaveBeenCalledWith(
            path.join(editor, 'editor_data', 'export_templates'),
        );
        expect(connectEmptyTemplateFolder).not.toHaveBeenCalled();
    });
    it.each(['local', 'foreign'] as const)(
        'preserves a custom editor with a %s collection',
        async (status) => {
            vi.mocked(templateConnectionStatus).mockResolvedValue(status);
            await connectProjectTemplates(path.resolve('editor'), {
                source: 'custom',
            });
            expect(fs.promises.unlink).not.toHaveBeenCalled();
            expect(connectEmptyTemplateFolder).not.toHaveBeenCalled();
        },
    );
    it('does not silently keep custom editor writes connected when detachment fails', async () => {
        vi.mocked(templateConnectionStatus).mockResolvedValue('shared');
        vi.mocked(fs.promises.unlink).mockRejectedValue(
            new Error('permission'),
        );
        await expect(
            connectProjectTemplates(path.resolve('editor'), {
                source: 'custom',
            }),
        ).rejects.toThrow('permission');
    });
});
