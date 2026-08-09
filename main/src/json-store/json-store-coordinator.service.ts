import { createHash } from 'node:crypto';
import path from 'node:path';
import { Injectable } from '@mariodebono/di';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { AtomicJsonFileAdapter } from './atomic-json-file.adapter.js';
import type {
    JsonStoreDefinition,
    JsonStoreSnapshot,
    JsonStoreWriteOptions,
    MaybePromise,
} from './json-store.types.js';
import { JsonStoreConflictError } from './json-store.types.js';

interface CachedEntry {
    value: unknown;
    version: string;
    // A default or normalized value may not match the file on disk yet.
    needsPersistence: boolean;
}

/** Coordinates cached JSON file access inside one application process. */
@Injectable()
export class JsonStoreCoordinatorService {
    private readonly cache = new Map<string, CachedEntry>();
    private readonly operationQueues = new Map<string, Promise<void>>();

    /**
     * Creates the coordinator.
     *
     * @param fileAdapter - The adapter used for file reads and atomic writes.
     */
    constructor(private readonly fileAdapter: AtomicJsonFileAdapter) {}

    /**
     * Reads a store after any queued write for the same path finishes.
     *
     * @param definition - The rules for the store.
     * @returns A safe copy of the current value and version.
     */
    async read<T>(
        definition: JsonStoreDefinition<T>,
    ): Promise<JsonStoreSnapshot<T>> {
        const filePath = await this.resolvePath(definition);
        await this.waitForPendingOperation(filePath);
        return this.load(filePath, definition);
    }

    /**
     * Replaces a store value.
     *
     * @param definition - The rules for the store.
     * @param value - The complete value to write.
     * @param options - Optional checks for the write.
     * @returns A safe copy of the persisted value and version.
     */
    async write<T>(
        definition: JsonStoreDefinition<T>,
        value: T,
        options?: JsonStoreWriteOptions,
    ): Promise<JsonStoreSnapshot<T>> {
        const filePath = await this.resolvePath(definition);
        return this.enqueue(filePath, () =>
            this.persist(filePath, definition, value, options),
        );
    }

    /**
     * Updates a store value inside its per-path operation queue.
     *
     * @param definition - The rules for the store.
     * @param mutator - A function that returns the next value.
     * @param options - Optional checks for the write.
     * @returns A safe copy of the persisted value and version.
     */
    async update<T>(
        definition: JsonStoreDefinition<T>,
        mutator: (current: T) => MaybePromise<T>,
        options?: JsonStoreWriteOptions,
    ): Promise<JsonStoreSnapshot<T>> {
        const filePath = await this.resolvePath(definition);
        return this.enqueue(filePath, async () => {
            const current = await this.load(filePath, definition);
            const nextValue = await mutator(cloneJson(current.value));

            return this.persist(filePath, definition, nextValue, {
                expectedVersion: current.version,
                ...options,
            });
        });
    }

    /**
     * Drops the cached value and reads the file again.
     *
     * @param definition - The rules for the store.
     * @returns A safe copy of the refreshed value and version.
     */
    async refresh<T>(
        definition: JsonStoreDefinition<T>,
    ): Promise<JsonStoreSnapshot<T>> {
        const filePath = await this.resolvePath(definition);
        await this.waitForPendingOperation(filePath);
        this.cache.delete(filePath);
        return this.load(filePath, definition);
    }

    /**
     * Drops the cached value without reading the file again.
     *
     * @param definition - The rules for the store.
     * @returns A promise that resolves after the cache is cleared.
     */
    async clearCache<T>(definition: JsonStoreDefinition<T>): Promise<void> {
        const filePath = await this.resolvePath(definition);
        await this.waitForPendingOperation(filePath);
        this.cache.delete(filePath);
    }

    /**
     * Resolves and checks a store path.
     *
     * @param definition - The rules that provide the store path.
     * @returns The absolute store path.
     */
    private async resolvePath<T>(
        definition: JsonStoreDefinition<T>,
    ): Promise<string> {
        const filePath = await definition.pathProvider();
        if (!filePath.trim()) {
            throw new Error('JSON store pathProvider returned an empty path');
        }

        return path.resolve(filePath);
    }

    /**
     * Loads a value from the cache or file.
     *
     * @param filePath - The resolved store path.
     * @param definition - The rules used to parse and normalize the value.
     * @returns A safe copy of the loaded value and version.
     */
    private async load<T>(
        filePath: string,
        definition: JsonStoreDefinition<T>,
    ): Promise<JsonStoreSnapshot<T>> {
        const cached = this.cache.get(filePath);
        if (cached) {
            return snapshot<T>(cached);
        }

        const raw = await this.fileAdapter.read(filePath);
        const parsed =
            raw === undefined
                ? await definition.defaultValue()
                : await (definition.parse ?? defaultParse<T>)(raw);
        const normalized = await this.normalize(definition, parsed);
        const entry = createEntry(
            normalized,
            raw === undefined || versionOf(parsed) !== versionOf(normalized),
        );
        this.cache.set(filePath, entry);
        return snapshot<T>(entry);
    }

