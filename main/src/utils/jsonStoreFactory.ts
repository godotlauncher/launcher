import logger from 'electron-log';
import { jsonStoreCoordinator } from '../json-store/json-store.runtime.js';
import type {
    JsonStoreDefinition,
    JsonStoreSnapshot,
    JsonStoreWriteOptions,
    MaybePromise,
} from '../json-store/json-store.types.js';

type ChangeListener<T> = (value: T) => MaybePromise<void>;

type StoreFactoryOptions<T> = Omit<JsonStoreDefinition<T>, 'onLoadError'> & {
    onParseError?: (error: unknown, raw: string) => MaybePromise<T>;
    id: string;
    schemaVersion?: number;
    onChange?: ChangeListener<T>;
    logLabel?: string;
};

export type TypedJsonStore<T> = {
    read(): Promise<T>;
    readSnapshot(): Promise<JsonStoreSnapshot<T>>;
    write(value: T, options?: JsonStoreWriteOptions): Promise<T>;
    update(
        mutator: (current: T) => MaybePromise<T>,
        options?: JsonStoreWriteOptions,
    ): Promise<T>;
    refresh(): Promise<T>;
    clear(): Promise<void>;
    getSchemaVersion(): number | undefined;
};

type InternalStore<T> = {
    definition: JsonStoreDefinition<T>;
    schemaVersion?: number;
    api: TypedJsonStore<T>;
};

const factoryRegistry = new Map<string, InternalStore<unknown>>();

/** Copies values before invoking a legacy change listener.
 * @param value - Stored value to copy.
 */
function cloneValue<T>(value: T): T {
    if (value === undefined || value === null) {
        return value;
    }

    return JSON.parse(JSON.stringify(value)) as T;
}

/** Notifies the existing optional listener after a successful operation.
 * @param options - Factory options containing the listener.
 * @param value - Persisted value to publish.
 */
async function emitChange<T>(
    options: StoreFactoryOptions<T>,
    value: T,
): Promise<void> {
    if (!options.onChange) {
        return;
    }

    try {
        await options.onChange(cloneValue(value));
    } catch (error) {
        const context = options.logLabel ? ` for ${options.logLabel}` : '';
        logger.warn(`Json store change listener failed${context}`, error);
    }
}

/** Adapts existing helper operations to the shared coordinator.
 * @param options - Store definition and legacy helper options.
 */
function registerStore<T>(options: StoreFactoryOptions<T>): InternalStore<T> {
    const definition: JsonStoreDefinition<T> = {
        pathProvider: options.pathProvider,
        defaultValue: options.defaultValue,
        parse: options.parse,
        serialize: options.serialize,
        normalize: options.normalize,
        onLoadError: async (error, raw) => {
            if (raw !== undefined && options.onParseError)
                return options.onParseError(error, raw);
            logger.error(
                `Failed to read JSON store for ${options.logLabel ?? options.id}`,
                error,
            );
            return options.defaultValue();
        },
    };

    const internal: InternalStore<T> = {
        definition,
        schemaVersion: options.schemaVersion,
        api: {} as TypedJsonStore<T>,
    };

    internal.api = {
        read: async () => {
            const snapshot = await jsonStoreCoordinator.read(definition);
            return snapshot.value;
        },

        readSnapshot: () => jsonStoreCoordinator.read(definition),

        write: async (
            value: T,
            writeOptions?: JsonStoreWriteOptions,
        ): Promise<T> => {
            const persisted = await jsonStoreCoordinator.write(
                definition,
                value,
                writeOptions,
            );
            await emitChange(options, persisted.value);
            return persisted.value;
        },

        update: async (
            mutator: (current: T) => MaybePromise<T>,
            writeOptions?: JsonStoreWriteOptions,
        ): Promise<T> => {
            const persisted = await jsonStoreCoordinator.update(
                definition,
                mutator,
                writeOptions,
            );
            await emitChange(options, persisted.value);
            return persisted.value;
        },

        refresh: async (): Promise<T> => {
            const snapshot = await jsonStoreCoordinator.refresh(definition);
            await emitChange(options, snapshot.value);
            return snapshot.value;
        },

        clear: async (): Promise<void> => {
            factoryRegistry.delete(options.id);
            await jsonStoreCoordinator.clearCache(definition);
        },

        getSchemaVersion: () => internal.schemaVersion,
    };

    factoryRegistry.set(options.id, internal as InternalStore<unknown>);
    return internal;
}

/** Returns a compatibility wrapper without owning file IO or a value cache.
 * @param options - Store definition and existing helper identity.
 */
export function createTypedJsonStore<T>(
    options: StoreFactoryOptions<T>,
): TypedJsonStore<T> {
    const existing = factoryRegistry.get(options.id) as
        | InternalStore<T>
        | undefined;
    const internal = existing ?? registerStore(options);
    return internal.api;
}

/** Clears registered helper caches after test operations have completed. */
export async function __resetJsonStoreFactoryForTesting(): Promise<void> {
    await Promise.all(
        [...factoryRegistry.values()].map(({ definition }) =>
            jsonStoreCoordinator.clearCache(definition),
        ),
    );
    factoryRegistry.clear();
}
