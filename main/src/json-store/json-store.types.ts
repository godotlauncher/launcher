export type MaybePromise<T> = T | Promise<T>;

/** Describes how one JSON file is loaded, saved, and normalized. */
export interface JsonStoreDefinition<T> {
    /** Returns the file path. The path is resolved before it is used. */
    pathProvider: () => MaybePromise<string>;
    /** Returns a new value when the file does not exist. */
    defaultValue: () => MaybePromise<T>;
    /** Parses the file contents. The default uses `JSON.parse`. */
    parse?: (raw: string) => MaybePromise<T>;
    /** Converts a value to file contents. The default writes formatted JSON. */
    serialize?: (value: T) => MaybePromise<string>;
    /** Cleans or validates a value before it enters the cache. */
    normalize?: (value: T) => MaybePromise<T>;
}

/** A safe copy of the stored value and its optimistic version. */
export interface JsonStoreSnapshot<T> {
    value: T;
    version: string;
}

/** Controls an individual write operation. */
export interface JsonStoreWriteOptions {
    /** Rejects the write when the cached version is different. */
    expectedVersion?: string;
}

/** Raised when a caller tries to write from an old snapshot. */
export class JsonStoreConflictError extends Error {
    /**
     * Creates a conflict error for one store.
     *
     * @param path - The path of the store that changed.
     */
    constructor(path: string) {
        super(`JSON store at ${path} changed while writing`);
        this.name = 'JsonStoreConflictError';
    }
}
