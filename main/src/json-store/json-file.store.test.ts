import { describe, expect, it } from 'vitest';
import type { AtomicJsonFileAdapter } from './atomic-json-file.adapter.js';
import { JsonFileStore } from './json-file.store.js';
import { JsonStoreCoordinatorService } from './json-store-coordinator.service.js';

interface CatalogState {
    releases: string[];
}

class TestCatalogStore extends JsonFileStore<CatalogState> {
    constructor(coordinator: JsonStoreCoordinatorService) {
        super(coordinator, {
            pathProvider: () => '/virtual/editor-catalog.json',
            defaultValue: () => ({ releases: [] }),
        });
    }

    async list(): Promise<string[]> {
        return (await this.readValue()).value.releases;
    }

    async add(release: string): Promise<void> {
        await this.updateValue((catalog) => ({
            releases: [...catalog.releases, release],
        }));
    }
}

describe('JsonFileStore', () => {
    it('lets a feature store expose only domain operations', async () => {
        let contents: string | undefined;
        const adapter = {
            read: async () => contents,
            write: async (_path: string, nextContents: string) => {
                contents = nextContents;
            },
        } as AtomicJsonFileAdapter;
        const coordinator = new JsonStoreCoordinatorService(adapter);
        const store = new TestCatalogStore(coordinator);

        await store.add('4.5.0');

        await expect(store.list()).resolves.toEqual(['4.5.0']);
        expect(JSON.parse(contents ?? '')).toEqual({ releases: ['4.5.0'] });
    });
});
