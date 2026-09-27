import * as fs from 'node:fs';
import * as path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { crc32 } from 'node:zlib';
import { type Entry, open, type ZipFile } from 'yauzl';
import { isPortablePathSegment } from '../utils/portable-path.util.js';
import { ArchiveError } from './archive.error.js';
import type { CheckedZipOptions, ZipManifest } from './archives.types.js';

/** Resolves a portable archive entry below the extraction directory.
 * @param root - Extraction directory.
 * @param relative - ZIP entry path with no trailing slash.
 */
function archiveChild(root: string, relative: string): string {
    if (!relative.split('/').every(isPortablePathSegment))
        throw new ArchiveError('unsafe');
    return path.join(root, ...relative.split('/'));
}

/** Opens an archive without automatic traversal or whole-file buffering.
 * @param filename - Local archive.
 */
function openArchive(filename: string): Promise<ZipFile> {
    return new Promise((resolve, reject) =>
        open(
            filename,
            { lazyEntries: true, autoClose: false, strictFileNames: true },
            (error, zip) => (error ? reject(error) : resolve(zip)),
        ),
    );
}
/** Gets the next ZIP directory entry.
 * @param zip - Open lazy archive.
 */
function nextEntry(zip: ZipFile): Promise<Entry | null> {
    return new Promise((resolve, reject) => {
        const clean = () => {
            zip.off('entry', entry);
            zip.off('end', end);
            zip.off('error', error);
        };
        const entry = (value: Entry) => {
            clean();
            resolve(value);
        };
        const end = () => {
            clean();
            resolve(null);
        };
        const error = (value: Error) => {
            clean();
            reject(value);
        };
        zip.once('entry', entry);
        zip.once('end', end);
        zip.once('error', error);
        zip.readEntry();
    });
}
/** Checks an entry before any archive content is written.
 * @param entry - ZIP directory entry.
 * @param destination - Contained extraction directory.
 */
export function validateZipEntry(
    entry: Pick<
        Entry,
        | 'fileName'
        | 'externalFileAttributes'
        | 'generalPurposeBitFlag'
        | 'uncompressedSize'
    >,
    destination: string,
): string {
    const name = entry.fileName.replace(/\/$/, '');
    archiveChild(destination, name);
    const kind = (entry.externalFileAttributes >>> 16) & 0o170000;
    if (
        (kind && kind !== 0o100000 && kind !== 0o040000) ||
        entry.generalPurposeBitFlag & 1 ||
        !Number.isSafeInteger(entry.uncompressedSize) ||
        entry.uncompressedSize < 0
    )
        throw new ArchiveError('unsafe');
    return name;
}
/** Extracts checked regular files into a new directory, leaving cleanup to the caller.
 * @param archive - Caller-owned local ZIP archive.
 * @param destination - Absolute path to a directory that does not yet exist.
 * @param options - Cancellation and feature-specific preflight validation.
 */
export async function extractCheckedZip(
    archive: string,
    destination: string,
    options: CheckedZipOptions,
): Promise<ZipManifest> {
    const { signal } = options;
    signal.throwIfAborted();
    if (!path.isAbsolute(archive) || !path.isAbsolute(destination))
        throw new ArchiveError('unsafe');
    const source = await fs.promises.lstat(archive);
    if (!source.isFile() || source.isSymbolicLink())
        throw new ArchiveError('unsafe');
    const zip = await openArchive(archive);
    // Keep a permanent error observer while a file stream is being consumed.
    let archiveError: Error | undefined;
    zip.on('error', (error) => {
        archiveError = error;
    });
    const entries: Entry[] = [];
    const names = new Set<string>();
    let bytes = 0;
    try {
        for (
            let entry = await nextEntry(zip);
            entry;
            entry = await nextEntry(zip)
        ) {
            signal.throwIfAborted();
            const name = validateZipEntry(entry, destination);
            const folded = name.normalize('NFC').toLowerCase();
            if (names.has(folded) || entries.length >= 100_000)
                throw new ArchiveError('unsafe');
            names.add(folded);
            entries.push(entry);
            bytes += entry.uncompressedSize;
            if (!Number.isSafeInteger(bytes)) throw new ArchiveError('unsafe');
        }
        const manifest: ZipManifest = {
            entries: entries.map((entry) => ({
                path: entry.fileName.replace(/\/$/, ''),
                kind: entry.fileName.endsWith('/') ? 'directory' : 'file',
                sizeBytes: entry.uncompressedSize,
            })),
            uncompressedBytes: bytes,
        };
        options.validateEntries(manifest);
        const capacity = await fs.promises.statfs(path.dirname(destination));
        if (capacity.bavail * capacity.bsize < bytes + 16 * 1024 * 1024)
            throw new ArchiveError('space');
        signal.throwIfAborted();
        await fs.promises.mkdir(destination);
        let completedBytes = 0;
        options.onProgress?.(0, bytes);
        for (const entry of entries) {
            signal.throwIfAborted();
            const target = archiveChild(
                destination,
                entry.fileName.replace(/\/$/, ''),
            );
            if (entry.fileName.endsWith('/')) {
                await fs.promises.mkdir(target, { recursive: true });
                continue;
            }
            await fs.promises.mkdir(path.dirname(target), { recursive: true });
            const input = await new Promise<fs.ReadStream>((resolve, reject) =>
                zip.openReadStream(entry, (error, stream) =>
                    error ? reject(error) : resolve(stream as fs.ReadStream),
                ),
            );
            let received = 0;
            let checksum = 0;
            const verify = new Transform({
                transform(chunk: Buffer, _encoding, callback) {
                    received += chunk.length;
                    checksum = crc32(chunk, checksum);
                    completedBytes += chunk.length;
                    options.onProgress?.(completedBytes, bytes);
                    callback(
                        received > entry.uncompressedSize
                            ? new ArchiveError('unsafe')
                            : null,
                        chunk,
                    );
                },
            });
            await pipeline(
                input,
                verify,
                fs.createWriteStream(target, {
                    flags: 'wx',
                    mode:
                        (entry.externalFileAttributes >>> 16) & 0o777 || 0o644,
                }),
                { signal },
            );
            if (
                received !== entry.uncompressedSize ||
                checksum !== entry.crc32 ||
                archiveError
            )
                throw new ArchiveError('corrupt');
        }
        signal.throwIfAborted();
        return manifest;
    } finally {
        zip.close();
    }
}
