import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    __resetJsonStoreForTesting,
    createJsonStore,
    JsonStoreConflictError,
} from './jsonStore.js';

const TEMP_DIR = path.resolve(os.tmpdir(), 'godot-launcher-json-store-tests');

function createTempFile(name: string): string {
    return path.resolve(TEMP_DIR, name);
}

describe('jsonStore', () => {
    beforeEach(() => {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
        fs.mkdirSync(TEMP_DIR, { recursive: true });
        __resetJsonStoreForTesting();
    });

    afterEach(() => {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
        __resetJsonStoreForTesting();
        vi.restoreAllMocks();
    });

    it('returns default value when file does not exist', async () => {
        const filePath = createTempFile('missing.json');
        const store = createJsonStore<{ count: number }>({
            pathProvider: () => filePath,
            defaultValue: () => ({ count: 42 }),
        });

        const snapshot = await store.read();
        expect(snapshot.value).toEqual({ count: 42 });
        expect(fs.existsSync(filePath)).toBe(false);
    });

    it('writes and reads values safely', async () => {
        const filePath = createTempFile('default.json');
        const store = createJsonStore<{ items: number[] }>({
            pathProvider: () => filePath,
            defaultValue: () => ({ items: [] }),
        });

        await store.write({ items: [1, 2, 3] });
        expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual({
            items: [1, 2, 3],
        });

        const snapshot = await store.read();
        expect(snapshot.value).toEqual({ items: [1, 2, 3] });
    });

    it('skips disk write when content hash is unchanged', async () => {
        const filePath = createTempFile('dedupe.json');
        const store = createJsonStore<{ flag: boolean }>({
            pathProvider: () => filePath,
            defaultValue: () => ({ flag: false }),
        });

        const writeSpy = vi.spyOn(fs.promises, 'writeFile');

        await store.write({ flag: true });
        await store.write({ flag: true });

        expect(writeSpy).toHaveBeenCalledTimes(1);
        expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual({
            flag: true,
        });
    });

    it('serialises concurrent updates', async () => {
        const filePath = createTempFile('concurrent.json');
        const store = createJsonStore<number[]>({
            pathProvider: () => filePath,
            defaultValue: () => [],
        });

        await Promise.all([
            store.update(async (current) => {
                current.push(1);
                // simulate async work so the second update would win without queuing
                await new Promise((resolve) => setTimeout(resolve, 5));
                return current;
            }),
            store.update((current) => {
                current.push(2);
                return current;
            }),
        ]);

        const snapshot = await store.read();
        expect(snapshot.value).toEqual([1, 2]);
    });

    it('detects write conflicts when expected version is stale', async () => {
        const filePath = createTempFile('conflict-write.json');
        const store = createJsonStore<{ count: number }>({
            pathProvider: () => filePath,
            defaultValue: () => ({ count: 0 }),
        });

        const snapshot = await store.write({ count: 1 });
        await store.write({ count: 2 });

        await expect(
            store.write({ count: 3 }, { expectedVersion: snapshot.version }),
        ).rejects.toBeInstanceOf(JsonStoreConflictError);
    });

    it('detects update conflicts when expected version is stale', async () => {
        const filePath = createTempFile('conflict-update.json');
        const store = createJsonStore<{ count: number }>({
            pathProvider: () => filePath,
            defaultValue: () => ({ count: 0 }),
        });

        const snapshot = await store.write({ count: 1 });
        await store.write({ count: 2 });

        await expect(
            store.update(
                (current) => {
                    current.count = 5;
                    return current;
                },
                { expectedVersion: snapshot.version },
            ),
        ).rejects.toBeInstanceOf(JsonStoreConflictError);
    });

    it('recovers using onParseError when file is corrupted', async () => {
        const filePath = createTempFile('corrupted.json');
        fs.writeFileSync(filePath, '{invalid json', 'utf-8');

        const store = createJsonStore<{ recovered: boolean }>({
            pathProvider: () => filePath,
            defaultValue: () => ({ recovered: false }),
            onParseError: () => ({ recovered: true }),
        });

        const snapshot = await store.read();
        expect(snapshot.value).toEqual({ recovered: true });
    });
});
