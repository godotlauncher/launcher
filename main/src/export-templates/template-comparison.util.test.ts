import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compareTemplateTrees } from './template-comparison.util.js';
import { readTemplateTree } from './template-files.util.js';

vi.mock('node:fs', () => ({
    promises: { lstat: vi.fn() },
    createReadStream: vi.fn(),
}));
vi.mock('./template-files.util.js', async (load) => ({
    ...(await load<typeof import('./template-files.util.js')>()),
    readTemplateTree: vi.fn(),
}));
let sequence = 0;
let local: string;
let shared: string;
const file = { relative: 'template', hash: '', size: 4, mode: 0o644 };
const stat = {
    dev: 1,
    ino: 2,
    size: 4,
    mtimeMs: 1,
    ctimeMs: 1,
    mode: 0o644,
    isFile: () => true,
    isSymbolicLink: () => false,
} as fs.Stats;
beforeEach(() => {
    vi.resetAllMocks();
    local = path.resolve(`local-${++sequence}`);
    shared = path.resolve(`shared-${sequence}`);
    vi.mocked(readTemplateTree).mockResolvedValue([file]);
    vi.mocked(fs.promises.lstat).mockResolvedValue(stat);
    vi.mocked(fs.createReadStream).mockImplementation(
        () => Readable.from([Buffer.from('same')]) as fs.ReadStream,
    );
});
describe('advisory template comparison', () => {
    it('lists names and sizes without opening matching file contents', async () => {
        expect(await compareTemplateTrees(local, shared, false)).toEqual([
            {
                path: 'template',
                state: 'checking',
                localBytes: 4,
                sharedBytes: 4,
            },
        ]);
        expect(fs.createReadStream).not.toHaveBeenCalled();
    });
    it('does not hash different sizes or one-sided files', async () => {
        vi.mocked(readTemplateTree)
            .mockResolvedValueOnce([file, { ...file, relative: 'private' }])
            .mockResolvedValueOnce([{ ...file, size: 8 }]);
        expect(
            (await compareTemplateTrees(local, shared, true)).map(
                (item) => item.state,
            ),
        ).toEqual(['local-only', 'different']);
        expect(fs.createReadStream).not.toHaveBeenCalled();
    });
    it('reuses unchanged hashes when revisiting a project', async () => {
        expect((await compareTemplateTrees(local, shared, true))[0].state).toBe(
            'identical',
        );
        expect((await compareTemplateTrees(local, shared, true))[0].state).toBe(
            'identical',
        );
        expect(fs.createReadStream).toHaveBeenCalledTimes(2);
    });
    it('invalidates a cached hash when file metadata changes', async () => {
        await compareTemplateTrees(local, shared, true);
        vi.mocked(fs.promises.lstat).mockResolvedValue({ ...stat, ctimeMs: 2 });
        await compareTemplateTrees(local, shared, true);
        expect(fs.createReadStream).toHaveBeenCalledTimes(4);
    });
    it('cancels obsolete comparisons before opening files', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(
            compareTemplateTrees(local, shared, true, controller.signal),
        ).rejects.toThrow();
        expect(fs.createReadStream).not.toHaveBeenCalled();
    });
    it('rejects a file that changes while being read', async () => {
        vi.mocked(fs.promises.lstat)
            .mockResolvedValueOnce(stat)
            .mockResolvedValueOnce({ ...stat, mtimeMs: 2 });
        await expect(compareTemplateTrees(local, shared, true)).rejects.toThrow(
            'errors.changed',
        );
    });
});
