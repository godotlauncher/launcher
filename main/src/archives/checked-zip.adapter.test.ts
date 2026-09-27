import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { crc32 } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Entry, open, type ZipFile } from 'yauzl';
import { extractCheckedZip, validateZipEntry } from './checked-zip.adapter.js';

vi.mock('yauzl', () => ({ open: vi.fn() }));
const regular = {
    fileName: 'templates/version.txt',
    externalFileAttributes: (0o100644 << 16) >>> 0,
    generalPurposeBitFlag: 0,
    uncompressedSize: 24,
};
describe('checked ZIP entry policy', () => {
    it('accepts contained regular files and directories', () => {
        expect(validateZipEntry(regular, path.resolve('staging'))).toBe(
            'templates/version.txt',
        );
        expect(
            validateZipEntry(
                {
                    ...regular,
                    fileName: 'templates/',
                    externalFileAttributes: (0o040755 << 16) >>> 0,
                },
                path.resolve('staging'),
            ),
        ).toBe('templates');
    });
    it.each([
        '../outside',
        '/absolute',
        'templates/../outside',
        'templates\\outside',
        'templates/NUL',
        'templates/a:stream',
        'C:/outside',
        '//server/share/outside',
        'templates/trailing.',
        'templates/trailing ',
        'templates/COM\u00b9.txt',
        'templates/LPT\u00b3',
    ])('rejects unsafe archive paths: %s', (fileName) => {
        expect(() =>
            validateZipEntry({ ...regular, fileName }, path.resolve('staging')),
        ).toThrow('unsafe');
    });
    it('rejects symlinks even when their target might stay inside the archive', () => {
        expect(() =>
            validateZipEntry(
                { ...regular, externalFileAttributes: (0o120777 << 16) >>> 0 },
                path.resolve('staging'),
            ),
        ).toThrow('unsafe');
    });
    it('rejects encrypted entries and impossible sizes', () => {
        expect(() =>
            validateZipEntry(
                { ...regular, generalPurposeBitFlag: 1 },
                path.resolve('staging'),
            ),
        ).toThrow('unsafe');
        expect(() =>
            validateZipEntry(
                { ...regular, uncompressedSize: Number.MAX_SAFE_INTEGER + 1 },
                path.resolve('staging'),
            ),
        ).toThrow('unsafe');
    });
});

vi.mock('node:fs', () => ({
    promises: { lstat: vi.fn(), statfs: vi.fn(), mkdir: vi.fn() },
    createWriteStream: vi.fn(),
}));
const archive = path.resolve('Template packages', 'caf\u00e9.zip');
const destination = path.resolve('Extracted templates', '\u65e5\u672c\u8a9e');
let zip: EventEmitter & {
    readEntry: ReturnType<typeof vi.fn>;
    openReadStream: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
};
let entries: Entry[];
const data = Buffer.from('template bytes');
beforeEach(() => {
    vi.resetAllMocks();
    entries = [
        {
            ...regular,
            fileName: 'payload',
            uncompressedSize: data.length,
            crc32: crc32(data),
        } as Entry,
    ];
    let index = 0;
    zip = Object.assign(new EventEmitter(), {
        readEntry: vi.fn(() =>
            queueMicrotask(() =>
                index < entries.length
                    ? zip.emit('entry', entries[index++])
                    : zip.emit('end'),
            ),
        ),
        openReadStream: vi.fn(
            (
                _entry: Entry,
                callback: (error: Error | null, input: Readable) => void,
            ) => callback(null, Readable.from([data])),
        ),
        close: vi.fn(),
    });
    vi.mocked(open).mockImplementation((...args: unknown[]) => {
        (args.at(-1) as (error: Error | null, zip: ZipFile) => void)(
            null,
            zip as unknown as ZipFile,
        );
    });
    vi.mocked(fs.promises.lstat).mockResolvedValue({
        isFile: () => true,
        isSymbolicLink: () => false,
    } as fs.Stats);
    vi.mocked(fs.promises.statfs).mockResolvedValue({
        bavail: 1024 * 1024,
        bsize: 4096,
    } as fs.StatsFs);
    vi.mocked(fs.createWriteStream).mockImplementation(
        () =>
            new Writable({
                write(_chunk, _encoding, callback) {
                    callback();
                },
            }) as fs.WriteStream,
    );
});

