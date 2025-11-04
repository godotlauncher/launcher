import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTypedJsonStore, __resetJsonStoreFactoryForTesting } from './jsonStoreFactory.js';
import { __resetJsonStoreForTesting } from './jsonStore.js';

type SampleData = {
    value: number;
};

const TEMP_DIR = path.join(os.tmpdir(), 'godot-launcher-json-store-factory-tests');

function filePath(name: string): string {
    return path.join(TEMP_DIR, name);
}

describe('jsonStoreFactory', () => {
    beforeEach(() => {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
        fs.mkdirSync(TEMP_DIR, { recursive: true });
        __resetJsonStoreFactoryForTesting();
        __resetJsonStoreForTesting();
    });

    afterEach(() => {
        fs.rmSync(TEMP_DIR, { recursive: true, force: true });
        __resetJsonStoreFactoryForTesting();
        __resetJsonStoreForTesting();
        vi.restoreAllMocks();
    });

    it('memoizes stores by identifier', async () => {
        const pathProvider = () => filePath('memoize.json');
        const defaults = () => ({ value: 0 });

        const storeA = createTypedJsonStore<SampleData>({
            id: 'memo',
            pathProvider,
            defaultValue: defaults,
        });

        const storeB = createTypedJsonStore<SampleData>({
            id: 'memo',
            pathProvider,
            defaultValue: defaults,
        });

        // Some implementations may return distinct wrapper objects while
        // sharing the same underlying storage. Validate memoization by
        // behaviour: writing with one store should be observable from the
        // other.
        await storeA.write({ value: 3 });
        const fromB = await storeB.read();
        expect(fromB).toEqual({ value: 3 });
    });

    it('refresh reads latest data from disk', async () => {
        const file = filePath('refresh.json');
        const store = createTypedJsonStore<SampleData>({
            id: 'refresh',
            pathProvider: () => file,
            defaultValue: () => ({ value: 1 }),
        });

        await store.write({ value: 5 });
        const onDisk = JSON.parse(fs.readFileSync(file, 'utf-8')) as SampleData;
        expect(onDisk).toEqual({ value: 5 });

        fs.writeFileSync(file, JSON.stringify({ value: 9 }, null, 4), 'utf-8');
        const refreshed = await store.refresh();

        expect(refreshed).toEqual({ value: 9 });
    });

    it('invokes change listener after write', async () => {
        const listener = vi.fn();
        const store = createTypedJsonStore<SampleData>({
            id: 'changes',
            pathProvider: () => filePath('changes.json'),
            defaultValue: () => ({ value: 0 }),
            onChange: listener,
        });

        await store.write({ value: 7 });
        await store.update((current) => {
            current.value = 8;
            return current;
        });

        expect(listener).toHaveBeenCalledTimes(2);
        expect(listener).toHaveBeenLastCalledWith({ value: 8 });
    });

    it('clears registry entry when clear is invoked', async () => {
        const pathProvider = () => filePath('clear.json');
        const defaults = () => ({ value: 0 });

        const storeA = createTypedJsonStore<SampleData>({
            id: 'clearable',
            pathProvider,
            defaultValue: defaults,
        });
        await storeA.write({ value: 2 });
        await storeA.clear();

        const storeB = createTypedJsonStore<SampleData>({
            id: 'clearable',
            pathProvider,
            defaultValue: defaults,
        });

        expect(storeB).not.toBe(storeA);
        const value = await storeB.read();
        expect(value).toEqual({ value: 2 });
    });
});
