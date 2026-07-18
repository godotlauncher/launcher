import * as fs from 'node:fs';
import * as path from 'node:path';

const GODOT_UID_BASE = 34n;
const GODOT_UID_DIGIT_OFFSET = 25;
const GODOT_UID_MASK = 0x7fffffffffffffffn;
const CACHE_HEADER_SIZE = 4;
const CACHE_ENTRY_HEADER_SIZE = 12;

/**
 * Implements the ResourceUID encoding and uid_cache.bin layout used by Godot.
 *
 * Official source:
 * https://github.com/godotengine/godot/blob/4.6/core/io/resource_uid.cpp
 * https://github.com/godotengine/godot/blob/master/core/io/resource_uid.cpp
 *
 * See text_to_id(), load_from_cache(), and get_path_from_cache(). The cache
 * starts with a little-endian u32 entry count. Each entry contains a
 * little-endian u64 UID, a u32 UTF-8 path length, and the path bytes.
 */
function decodeGodotUid(uid: string): bigint | undefined {
    if (!uid.startsWith('uid://')) {
        return undefined;
    }

    const encodedUid = uid.slice('uid://'.length);
    if (!/^[a-z0-9]+$/.test(encodedUid)) {
        return undefined;
    }

    let decodedUid = 0n;
    for (const character of encodedUid) {
        const characterCode = character.charCodeAt(0);
        const characterValue =
            character >= 'a'
                ? characterCode - 'a'.charCodeAt(0)
                : characterCode - '0'.charCodeAt(0) + GODOT_UID_DIGIT_OFFSET;

        decodedUid = decodedUid * GODOT_UID_BASE + BigInt(characterValue);
    }

    return decodedUid & GODOT_UID_MASK;
}

export function getResourcePathFromUidCache(
    projectDir: string,
    uid: string,
): string | undefined {
    const decodedUid = decodeGodotUid(uid);
    if (decodedUid === undefined) {
        return undefined;
    }

    try {
        const cache = fs.readFileSync(
            path.resolve(projectDir, '.godot', 'uid_cache.bin'),
        );
        if (cache.length < CACHE_HEADER_SIZE) {
            return undefined;
        }

        const entryCount = cache.readUInt32LE(0);
        let offset = CACHE_HEADER_SIZE;

        for (let index = 0; index < entryCount; index++) {
            if (offset + CACHE_ENTRY_HEADER_SIZE > cache.length) {
                return undefined;
            }

            const entryUid = cache.readBigUInt64LE(offset);
            const pathLength = cache.readUInt32LE(offset + 8);
            const pathStart = offset + CACHE_ENTRY_HEADER_SIZE;
            const pathEnd = pathStart + pathLength;

            if (pathEnd > cache.length) {
                return undefined;
            }

            if (entryUid === decodedUid) {
                const resourcePath = cache.toString(
                    'utf-8',
                    pathStart,
                    pathEnd,
                );
                return resourcePath.startsWith('res://')
                    ? resourcePath
                    : undefined;
            }

            offset = pathEnd;
        }
    } catch {
        return undefined;
    }

    return undefined;
}
