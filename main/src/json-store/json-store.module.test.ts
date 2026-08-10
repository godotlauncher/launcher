import 'reflect-metadata';
import { createApplication, Injectable, Module } from '@mariodebono/di';
import { describe, expect, it } from 'vitest';
import { JsonStoreModule } from './json-store.module.js';
import { JsonStoreCoordinatorService } from './json-store-coordinator.service.js';

describe('JsonStoreModule', () => {
    it('exports its coordinator to an importing feature module', async () => {
        @Injectable()
        class TestCatalogStore {
            constructor(readonly coordinator: JsonStoreCoordinatorService) {}
        }

        @Module({
            imports: [JsonStoreModule],
            providers: [TestCatalogStore],
        })
        class TestCatalogModule {}

        const application = await createApplication(TestCatalogModule, {
            logger: false,
        });

        expect(application.get(TestCatalogStore).coordinator).toBeInstanceOf(
            JsonStoreCoordinatorService,
        );

        await application.destroyAsync();
    });
});
