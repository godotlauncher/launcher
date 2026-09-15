import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PassThrough, Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { crc32, createInflateRaw } from 'node:zlib';
import {
    type Entry,
    fromRandomAccessReaderPromise,
    RandomAccessReader,
    type ZipFile,
} from 'yauzl';
import { validateZipEntry } from '../archives/checked-zip.adapter.js';
import { templateChild } from './template-files.util.js';

/** A validated remote package directory. */
export type TemplateRangeIndex = {
    url: string;
    size: number;
    validator: string;
    fingerprint: string;
    prefix: string;
    entries: Entry[];
};

/** Fetches official HTTPS assets with bounded redirects and cancellation.
 * @param url - Catalogue asset URL or HTTPS redirect.
 * @param init - Request options.
 */
async function request(url: string, init: RequestInit): Promise<Response> {
    for (let redirects = 0; redirects < 6; redirects++) {
        if (new URL(url).protocol !== 'https:')
            throw new Error('exportTemplates:errors.package');
        const response = await fetch(url, { ...init, redirect: 'manual' });
        if (![301, 302, 303, 307, 308].includes(response.status))
            return response;
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) break;
        url = new URL(location, url).href;
    }
    throw new Error('exportTemplates:errors.package');
}

/** Chooses the HTTP validator used to keep all ranges on one representation.
 * @param headers - Asset response headers.
 */
function representationValidator(headers: Headers): string | null {
    const etag = headers.get('etag');
    return etag && !etag.startsWith('W/') ? etag : headers.get('last-modified');
}

/** Gives the ZIP parser bounded HTTP ranges, caching small metadata blocks. */
class RangeReader extends RandomAccessReader {
    private blocks = new Map<number, Buffer>();
    /** Initialises a reader for one immutable archive representation.
     * @param index - Remote archive identity.
     * @param signal - Operation cancellation.
     */
    constructor(
        private readonly index: Pick<
            TemplateRangeIndex,
            'url' | 'size' | 'validator'
        >,
        private readonly signal: AbortSignal,
    ) {
        super();
    }

    /** Streams exactly the requested range; a server returning the whole TPZ is rejected.
     * @param start - First byte, inclusive.
     * @param end - Last byte, exclusive.
     */
    _readStreamForRange(start: number, end: number): Readable {
        const output = new PassThrough();
        void this.transfer(start, end, output).catch((error) =>
            output.destroy(error),
        );
        return output;
    }

    /** Serves metadata from bounded blocks and streams compressed payloads.
     * @param start - First byte.
     * @param end - Exclusive end.
     * @param output - ZIP parser's stream.
     */
    private async transfer(
        start: number,
        end: number,
        output: PassThrough,
    ): Promise<void> {
        this.signal.throwIfAborted();
        if (
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) ||
            start < 0 ||
            end > this.index.size ||
            start >= end
        )
            throw new Error('exportTemplates:errors.archive');
        const blockSize = 128 * 1024;
        const blockStart = Math.floor(start / blockSize) * blockSize;
        const small = end - start < 65536 && end <= blockStart + blockSize;
        const cached = this.blocks.get(blockStart);
        if (small && cached) {
            output.end(cached.subarray(start - blockStart, end - blockStart));
            return;
        }
        const from = small ? blockStart : start;
        const to = small
            ? Math.min(blockStart + blockSize, this.index.size)
            : end;
        const response = await request(this.index.url, {
            headers: {
                Range: `bytes=${from}-${to - 1}`,
                'If-Range': this.index.validator,
                'Accept-Encoding': 'identity',
            },
            signal: AbortSignal.any([
                this.signal,
                AbortSignal.timeout(30 * 60_000),
            ]),
        });
        if (
            response.status !== 206 ||
            response.headers.get('content-range') !==
                `bytes ${from}-${to - 1}/${this.index.size}` ||
            (response.headers.get('content-encoding') &&
                response.headers.get('content-encoding') !== 'identity') ||
            representationValidator(response.headers) !== this.index.validator
        ) {
            await response.body?.cancel();
            throw new Error('exportTemplates:errors.range');
        }
        if (!response.body) throw new Error('exportTemplates:errors.range');
        let bytes = 0;
        const chunks: Buffer[] = [];
        const verify = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
                bytes += chunk.length;
                callback(
                    bytes > to - from
                        ? new Error('exportTemplates:errors.archive')
                        : null,
                    chunk,
                );
            },
        });
        const stream = Readable.fromWeb(
            response.body as ReadableStream<Uint8Array>,
        );
        if (small) {
            const collect = new Transform({
                transform(chunk: Buffer, _encoding, callback) {
                    chunks.push(Buffer.from(chunk));
                    callback();
                },
            });
            await pipeline(stream, verify, collect, { signal: this.signal });
            if (bytes !== to - from)
                throw new Error('exportTemplates:errors.archive');
            const buffer = Buffer.concat(chunks);
            if (this.blocks.size >= 128)
                this.blocks.delete(this.blocks.keys().next().value ?? -1);
            this.blocks.set(blockStart, buffer);
            output.end(buffer.subarray(start - blockStart, end - blockStart));
        } else {
            await pipeline(stream, verify, output, { signal: this.signal });
            if (bytes !== to - from)
                throw new Error('exportTemplates:errors.archive');
        }
    }
}

