import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AtomicJsonFileAdapter } from '../json-store/atomic-json-file.adapter.js';
import { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import { EditorCatalogStore } from './editor-catalog.store.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
    await Promise.all(
        temporaryDirectories
            .splice(0)
            .map((directory) =>
                fs.rm(directory, { recursive: true, force: true }),
            ),
    );
});

describe('EditorCatalogStore', () => {
    it('persists an empty catalog when the file is missing', async () => {
        const directory = await createTemporaryDirectory();
        const catalogPath = path.join(directory, 'editor-catalog.json');
        const store = createStore(catalogPath);

        const catalog = await store.read();

        expect(catalog.schemaVersion).toBe(1);
        await expect(fs.readFile(catalogPath, 'utf-8')).resolves.toContain(
            '"schemaVersion": 1',
        );
    });

    it('rejects malformed new catalog data', async () => {
        const directory = await createTemporaryDirectory();
        const catalogPath = path.join(directory, 'editor-catalog.json');
        await fs.writeFile(catalogPath, '{invalid', 'utf-8');
        const store = createStore(catalogPath);

        await expect(store.read()).rejects.toThrow();
    });
});

function createStore(catalogPath: string): EditorCatalogStore {
    const coordinator = new JsonStoreCoordinatorService(
        new AtomicJsonFileAdapter(),
    );
    return new EditorCatalogStore(coordinator, {
        directory: path.dirname(catalogPath),
        fileName: path.basename(catalogPath),
    });
}

async function createTemporaryDirectory(): Promise<string> {
    const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'launcher-editor-catalog-'),
    );
    temporaryDirectories.push(directory);
    return directory;
}
