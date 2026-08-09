import type {
    JsonStoreDefinition,
    JsonStoreSnapshot,
    JsonStoreWriteOptions,
    MaybePromise,
} from './json-store.types.js';
import type { JsonStoreCoordinatorService } from './json-store-coordinator.service.js';

/** Base class for a feature-owned JSON store with domain-specific methods. */
export abstract class JsonFileStore<T> {
    /**
     * Registers the store definition without reading or writing the file.
     *
     * @param {JsonStoreCoordinatorService} coordinator The service that coordinates file operations.
     * @param {JsonStoreDefinition<T>} definition The rules for this store.
     */
    protected constructor(
        private readonly coordinator: JsonStoreCoordinatorService,
        private readonly definition: JsonStoreDefinition<T>,
    ) {}

    /**
     * Reads the current value and version.
     *
     * @returns A safe copy of the current value and version.
     */
    protected readValue(): Promise<JsonStoreSnapshot<T>> {
        return this.coordinator.read(this.definition);
    }

    /**
     * Replaces the complete value.
     *
     * @param value - The complete value to write.
     * @param options - Optional checks for the write.
     * @returns A safe copy of the persisted value and version.
     */
    protected replaceValue(
        value: T,
        options?: JsonStoreWriteOptions,
    ): Promise<JsonStoreSnapshot<T>> {
        return this.coordinator.write(this.definition, value, options);
    }

    /**
     * Updates the value in the shared per-path queue.
     *
     * @param mutator - A function that returns the next value.
     * @param options - Optional checks for the write.
     * @returns A safe copy of the persisted value and version.
     */
    protected updateValue(
        mutator: (current: T) => MaybePromise<T>,
        options?: JsonStoreWriteOptions,
    ): Promise<JsonStoreSnapshot<T>> {
        return this.coordinator.update(this.definition, mutator, options);
    }

    /**
     * Clears the cache and reads the file again.
     *
     * @returns A safe copy of the refreshed value and version.
     */
    protected refreshValue(): Promise<JsonStoreSnapshot<T>> {
        return this.coordinator.refresh(this.definition);
    }

    /**
     * Clears the cache without reading the file again.
     *
     * @returns A promise that resolves after the cache is cleared.
     */
    protected clearCachedValue(): Promise<void> {
        return this.coordinator.clearCache(this.definition);
    }
}