/** Opens the remote ZIP directory without fetching the full archive.
 * @param url - Main-resolved official asset URL.
 * @param signal - Cancellation or indexing timeout.
 */
export async function openTemplateRange(
    url: string,
    signal: AbortSignal,
): Promise<{ index: TemplateRangeIndex; zip: ZipFile }> {
    const head = await request(url, {
        method: 'HEAD',
        headers: { 'Accept-Encoding': 'identity' },
        signal,
    });
    const size = Number(head.headers.get('content-length'));
    const validator = representationValidator(head.headers);
    if (!head.ok || !Number.isSafeInteger(size) || size < 22 || !validator)
        throw new Error('exportTemplates:errors.range');
    const reader = new RangeReader(
        { url: head.url || url, size, validator },
        signal,
    );
    const zip = await fromRandomAccessReaderPromise(reader, size, {
        lazyEntries: true,
        autoClose: false,
        strictFileNames: true,
    });
    zip.on('error', () => undefined);
    try {
        const entries: Entry[] = [];
        const names = new Set<string>();
        let total = 0;
        for await (const entry of zip.eachEntry()) {
            signal.throwIfAborted();
            const name = validateZipEntry(
                entry,
                path.resolve('/template-index'),
            );
            const folded = name.normalize('NFC').toLowerCase();
            total += entry.uncompressedSize;
            if (
                names.has(folded) ||
                names.size >= 100_000 ||
                total > 64 * 1024 ** 3 ||
                ![0, 8].includes(entry.compressionMethod)
            )
                throw new Error('exportTemplates:errors.unsafe');
            names.add(folded);
            if (
                !entry.fileName.endsWith('/') &&
                !entry.fileName.startsWith('__MACOSX/')
            )
                entries.push(entry);
        }
        const versions = entries.filter((entry) =>
            /(^|\/)version\.txt$/.test(entry.fileName),
        );
        if (versions.length !== 1 || versions[0].uncompressedSize > 1024)
            throw new Error('exportTemplates:errors.identity');
        const prefix = versions[0].fileName.slice(0, -'version.txt'.length);
        if (entries.some((entry) => !entry.fileName.startsWith(prefix)))
            throw new Error('exportTemplates:errors.unsafe');
        const fingerprint = createHash('sha256')
            .update(
                JSON.stringify([
                    size,
                    validator,
                    entries.map((e) => [
                        e.fileName,
                        e.crc32,
                        e.compressedSize,
                        e.uncompressedSize,
                        e.relativeOffsetOfLocalHeader,
                        e.externalFileAttributes,
                    ]),
                ]),
            )
            .digest('hex');
        return {
            zip,
            index: { url, size, validator, prefix, entries, fingerprint },
        };
    } catch (error) {
        zip.close();
        throw error;
    }
}

/** Downloads and verifies one selected file into the job's private staging folder.
 * @param zip - Open remote archive.
 * @param entry - Validated central-directory entry.
 * @param destination - Private staging directory.
 * @param relative - Validated path beneath that directory.
 * @param signal - Operation cancellation.
 * @param progress - Reports selected compressed payload bytes received.
 */
export async function extractTemplateRange(
    zip: ZipFile,
    entry: Entry,
    destination: string,
    relative: string,
    signal: AbortSignal,
    progress: (bytes: number) => void,
): Promise<void> {
    const target = templateChild(destination, relative);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const input = await zip.openReadStreamPromise(entry, {
        decodeFileData: false,
    });
    let compressedBytes = 0;
    const count = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            compressedBytes += chunk.length;
            progress(chunk.length);
            callback(
                compressedBytes > entry.compressedSize
                    ? new Error('exportTemplates:errors.archive')
                    : null,
                chunk,
            );
        },
        flush(callback) {
            callback(
                compressedBytes !== entry.compressedSize
                    ? new Error('exportTemplates:errors.archive')
                    : null,
            );
        },
    });
    let bytes = 0;
    let checksum = 0;
    const verify = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            bytes += chunk.length;
            checksum = crc32(chunk, checksum);
            callback(
                bytes > entry.uncompressedSize
                    ? new Error('exportTemplates:errors.archive')
                    : null,
                chunk,
            );
        },
        flush(callback) {
            callback(
                bytes !== entry.uncompressedSize || checksum !== entry.crc32
                    ? new Error('exportTemplates:errors.archive')
                    : null,
            );
        },
    });
    await pipeline(
        input,
        count,
        entry.compressionMethod === 8 ? createInflateRaw() : new PassThrough(),
        verify,
        fs.createWriteStream(target, {
            flags: 'wx',
            mode: (entry.externalFileAttributes >>> 16) & 0o777 || 0o644,
        }),
        { signal },
    );
}
