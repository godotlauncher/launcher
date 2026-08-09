import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AtomicJsonFileAdapter } from './atomic-json-file.adapter.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
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
});

async function createTemporaryDirectory(): Promise<string> {
    const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'launcher-json-store-'),
    );
    temporaryDirectories.push(directory);
    return directory;
}
