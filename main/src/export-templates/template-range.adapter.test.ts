import * as fs from 'node:fs';
import * as path from 'node:path';
import { PassThrough, Readable, Writable } from 'node:stream';
import { createInflateRaw } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Entry, fromRandomAccessReaderPromise, type ZipFile } from 'yauzl';
import {
    extractTemplateRange,
    openTemplateRange,
} from './template-range.adapter.js';

vi.mock('yauzl', () => ({
    RandomAccessReader: class {},
    fromRandomAccessReaderPromise: vi.fn(),
}));
vi.mock('node:fs', () => ({
    promises: { mkdir: vi.fn() },
    createWriteStream: vi.fn(),
}));
vi.mock('node:zlib', () => ({
    crc32: vi.fn(() => 123),
    createInflateRaw: vi.fn(() => new PassThrough()),
}));

const url = 'https://example.test/templates.tpz';
const size = 256 * 1024;
const payload = Buffer.from('template bytes');
const destination = path.resolve('staging');
const fetchMock = vi.fn();
let entries: Entry[];
const zip = {
    on: vi.fn(),
    close: vi.fn(),
    eachEntry: async function* () {
        yield* entries;
    },
    openReadStreamPromise: vi.fn(),
};

beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    entries = [
        {
            fileName: 'templates/version.txt',
            uncompressedSize: payload.length,
            compressedSize: payload.length,
            compressionMethod: 0,
            crc32: 123,
            externalFileAttributes: (0o100644 << 16) >>> 0,
            generalPurposeBitFlag: 0,
        } as Entry,
    ];
    vi.mocked(fromRandomAccessReaderPromise).mockResolvedValue(
        zip as unknown as ZipFile,
    );
    zip.openReadStreamPromise.mockImplementation(async () =>
        Readable.from([payload]),
    );
    vi.mocked(fs.createWriteStream).mockImplementation(
        () =>
            new Writable({
                write(_chunk, _encoding, callback) {
                    callback();
                },
            }) as fs.WriteStream,
    );
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
        if (init.method === 'HEAD')
            return new Response(null, {
                headers: { 'content-length': String(size), etag: '"fixture"' },
            });
        return new Response(new Uint8Array(128 * 1024), {
            status: 206,
            headers: {
                'content-range': `bytes 0-131071/${size}`,
                etag: '"fixture"',
            },
        });
    });
});
afterEach(() => vi.unstubAllGlobals());

/** Opens the public adapter and captures the reader passed to the mocked parser. */
async function openReader() {
    const controller = new AbortController();
    await openTemplateRange(url, controller.signal);
    const reader = vi.mocked(fromRandomAccessReaderPromise).mock
        .calls[0][0] as unknown as {
        _readStreamForRange: (start: number, end: number) => Readable;
    };
    return { reader, controller };
}

/** Consumes a stream so its completion and failures are observable.
 * @param stream - Adapter output supplied to the parser.
 */
