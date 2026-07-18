import * as fs from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { getResourcePathFromUidCache } from './godotUid.utils.js';

vi.mock('node:fs', () => ({
    readFileSync: vi.fn(),
}));

function createUidCache(uid: bigint, resourcePath: string): Buffer {
    const encodedPath = Buffer.from(resourcePath, 'utf-8');
    const cache = Buffer.alloc(16 + encodedPath.length);

    cache.writeUInt32LE(1, 0);
    cache.writeBigUInt64LE(uid, 4);
    cache.writeUInt32LE(encodedPath.length, 12);
    encodedPath.copy(cache, 16);

    return cache;
}

describe('getResourcePathFromUidCache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('resolves a Godot UID to its resource path', () => {
        const projectDir = path.resolve('project');
        vi.mocked(fs.readFileSync).mockReturnValue(
            createUidCache(0x195bad464325f9ebn, 'res://assets/icon.svg'),
        );

        expect(
            getResourcePathFromUidCache(projectDir, 'uid://1bepl44n1dr4'),
        ).toBe('res://assets/icon.svg');
        expect(fs.readFileSync).toHaveBeenCalledWith(
            path.resolve(projectDir, '.godot', 'uid_cache.bin'),
        );
    });

    test('rejects malformed UIDs without reading the cache', () => {
        expect(
            getResourcePathFromUidCache(
                path.resolve('project'),
                'uid://invalid-value',
            ),
        ).toBeUndefined();
        expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    test('returns undefined for missing or malformed caches', () => {
        vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
            throw new Error('missing');
        });

        expect(
            getResourcePathFromUidCache(
                path.resolve('project'),
                'uid://1bepl44n1dr4',
            ),
        ).toBeUndefined();

        vi.mocked(fs.readFileSync).mockReturnValueOnce(Buffer.alloc(3));

        expect(
            getResourcePathFromUidCache(
                path.resolve('project'),
                'uid://1bepl44n1dr4',
            ),
        ).toBeUndefined();
    });

    test('rejects cached paths outside the Godot resource scheme', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(
            createUidCache(0x195bad464325f9ebn, '../icon.svg'),
        );

        expect(
            getResourcePathFromUidCache(
                path.resolve('project'),
                'uid://1bepl44n1dr4',
            ),
        ).toBeUndefined();
    });
});
