import { Module } from '@mariodebono/di';
import { AtomicJsonFileAdapter } from './atomic-json-file.adapter.js';
import {
    atomicJsonFileAdapter,
    jsonStoreCoordinator,
} from './json-store.runtime.js';
import { JsonStoreCoordinatorService } from './json-store-coordinator.service.js';

/** Provides JSON file coordination to feature modules that import it. */
@Module({
    providers: [
        { provide: AtomicJsonFileAdapter, useValue: atomicJsonFileAdapter },
        {
            provide: JsonStoreCoordinatorService,
            useValue: jsonStoreCoordinator,
        },
    ],
    exports: [JsonStoreCoordinatorService],
})
export class JsonStoreModule {}
