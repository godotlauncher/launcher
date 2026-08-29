import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AtomicJsonFileAdapter } from './atomic-json-file.adapter.js';
import { STALE_ATOMIC_JSON_TEMP_FILE_AGE_MS } from './atomic-json-file.constants.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
        temporaryDirectories.splice(0).map((directory) =>
            fs.rm(directory, {
                recursive: true,
                force: true,
            }),
        ),
    );
});

describe('AtomicJsonFileAdapter', () => {
    it('returns undefined when the file does not exist', async () => {
        const directory = await createTemporaryDirectory();
        const adapter = new AtomicJsonFileAdapter();

        await expect(
            adapter.read(path.join(directory, 'missing.json')),
        ).resolves.toBeUndefined();
    });

    it('creates parent directories and atomically replaces the file', async () => {
        const directory = await createTemporaryDirectory();
        const filePath = path.join(directory, 'nested', 'catalog.json');
        const adapter = new AtomicJsonFileAdapter();

        await adapter.write(filePath, '{"version":1}');
        await adapter.write(filePath, '{"version":2}');

        await expect(adapter.read(filePath)).resolves.toBe('{"version":2}');
        await expect(fs.readdir(path.dirname(filePath))).resolves.toEqual([
            'catalog.json',
        ]);
    });

    it('removes only stale temporary files for the requested target', async () => {
        const directory = await createTemporaryDirectory();
        const filePath = path.join(directory, 'catalog.json');
        const stalePath = path.join(
            directory,
            '.catalog.json.12345.11111111-1111-1111-1111-111111111111.tmp',
        );
        const freshPath = path.join(
            directory,
            '.catalog.json.12345.22222222-2222-2222-2222-222222222222.tmp',
        );
        const otherStorePath = path.join(
            directory,
            '.projects.json.12345.33333333-3333-3333-3333-333333333333.tmp',
        );
        const malformedPath = path.join(
            directory,
            '.catalog.json.not-an-atomic-write.tmp',
        );
        const unrelatedPath = path.join(directory, 'catalog.json.tmp');
        await Promise.all([
            fs.writeFile(filePath, '{"version":1}'),
            fs.writeFile(stalePath, 'stale'),
            fs.writeFile(freshPath, 'fresh'),
            fs.writeFile(otherStorePath, 'other'),
            fs.writeFile(malformedPath, 'malformed'),
            fs.writeFile(unrelatedPath, 'unrelated'),
        ]);
        const staleTime = new Date(
            Date.now() - STALE_ATOMIC_JSON_TEMP_FILE_AGE_MS - 1_000,
        );
        await fs.utimes(stalePath, staleTime, staleTime);

        const adapter = new AtomicJsonFileAdapter();
        await expect(adapter.read(filePath)).resolves.toBe('{"version":1}');

        const entries = await fs.readdir(directory);
        expect(entries.sort()).toEqual([
            '.catalog.json.12345.22222222-2222-2222-2222-222222222222.tmp',
            '.catalog.json.not-an-atomic-write.tmp',
            '.projects.json.12345.33333333-3333-3333-3333-333333333333.tmp',
            'catalog.json',
            'catalog.json.tmp',
        ]);
    });

    it('continues writing when stale cleanup fails', async () => {
        const directory = await createTemporaryDirectory();
        const filePath = path.join(directory, 'catalog.json');
        const stalePath = path.join(
            directory,
            '.catalog.json.12345.44444444-4444-4444-4444-444444444444.tmp',
        );
        await fs.writeFile(stalePath, 'stale');
        const staleTime = new Date(
            Date.now() - STALE_ATOMIC_JSON_TEMP_FILE_AGE_MS - 1_000,
        );
        await fs.utimes(stalePath, staleTime, staleTime);
        vi.spyOn(fs, 'unlink').mockRejectedValueOnce(
            new Error('Cleanup denied'),
        );

        const adapter = new AtomicJsonFileAdapter();
        await expect(
            adapter.write(filePath, '{"version":1}'),
        ).resolves.toBeUndefined();

        await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe(
            '{"version":1}',
        );
    });
});

async function createTemporaryDirectory(): Promise<string> {
    const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'launcher-json-store-'),
    );
    temporaryDirectories.push(directory);
    return directory;
}
