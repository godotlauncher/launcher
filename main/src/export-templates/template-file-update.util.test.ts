import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateTemplateFiles } from './template-file-update.util.js';
import { templateLstat } from './template-files.util.js';

vi.mock('node:fs', () => ({
    constants: { COPYFILE_EXCL: 1 },
    promises: {
        mkdir: vi.fn(),
        lstat: vi.fn(),
        link: vi.fn(),
        copyFile: vi.fn(),
        chmod: vi.fn(),
        rename: vi.fn(),
        rm: vi.fn(),
        unlink: vi.fn(),
    },
}));
vi.mock('./template-files.util.js', async (load) => ({
    ...(await load<typeof import('./template-files.util.js')>()),
    templateLstat: vi.fn(),
}));
const root = path.resolve('installed');
const source = path.resolve('downloaded');
const directory = {
    isDirectory: () => true,
    isFile: () => false,
    isSymbolicLink: () => false,
} as fs.Stats;
const file = {
    isDirectory: () => false,
    isFile: () => true,
    isSymbolicLink: () => false,
    mode: 0o755,
} as fs.Stats;
beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(templateLstat).mockImplementation(async (name) =>
        [root, source].includes(String(name)) ? directory : undefined,
    );
    vi.mocked(fs.promises.lstat).mockResolvedValue(file);
});
describe('direct export template changes', () => {
    it('removes exactly the selected file without copying its neighbours', async () => {
        vi.mocked(templateLstat).mockImplementation(async (name) =>
            String(name) === root ? directory : file,
        );
        await updateTemplateFiles(root, source, [], ['linux.zip']);
        expect(fs.promises.unlink).toHaveBeenCalledExactlyOnceWith(
            path.join(root, 'linux.zip'),
        );
        expect(fs.promises.copyFile).not.toHaveBeenCalled();
        expect(fs.promises.link).not.toHaveBeenCalled();
    });
    it('publishes an already verified download without copying it again', async () => {
        await updateTemplateFiles(root, source, ['web.zip'], []);
        expect(fs.promises.link).toHaveBeenCalledExactlyOnceWith(
            path.join(source, 'web.zip'),
            path.join(root, 'web.zip'),
        );
        expect(fs.promises.copyFile).not.toHaveBeenCalled();
    });
    it('leaves an existing shared file untouched', async () => {
        vi.mocked(templateLstat).mockImplementation(async (name) =>
            String(name) === root ? directory : file,
        );
        await updateTemplateFiles(root, source, ['web.zip'], []);
        expect(fs.promises.link).not.toHaveBeenCalled();
        expect(fs.promises.copyFile).not.toHaveBeenCalled();
        expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
    it('copies project originals so a failed connection cannot link local edits to shared storage', async () => {
        await updateTemplateFiles(root, source, ['web.zip'], [], true);
        expect(fs.promises.copyFile).toHaveBeenCalledWith(
            path.join(source, 'web.zip'),
            expect.stringContaining('web.zip.launcher-'),
            fs.constants.COPYFILE_EXCL,
        );
        expect(fs.promises.link).not.toHaveBeenCalledWith(
            path.join(source, 'web.zip'),
            expect.anything(),
        );
    });
    it('keeps existing files when publishing a download fails', async () => {
        vi.mocked(fs.promises.link).mockRejectedValue(
            Object.assign(new Error('disk full'), { code: 'ENOSPC' }),
        );
        await expect(
            updateTemplateFiles(root, source, ['web.zip'], ['linux.zip']),
        ).rejects.toThrow('disk full');
        expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
    it('refuses redirected parent directories', async () => {
        vi.mocked(templateLstat).mockResolvedValue({
            ...directory,
            isSymbolicLink: () => true,
        } as fs.Stats);
        await expect(
            updateTemplateFiles(root, source, [], ['linux.zip']),
        ).rejects.toThrow('errors.unsafe');
        expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
    it('can retry deletion after one of the selected files is already gone', async () => {
        vi.mocked(templateLstat).mockImplementation(async (name) =>
            String(name) === root
                ? directory
                : String(name).endsWith('linux.zip')
                  ? file
                  : undefined,
        );
        await updateTemplateFiles(root, source, [], ['web.zip', 'linux.zip']);
        expect(fs.promises.unlink).toHaveBeenCalledExactlyOnceWith(
            path.join(root, 'linux.zip'),
        );
    });
});