    /**
     * Normalizes and writes a complete value.
     *
     * @param filePath - The resolved store path.
     * @param definition - The rules used to normalize and serialize the value.
     * @param value - The complete value to write.
     * @param options - Optional checks for the write.
     * @returns A safe copy of the persisted value and version.
     */
    private async persist<T>(
        filePath: string,
        definition: JsonStoreDefinition<T>,
        value: T,
        options?: JsonStoreWriteOptions,
    ): Promise<JsonStoreSnapshot<T>> {
        const normalized = await this.normalize(definition, value);
        const nextEntry = createEntry(normalized, false);
        const current = this.cache.get(filePath);

        if (
            options?.expectedVersion !== undefined &&
            current?.version !== options.expectedVersion
        ) {
            throw new JsonStoreConflictError(filePath);
        }

        if (
            current?.version === nextEntry.version &&
            !current.needsPersistence
        ) {
            return snapshot<T>(current);
        }

        const serialize = definition.serialize ?? defaultSerialize<T>;
        const contents = await serialize(cloneJson(normalized));
        await this.fileAdapter.write(filePath, contents);
        // Only publish the new cache entry after the file replacement succeeds.
        this.cache.set(filePath, nextEntry);
        return snapshot<T>(nextEntry);
    }

    /**
     * Clones and normalizes a value.
     *
     * @param definition - The rules that may normalize the value.
     * @param value - The value to normalize.
     * @returns A safe copy of the normalized value.
     */
    private async normalize<T>(
        definition: JsonStoreDefinition<T>,
        value: T,
    ): Promise<T> {
        const candidate = cloneJson(value);
        const normalized = definition.normalize
            ? await definition.normalize(candidate)
            : candidate;
        return cloneJson(normalized);
    }

    /**
     * Waits for the current operation on one path.
     *
     * @param filePath - The resolved store path.
     * @returns A promise that resolves when the current operation ends.
     */
    private async waitForPendingOperation(filePath: string): Promise<void> {
        await this.operationQueues.get(filePath);
    }

    /**
     * Adds an operation to the queue for one path.
     *
     * @param filePath - The resolved store path.
     * @param operation - The operation to run after earlier work finishes.
     * @returns The result of the queued operation.
     */
    private enqueue<T>(
        filePath: string,
        operation: () => Promise<T>,
    ): Promise<T> {
        const previous =
            this.operationQueues.get(filePath) ?? Promise.resolve();
        // A failed operation must not prevent the next queued operation.
        const result = previous.catch(() => undefined).then(operation);
        const queued = result
            .then(() => undefined)
            .catch(() => undefined)
            .finally(() => {
                if (this.operationQueues.get(filePath) === queued) {
                    this.operationQueues.delete(filePath);
                }
            });

        this.operationQueues.set(filePath, queued);
        return result;
    }
}

/**
 * Parses standard JSON text.
 *
 * @param raw - The JSON text to parse.
 * @returns The parsed value.
 */
function defaultParse<T>(raw: string): T {
    return JSON.parse(raw) as T;
}

/**
 * Formats a value as standard JSON text.
 *
 * @param value - The value to format.
 * @returns Formatted JSON text.
 */
function defaultSerialize<T>(value: T): string {
    return JSON.stringify(value, null, 4);
}

/**
 * Creates a JSON-safe copy of a value.
 *
 * @param value - The value to copy.
 * @returns A copy that does not share nested objects with the input.
 */
function cloneJson<T>(value: T): T {
    if (value === undefined || value === null) {
        return value;
    }

    return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Creates a stable version for one JSON value.
 *
 * @param value - The value to hash.
 * @returns A SHA-256 version string.
 */
function versionOf<T>(value: T): string {
    return createHash('sha256')
        .update(JSON.stringify(cloneJson(value)))
        .digest('hex');
}

/**
 * Creates an internal cache entry.
 *
 * @param value - The value to cache.
 * @param needsPersistence - Whether the value still needs to be written.
 * @returns The new cache entry.
 */
function createEntry<T>(value: T, needsPersistence: boolean): CachedEntry {
    const cachedValue = cloneJson(value);
    return {
        value: cachedValue,
        version: versionOf(cachedValue),
        needsPersistence,
    };
}

/**
 * Creates a safe public snapshot from a cache entry.
 *
 * @param entry - The internal cache entry.
 * @returns A safe copy of the value and version.
 */
function snapshot<T>(entry: CachedEntry): JsonStoreSnapshot<T> {
    return {
        value: cloneJson(entry.value as T),
        version: entry.version,
    };
}