describe('checked ZIP extraction', () => {
    it('reports expanded bytes from zero through the complete payload', async () => {
        const onProgress = vi.fn();
        await extractCheckedZip(archive, destination, {
            signal: new AbortController().signal,
            validateEntries: vi.fn(),
            onProgress,
        });
        expect(onProgress).toHaveBeenNthCalledWith(1, 0, data.length);
        expect(onProgress).toHaveBeenLastCalledWith(data.length, data.length);
    });

    it('preflights expanded size and feature rules before writing, then closes the same handle', async () => {
        const validateEntries = vi.fn((manifest) => {
            expect(manifest.uncompressedBytes).toBe(data.length);
            expect(fs.createWriteStream).not.toHaveBeenCalled();
        });
        const result = await extractCheckedZip(archive, destination, {
            signal: new AbortController().signal,
            validateEntries,
        });
        expect(result.entries).toEqual([
            { path: 'payload', kind: 'file', sizeBytes: data.length },
        ]);
        expect(validateEntries).toHaveBeenCalledOnce();
        expect(open).toHaveBeenCalledOnce();
        expect(zip.close).toHaveBeenCalledOnce();
    });
    it('closes the archive without writing when the feature rejects its layout', async () => {
        const error = new Error('invalid layout');
        await expect(
            extractCheckedZip(archive, destination, {
                signal: new AbortController().signal,
                validateEntries: () => {
                    throw error;
                },
            }),
        ).rejects.toBe(error);
        expect(fs.createWriteStream).not.toHaveBeenCalled();
        expect(zip.close).toHaveBeenCalledOnce();
    });
    it('refuses insufficient capacity before creating the extraction directory', async () => {
        vi.mocked(fs.promises.statfs).mockResolvedValue({
            bavail: 0,
            bsize: 4096,
        } as fs.StatsFs);
        await expect(
            extractCheckedZip(archive, destination, {
                signal: new AbortController().signal,
                validateEntries: vi.fn(),
            }),
        ).rejects.toMatchObject({ code: 'space' });
        expect(fs.promises.mkdir).not.toHaveBeenCalled();
        expect(zip.close).toHaveBeenCalledOnce();
    });
    it('refuses duplicate entry names before any files are written', async () => {
        entries.push({ ...entries[0], fileName: 'PAYLOAD' } as Entry);
        await expect(
            extractCheckedZip(archive, destination, {
                signal: new AbortController().signal,
                validateEntries: vi.fn(),
            }),
        ).rejects.toMatchObject({ code: 'unsafe' });
        expect(fs.createWriteStream).not.toHaveBeenCalled();
        expect(zip.close).toHaveBeenCalledOnce();
    });
    it('rejects Unicode-equivalent paths before writing on any host', async () => {
        entries[0].fileName = 'caf\u00e9';
        entries.push({ ...entries[0], fileName: 'cafe\u0301' } as Entry);
        await expect(
            extractCheckedZip(archive, destination, {
                signal: new AbortController().signal,
                validateEntries: vi.fn(),
            }),
        ).rejects.toMatchObject({ code: 'unsafe' });
        expect(fs.createWriteStream).not.toHaveBeenCalled();
        expect(zip.close).toHaveBeenCalledOnce();
    });
    it('rejects damaged file contents and closes the archive', async () => {
        entries[0].crc32 ^= 1;
        await expect(
            extractCheckedZip(archive, destination, {
                signal: new AbortController().signal,
                validateEntries: vi.fn(),
            }),
        ).rejects.toMatchObject({ code: 'corrupt' });
        expect(zip.close).toHaveBeenCalledOnce();
    });
    it('rejects a linked archive before opening it', async () => {
        vi.mocked(fs.promises.lstat).mockResolvedValue({
            isFile: () => true,
            isSymbolicLink: () => true,
        } as fs.Stats);
        await expect(
            extractCheckedZip(archive, destination, {
                signal: new AbortController().signal,
                validateEntries: vi.fn(),
            }),
        ).rejects.toMatchObject({ code: 'unsafe' });
        expect(open).not.toHaveBeenCalled();
    });
    it('refuses an existing destination without writing files or deleting its contents', async () => {
        vi.mocked(fs.promises.mkdir).mockRejectedValue(
            Object.assign(new Error('already exists'), { code: 'EEXIST' }),
        );
        await expect(
            extractCheckedZip(archive, destination, {
                signal: new AbortController().signal,
                validateEntries: vi.fn(),
            }),
        ).rejects.toMatchObject({ code: 'EEXIST' });
        expect(fs.createWriteStream).not.toHaveBeenCalled();
        expect(zip.close).toHaveBeenCalledOnce();
    });
    it('aborts a running file stream and releases the archive handle', async () => {
        const controller = new AbortController();
        const input = new Readable({
            read() {
                this.push(data);
            },
        });
        zip.openReadStream.mockImplementation(
            (
                _entry: Entry,
                callback: (error: Error | null, input: Readable) => void,
            ) => callback(null, input),
        );
        vi.mocked(fs.createWriteStream).mockImplementation(
            () =>
                new Writable({
                    write(_chunk, _encoding, callback) {
                        controller.abort();
                        callback();
                    },
                }) as fs.WriteStream,
        );
        await expect(
            extractCheckedZip(archive, destination, {
                signal: controller.signal,
                validateEntries: vi.fn(),
            }),
        ).rejects.toMatchObject({ name: 'AbortError' });
        expect(input.destroyed).toBe(true);
        expect(zip.close).toHaveBeenCalledOnce();
    });
});