async function read(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

describe('remote template index', () => {
    it('returns validated entries and their shared package prefix', async () => {
        const result = await openTemplateRange(
            url,
            new AbortController().signal,
        );
        expect(result.index).toMatchObject({
            url,
            size,
            prefix: 'templates/',
            entries,
        });
        expect(result.zip).toBe(zip);
        expect(fs.createWriteStream).not.toHaveBeenCalled();
    });

    it.each([
        { status: 403, error: 'downloadUnavailable' },
        { status: 404, error: 'downloadUnavailable' },
        { status: 410, error: 'downloadUnavailable' },
        { status: 429, error: 'downloadServer' },
        { status: 503, error: 'downloadServer' },
        { status: 405, error: 'downloadPartial' },
        { status: 501, error: 'downloadPartial' },
        { status: 400, error: 'downloadFailed' },
    ])(
        'classifies HTTP $status before reading ZIP metadata',
        async ({ status, error }) => {
            fetchMock.mockResolvedValueOnce(new Response(null, { status }));
            await expect(
                openTemplateRange(url, new AbortController().signal),
            ).rejects.toThrow(`errors.${error}`);
            expect(fromRandomAccessReaderPromise).not.toHaveBeenCalled();
        },
    );

    it.each([
        {
            headers: { 'content-length': String(size) },
            reason: 'a missing validator',
        },
        { headers: { etag: '"fixture"' }, reason: 'a missing size' },
    ])(
        'identifies $reason without claiming ranges are unsupported',
        async ({ headers }) => {
            fetchMock.mockResolvedValueOnce(new Response(null, { headers }));
            await expect(
                openTemplateRange(url, new AbortController().signal),
            ).rejects.toThrow('errors.downloadPartial');
        },
    );

    it.each([
        { cause: new TypeError('fetch failed'), error: 'downloadNetwork' },
        {
            cause: new DOMException('timed out', 'TimeoutError'),
            error: 'downloadNetwork',
        },
        { cause: new Error('unexpected failure'), error: 'downloadFailed' },
    ])('classifies request failures as $error', async ({ cause, error }) => {
        fetchMock.mockRejectedValueOnce(cause);
        await expect(
            openTemplateRange(url, new AbortController().signal),
        ).rejects.toThrow(`errors.${error}`);
    });

    it('keeps user cancellation separate from a failed connection', async () => {
        const controller = new AbortController();
        controller.abort();
        fetchMock.mockRejectedValueOnce(controller.signal.reason);
        await expect(
            openTemplateRange(url, controller.signal),
        ).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('classifies parser failures as an unreadable package', async () => {
        vi.mocked(fromRandomAccessReaderPromise).mockRejectedValueOnce(
            new Error('invalid ZIP signature'),
        );
        await expect(
            openTemplateRange(url, new AbortController().signal),
        ).rejects.toThrow('errors.downloadInvalid');
    });

    it.each([
        {
            name: 'TimeoutError',
            expected: 'exportTemplates:errors.downloadNetwork',
        },
        { name: 'AbortError', expected: 'cancelled by user' },
    ])(
        'preserves $name during file-list discovery',
        async ({ name, expected }) => {
            const controller = new AbortController();
            vi.mocked(fromRandomAccessReaderPromise).mockImplementationOnce(
                async () => {
                    const reason = new DOMException('cancelled by user', name);
                    controller.abort(reason);
                    throw reason;
                },
            );
            await expect(
                openTemplateRange(url, controller.signal),
            ).rejects.toThrow(expected);
        },
    );

    it('closes the parser when an entry escapes the package', async () => {
        entries[0].fileName = '../escaped';
        await expect(
            openTemplateRange(url, new AbortController().signal),
        ).rejects.toThrow('unsafe');
        expect(zip.close).toHaveBeenCalledOnce();
    });

    it('rejects missing package identity before extraction', async () => {
        entries[0].fileName = 'templates/macos.zip';
        await expect(
            openTemplateRange(url, new AbortController().signal),
        ).rejects.toThrow('identity');
        expect(zip.close).toHaveBeenCalledOnce();
    });

    it('rejects a redirect from the package URL to HTTP', async () => {
        fetchMock.mockResolvedValueOnce(
            new Response(null, {
                status: 302,
                headers: { location: 'http://example.test/templates.tpz' },
            }),
        );

        await expect(
            openTemplateRange(url, new AbortController().signal),
        ).rejects.toThrow('errors.package');

        expect(fetchMock).toHaveBeenCalledOnce();
        expect(fromRandomAccessReaderPromise).not.toHaveBeenCalled();
    });
});

describe('remote template ranges', () => {
    it('requests a bounded range with the validator and reuses its metadata block', async () => {
        const { reader } = await openReader();
        expect((await read(reader._readStreamForRange(10, 20))).length).toBe(
            10,
        );
        expect((await read(reader._readStreamForRange(30, 40))).length).toBe(
            10,
        );
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenLastCalledWith(
            url,
            expect.objectContaining({
                headers: {
                    Range: 'bytes=0-131071',
                    'If-Range': '"fixture"',
                    'Accept-Encoding': 'identity',
                },
            }),
        );
    });

    it('rejects a server that ignores the requested range', async () => {
        const { reader } = await openReader();
        fetchMock.mockResolvedValueOnce(
            new Response('whole archive', { status: 200 }),
        );
        await expect(read(reader._readStreamForRange(0, 10))).rejects.toThrow(
            'errors.downloadPartial',
        );
    });

    it.each([
        {
            reason: 'a changed validator',
            error: 'errors.downloadChanged',
            range: `bytes 0-131071/${size}`,
            etag: '"changed"',
        },
        {
            reason: 'an incorrect content range',
            error: 'errors.downloadPartial',
            range: `bytes 1-131072/${size}`,
            etag: '"fixture"',
        },
    ])(
        'rejects $reason in a partial response',
        async ({ range, etag, error }) => {
            const { reader } = await openReader();
            fetchMock.mockResolvedValueOnce(
                new Response(new Uint8Array(128 * 1024), {
                    status: 206,
                    headers: { 'content-range': range, etag },
                }),
            );

            await expect(
                read(reader._readStreamForRange(0, 10)),
            ).rejects.toThrow(error);
        },
    );

    it('identifies an archive size change in a range response', async () => {
        const { reader } = await openReader();
        fetchMock.mockResolvedValueOnce(
            new Response(new Uint8Array(128 * 1024), {
                status: 206,
                headers: {
                    'content-range': `bytes 0-131071/${size + 1}`,
                    etag: '"fixture"',
                },
            }),
        );
        await expect(read(reader._readStreamForRange(0, 10))).rejects.toThrow(
            'errors.downloadChanged',
        );
    });

    it('identifies a missing response validator without claiming the package changed', async () => {
        const { reader } = await openReader();
        fetchMock.mockResolvedValueOnce(
            new Response(new Uint8Array(128 * 1024), {
                status: 206,
                headers: { 'content-range': `bytes 0-131071/${size}` },
            }),
        );
        await expect(read(reader._readStreamForRange(0, 10))).rejects.toThrow(
            'errors.downloadPartial',
        );
    });

    it('identifies a changed package even when the server returns the whole archive', async () => {
        const { reader } = await openReader();
        fetchMock.mockResolvedValueOnce(
            new Response('new archive', {
                status: 200,
                headers: { etag: '"changed"' },
            }),
        );
        await expect(read(reader._readStreamForRange(0, 10))).rejects.toThrow(
            'errors.downloadChanged',
        );
    });
    it.each([10, 65536])(
        'keeps a dropped connection distinct from an unreadable archive for %i bytes',
        async (length) => {
            const { reader } = await openReader();
            const stream = new ReadableStream({
                start(controller) {
                    controller.error(new TypeError('terminated'));
                },
            });
            fetchMock.mockResolvedValueOnce(
                new Response(stream, {
                    status: 206,
                    headers: {
                        'content-range': `bytes 0-${length === 10 ? 131071 : length - 1}/${size}`,
                        etag: '"fixture"',
                    },
                }),
            );
            await expect(
                read(reader._readStreamForRange(0, length)),
            ).rejects.toThrow('errors.downloadNetwork');
        },
    );
    it('honours cancellation before requesting another range', async () => {
        const { reader, controller } = await openReader();
        controller.abort();
        await expect(
            read(reader._readStreamForRange(0, 10)),
        ).rejects.toMatchObject({ name: 'AbortError' });
        expect(fetchMock).toHaveBeenCalledOnce();
    });
});

describe('selected template extraction', () => {
    it('writes only the selected entry and reports its transferred bytes', async () => {
        const progress = vi.fn();
        await extractTemplateRange(
            zip as unknown as ZipFile,
            entries[0],
            destination,
            'version.txt',
            new AbortController().signal,
            progress,
        );
        expect(zip.openReadStreamPromise).toHaveBeenCalledWith(entries[0], {
            decodeFileData: false,
        });
        expect(fs.createWriteStream).toHaveBeenCalledOnce();
        expect(fs.createWriteStream).toHaveBeenCalledWith(
            path.join(destination, 'version.txt'),
            { flags: 'wx', mode: 0o644 },
        );
        expect(progress).toHaveBeenCalledWith(payload.length);
        expect(createInflateRaw).not.toHaveBeenCalled();
    });

    it('delegates compressed payloads to the inflater', async () => {
        entries[0].compressionMethod = 8;
        await extractTemplateRange(
            zip as unknown as ZipFile,
            entries[0],
            destination,
            'version.txt',
            new AbortController().signal,
            vi.fn(),
        );
        expect(createInflateRaw).toHaveBeenCalledOnce();
    });

    it.each(['crc32', 'compressedSize', 'uncompressedSize'] as const)(
        'rejects a payload that does not match its %s',
        async (field) => {
            entries[0][field] += 1;
            await expect(
                extractTemplateRange(
                    zip as unknown as ZipFile,
                    entries[0],
                    destination,
                    'version.txt',
                    new AbortController().signal,
                    vi.fn(),
                ),
            ).rejects.toThrow('errors.archive');
        },
    );
});
