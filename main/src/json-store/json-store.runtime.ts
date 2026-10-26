import { AtomicJsonFileAdapter } from './atomic-json-file.adapter.js';
import { JsonStoreCoordinatorService } from './json-store-coordinator.service.js';

/** Shared storage instances used by both function helpers and injected stores. */
export const atomicJsonFileAdapter = new AtomicJsonFileAdapter();
export const jsonStoreCoordinator = new JsonStoreCoordinatorService(
    atomicJsonFileAdapter,
);
