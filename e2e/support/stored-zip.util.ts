import { crc32 } from 'node:zlib';

/** Builds a small ZIP of regular files for Electron fixture scenarios.
 * @param files - Archive paths mapped to their UTF-8 contents.
 */
export function storedZip(files: Record<string, string>): Buffer {
    const localRecords: Buffer[] = [];
    const centralRecords: Buffer[] = [];
    let offset = 0;
    for (const [filename, text] of Object.entries(files)) {
        const name = Buffer.from(filename);
        const data = Buffer.from(text);
        const checksum = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50);
        local.writeUInt16LE(20, 4);
        local.writeUInt32LE(checksum, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        localRecords.push(Buffer.concat([local, name, data]));
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50);
        central.writeUInt16LE(0x0314, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt32LE(checksum, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
        central.writeUInt32LE(offset, 42);
        centralRecords.push(Buffer.concat([central, name]));
        offset += local.length + name.length + data.length;
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
