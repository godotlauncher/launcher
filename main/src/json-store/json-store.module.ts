import { Module } from '@mariodebono/di';
import { AtomicJsonFileAdapter } from './atomic-json-file.adapter.js';
import { JsonStoreCoordinatorService } from './json-store-coordinator.service.js';

/** Provides JSON file coordination to feature modules that import it. */
@Module({
    providers: [AtomicJsonFileAdapter, JsonStoreCoordinatorService],
    exports: [JsonStoreCoordinatorService],
})
export class JsonStoreModule {}
