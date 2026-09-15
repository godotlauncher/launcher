import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    extractTemplateRange,
    openTemplateRange,
} from './template-range.adapter.js';

const directories: string[] = [];
afterEach(async () => {
    vi.unstubAllGlobals();
    await Promise.all(
        directories
            .splice(0)
            .map((directory) =>
                fs.rm(directory, { recursive: true, force: true }),
            ),
    );
});

/** Serves exact ranges from a generated archive without any network access.
 * @param archive - Test ZIP bytes.
 * @param status - Response status for range requests.
 */
function serve(archive: Buffer, status = 206) {
    const ranges: [number, number][] = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) => {
            const headers = {
                etag: '"fixture"',
                'content-length': String(archive.length),
            };
            if (init.method === 'HEAD') return new Response(null, { headers });
            const range = new Headers(init.headers).get('range') ?? '';
            const match = /bytes=(\d+)-(\d+)/.exec(range);
            if (!match) throw new Error('Expected a range');
            const start = Number(match[1]);
            const end = Number(match[2]) + 1;
            ranges.push([start, end]);
            return new Response(new Uint8Array(archive.subarray(start, end)), {
                status,
                headers: {
                    ...headers,
                    'content-length': String(end - start),
                    'content-range': `bytes ${start}-${end - 1}/${archive.length}`,
                },
            });
        }),
    );
    return ranges;
}

describe('remote template archive', () => {
    it('indexes and extracts one chosen file without downloading the other platform payload', async () => {
        const archive = storedZip({
            'templates/version.txt': '4.7.2.stable',
            'templates/linux_debug.x86_64': 'selected file',
            'templates/macos.zip': 'x'.repeat(2 * 1024 * 1024),
        });
        const ranges = serve(archive);
        const { zip, index } = await openTemplateRange(
            'https://example.test/templates.tpz',
            new AbortController().signal,
        );
        const directory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'template-range-'),
        );
        directories.push(directory);
        try {
            expect(index.entries.map((entry) => entry.fileName)).toEqual([
                'templates/version.txt',
                'templates/linux_debug.x86_64',
                'templates/macos.zip',
            ]);
            await extractTemplateRange(
                zip,
                index.entries[1],
                directory,
                'linux_debug.x86_64',
                new AbortController().signal,
                vi.fn(),
            );
            expect(
                await fs.readFile(
                    path.join(directory, 'linux_debug.x86_64'),
                    'utf8',
                ),
            ).toBe('selected file');
            expect(await fs.readdir(directory)).toEqual(['linux_debug.x86_64']);
            expect(
                ranges.reduce((sum, [start, end]) => sum + end - start, 0),
            ).toBeLessThan(archive.length / 2);
        } finally {
            zip.close();
        }
    });
    it('inflates compressed files and reports compressed download bytes', async () => {
        const content = 'template data'.repeat(1000);
        serve(
            storedZip(
                { 'version.txt': '4.7.2.stable', 'macos.zip': content },
                true,
            ),
        );
        const { zip, index } = await openTemplateRange(
            'https://example.test/a.tpz',
            new AbortController().signal,
        );
        const directory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'template-deflate-'),
        );
        directories.push(directory);
        let received = 0;
        try {
            await extractTemplateRange(
                zip,
                index.entries[1],
                directory,
                'macos.zip',
                new AbortController().signal,
                (bytes) => {
                    received += bytes;
                },
            );
            expect(
                await fs.readFile(path.join(directory, 'macos.zip'), 'utf8'),
            ).toBe(content);
            expect(received).toBe(index.entries[1].compressedSize);
            expect(received).toBeLessThan(content.length);
        } finally {
            zip.close();
        }
    });
    it('refuses a server that ignores Range instead of accepting a full download', async () => {
        serve(storedZip({ 'version.txt': '4.7.2.stable' }), 200);
        await expect(
            openTemplateRange(
                'https://example.test/a.tpz',
                new AbortController().signal,
            ),
        ).rejects.toThrow('errors.range');
    });
    it('rejects traversal paths while indexing', async () => {
        serve(
            storedZip({ 'version.txt': '4.7.2.stable', '../escaped': 'bad' }),
        );
        await expect(
            openTemplateRange(
                'https://example.test/a.tpz',
                new AbortController().signal,
            ),
        ).rejects.toThrow();
    });
    it('rejects a damaged selected file before it can be committed', async () => {
        const archive = storedZip({ 'version.txt': '4.7.2.stable' });
        archive[30 + 'version.txt'.length] ^= 1;
        serve(archive);
        const { zip, index } = await openTemplateRange(
            'https://example.test/a.tpz',
            new AbortController().signal,
        );
        const directory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'template-crc-'),
        );
        directories.push(directory);
        try {
            await expect(
                extractTemplateRange(
                    zip,
                    index.entries[0],
                    directory,
                    'version.txt',
                    new AbortController().signal,
                    vi.fn(),
                ),
            ).rejects.toThrow('errors.archive');
        } finally {
            zip.close();
        }
    });
    it('honours cancellation before requesting an archive range', async () => {
        serve(storedZip({ 'version.txt': '4.7.2.stable' }));
        const controller = new AbortController();
        controller.abort();
        await expect(
            openTemplateRange('https://example.test/a.tpz', controller.signal),
        ).rejects.toThrow();
    });
});

/** Builds a small ZIP with regular files for archive and transaction scenarios.
 * @param files - Archive paths and UTF-8 contents.
 * @param compressed - Whether to exercise deflate payloads.
 */
function storedZip(files: Record<string, string>, compressed = false): Buffer {
    const localRecords: Buffer[] = [];
    const centralRecords: Buffer[] = [];
    let offset = 0;
    for (const [filename, text] of Object.entries(files)) {
        const name = Buffer.from(filename);
        const data = Buffer.from(text);
        const checksum = crc32(data);
        const payload = compressed ? deflateRawSync(data) : data;
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50);
        local.writeUInt16LE(20, 4);
        local.writeUInt32LE(checksum, 14);
        local.writeUInt16LE(compressed ? 8 : 0, 8);
        local.writeUInt32LE(payload.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        localRecords.push(Buffer.concat([local, name, payload]));
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50);
        central.writeUInt16LE(0x0314, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt32LE(checksum, 16);
        central.writeUInt16LE(compressed ? 8 : 0, 10);
        central.writeUInt32LE(payload.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
        central.writeUInt32LE(offset, 42);
        centralRecords.push(Buffer.concat([central, name]));
        offset += local.length + name.length + payload.length;
    }
    const directory = Buffer.concat(centralRecords);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(centralRecords.length, 8);
    end.writeUInt16LE(centralRecords.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...localRecords, directory, end]);
}
