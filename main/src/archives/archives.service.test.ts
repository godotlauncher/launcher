import * as fs from 'node:fs';
import * as path from 'node:path';
import extractZip from '@electron-internal/extract-zip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArchivesService } from './archives.service.js';
import { extractCheckedZip } from './checked-zip.adapter.js';

vi.mock('@electron-internal/extract-zip', () => ({ default: vi.fn() }));
vi.mock('./checked-zip.adapter.js', () => ({ extractCheckedZip: vi.fn() }));
vi.mock('node:fs', () => ({ promises: { lstat: vi.fn(), readdir: vi.fn() } }));
const service = new ArchivesService();
const archive = path.resolve('editor.zip');
const destination = path.resolve('extracted');
beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(fs.promises.lstat).mockImplementation(
        async (filename) =>
            ({
                isFile: () => filename === archive,
                isDirectory: () => filename === destination,
                isSymbolicLink: () => false,
            }) as fs.Stats,
    );
    vi.mocked(fs.promises.readdir).mockResolvedValue([]);
});
describe('archive service', () => {
    it('delegates native extraction only after validating an empty destination', async () => {
        await service.extractZip(archive, destination);
        expect(extractZip).toHaveBeenCalledWith(archive, { dir: destination });
    });
    it('refuses to extract over existing contents', async () => {
        vi.mocked(fs.promises.readdir).mockResolvedValue(['existing'] as never);
        await expect(
            service.extractZip(archive, destination),
        ).rejects.toMatchObject({ code: 'unsafe' });
        expect(extractZip).not.toHaveBeenCalled();
    });
    it('rejects relative paths and linked destinations', async () => {
        await expect(
            service.extractZip('relative.zip', destination),
        ).rejects.toMatchObject({ code: 'unsafe' });
        vi.mocked(fs.promises.lstat).mockResolvedValue({
            isFile: () => true,
            isDirectory: () => true,
            isSymbolicLink: () => true,
        } as fs.Stats);
        await expect(
            service.extractZip(archive, destination),
        ).rejects.toMatchObject({ code: 'unsafe' });
        expect(extractZip).not.toHaveBeenCalled();
    });
    it('preserves native failure details without coupling errors to an app feature', async () => {
        const cause = new Error('native extraction failed');
        vi.mocked(extractZip).mockRejectedValue(cause);
        await expect(
            service.extractZip(archive, destination),
        ).rejects.toMatchObject({ code: 'unsafe', cause });
    });
    it('passes checked validation and cancellation through and returns its manifest', async () => {
        const manifest = { entries: [], uncompressedBytes: 0 };
        vi.mocked(extractCheckedZip).mockResolvedValue(manifest);
        const options = {
            signal: new AbortController().signal,
            validateEntries: vi.fn(),
        };
        await expect(
            service.extractCheckedZip(archive, destination, options),
        ).resolves.toBe(manifest);
        expect(extractCheckedZip).toHaveBeenCalledWith(
            archive,
            destination,
            options,
        );
    });
});
