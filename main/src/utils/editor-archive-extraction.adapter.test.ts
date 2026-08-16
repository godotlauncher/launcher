import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractEditorArchive } from './editor-archive-extraction.adapter.js';

const temporaryDirectories: string[] = [];

vi.mock('../i18n/index.js', () => ({
    t: (key: string) => key,
}));

describe('editor archive extraction adapter', () => {
    afterEach(async () => {
        await Promise.all(
            temporaryDirectories.splice(0).map((directory) =>
                fs.promises.rm(directory, {
                    recursive: true,
                    force: true,
                }),
            ),
        );
    });

    it('extracts a normal file inside a newly prepared destination', async () => {
        const root = await createTemporaryDirectory();
        const archivePath = path.join(root, 'editor.zip');
        const destinationPath = path.join(root, 'install');
        await fs.promises.writeFile(
            archivePath,
            createStoredZip([
                {
                    name: 'Godot',
                    contents: Buffer.from('editor'),
                    mode: 0o100755,
                },
            ]),
        );
        await fs.promises.mkdir(destinationPath);

        await extractEditorArchive(archivePath, destinationPath);

        await expect(
            fs.promises.readFile(path.join(destinationPath, 'Godot'), 'utf8'),
        ).resolves.toBe('editor');
    });

    it('rejects a symlink target that escapes the extraction destination', async () => {
        const root = await createTemporaryDirectory();
        const archivePath = path.join(root, 'malicious.zip');
        const destinationPath = path.join(root, 'install');
        const outsidePath = path.join(root, 'outside.txt');
        await fs.promises.writeFile(
            archivePath,
            createStoredZip([
                {
                    name: 'escape',
                    contents: Buffer.from('../outside.txt'),
                    mode: 0o120777,
                },
            ]),
        );
        await fs.promises.mkdir(destinationPath);

        await expect(
            extractEditorArchive(archivePath, destinationPath),
        ).rejects.toThrow('installEditor:errors.unsafeArchive');
        await expect(fs.promises.lstat(outsidePath)).rejects.toMatchObject({
            code: 'ENOENT',
        });
    });

    it('rejects a destination that already contains files', async () => {
        const root = await createTemporaryDirectory();
        const archivePath = path.join(root, 'editor.zip');
        const destinationPath = path.join(root, 'install');
        await fs.promises.writeFile(
            archivePath,
            createStoredZip([
                {
                    name: 'Godot',
                    contents: Buffer.from('editor'),
                    mode: 0o100755,
                },
            ]),
        );
        await fs.promises.mkdir(destinationPath);
        await fs.promises.writeFile(
            path.join(destinationPath, 'existing'),
            'existing',
        );

        await expect(
            extractEditorArchive(archivePath, destinationPath),
        ).rejects.toThrow('installEditor:errors.unsafeArchive');
    });
});

type ZipEntry = {
    name: string;
    contents: Buffer;
    mode: number;
};

/**
 * Creates a tracked temporary directory for one extraction test.
 *
 * @returns The absolute temporary directory path.
 */
async function createTemporaryDirectory(): Promise<string> {
    const directory = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'launcher-editor-extraction-'),
    );
    temporaryDirectories.push(directory);
    return directory;
}

/**
 * Builds a small uncompressed ZIP archive with Unix mode metadata.
 *
 * @param entries - Archive entries to encode.
 * @returns Complete ZIP bytes suitable for the real extraction adapter.
 */
function createStoredZip(entries: ZipEntry[]): Buffer {
    const localRecords: Buffer[] = [];
    const centralRecords: Buffer[] = [];
    let localOffset = 0;

    for (const entry of entries) {
        const name = Buffer.from(entry.name);
        const crc = calculateCrc32(entry.contents);
        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt32LE(crc, 14);
        localHeader.writeUInt32LE(entry.contents.length, 18);
        localHeader.writeUInt32LE(entry.contents.length, 22);
        localHeader.writeUInt16LE(name.length, 26);
        const localRecord = Buffer.concat([localHeader, name, entry.contents]);
        localRecords.push(localRecord);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(0x0314, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(entry.contents.length, 20);
        centralHeader.writeUInt32LE(entry.contents.length, 24);
        centralHeader.writeUInt16LE(name.length, 28);
        centralHeader.writeUInt32LE((entry.mode << 16) >>> 0, 38);
        centralHeader.writeUInt32LE(localOffset, 42);
        centralRecords.push(Buffer.concat([centralHeader, name]));
        localOffset += localRecord.length;
    }

    const centralDirectory = Buffer.concat(centralRecords);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(localOffset, 16);
    return Buffer.concat([...localRecords, centralDirectory, end]);
}

/**
 * Calculates the ZIP CRC-32 value for stored file contents.
 *
 * @param contents - Entry bytes to checksum.
 * @returns The unsigned CRC-32 value.
 */
function calculateCrc32(contents: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of contents) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
