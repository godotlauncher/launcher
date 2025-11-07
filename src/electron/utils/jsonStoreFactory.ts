import logger from 'electron-log';

import { createJsonStore, type JsonStore, type JsonStoreOptions, type JsonStoreSnapshot, type JsonStoreWriteOptions, type MaybePromise } from './jsonStore.js';

type ChangeListener<T> = (value: T) => MaybePromise<void>;

type StoreFactoryOptions<T> = JsonStoreOptions<T> & {
    id: string;
    schemaVersion?: number;
    onChange?: ChangeListener<T>;
    logLabel?: string;
};

export type TypedJsonStore<T> = {
    read(): Promise<T>;
    readSnapshot(): Promise<JsonStoreSnapshot<T>>;
    write(value: T, options?: JsonStoreWriteOptions): Promise<T>;
    update(mutator: (current: T) => MaybePromise<T>, options?: JsonStoreWriteOptions): Promise<T>;
    refresh(): Promise<T>;
    clear(): Promise<void>;
    getSchemaVersion(): number | undefined;
};

type InternalStore<T> = {
    store: JsonStore<T>;
    options: StoreFactoryOptions<T>;
    schemaVersion?: number;
    api: TypedJsonStore<T>;
};

const factoryRegistry = new Map<string, InternalStore<unknown>>();

function cloneValue<T>(value: T): T {
    if (value === undefined || value === null) {
        return value;
    }

    return JSON.parse(JSON.stringify(value)) as T;
}

async function emitChange<T>(options: StoreFactoryOptions<T>, value: T): Promise<void> {
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

function registerStore<T>(options: StoreFactoryOptions<T>): InternalStore<T> {
    const store = createJsonStore<T>({
        pathProvider: options.pathProvider,
        defaultValue: options.defaultValue,
        parse: options.parse,
        serialize: options.serialize,
        normalize: options.normalize,
        onParseError: options.onParseError,
    });

    const internal: InternalStore<T> = {
        store,
        options,
        schemaVersion: options.schemaVersion,
        api: {} as TypedJsonStore<T>,
    };

    internal.api = {
        read: async () => {
            const snapshot = await store.read();
            return snapshot.value;
        },

        readSnapshot: () => store.read(),

        write: async (value: T, writeOptions?: JsonStoreWriteOptions): Promise<T> => {
            const persisted = await store.write(value, writeOptions);
            // emitChange expects the store factory options (contains onChange),
            // not the per-write options. Pass the outer `options` from the
            // factory scope.
            await emitChange(options, persisted.value);
            return persisted.value;
        },

        update: async (mutator: (current: T) => MaybePromise<T>, writeOptions?: JsonStoreWriteOptions): Promise<T> => {
            const persisted = await store.update(mutator, writeOptions);
            await emitChange(options, persisted.value);
            return persisted.value;
        },

        refresh: async (): Promise<T> => {
            await store.clearCache();
            const snapshot = await store.read();
            await emitChange(options, snapshot.value);
            return snapshot.value;
        },

        clear: async (): Promise<void> => {
            factoryRegistry.delete(options.id);
            await store.clearCache();
        },

        getSchemaVersion: () => internal.schemaVersion,
    };

    factoryRegistry.set(options.id, internal as InternalStore<unknown>);
    return internal;
}

export function createTypedJsonStore<T>(options: StoreFactoryOptions<T>): TypedJsonStore<T> {
    const existing = factoryRegistry.get(options.id) as InternalStore<T> | undefined;
    const internal = existing ?? registerStore(options);
    return internal.api;
}

export function __resetJsonStoreFactoryForTesting(): void {
    factoryRegistry.clear();
}
