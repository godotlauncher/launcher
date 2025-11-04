import * as fs from 'node:fs';
import { createHash } from 'node:crypto';

import logger from 'electron-log';

export type MaybePromise<T> = T | Promise<T>;

export type JsonStoreOptions<T> = {
    pathProvider: () => MaybePromise<string>;
    defaultValue: () => MaybePromise<T>;
    parse?: (raw: string) => MaybePromise<T>;
    serialize?: (value: T) => MaybePromise<string>;
    normalize?: (value: T) => MaybePromise<T>;
    onParseError?: (error: unknown, raw: string) => MaybePromise<T>;
};

type CachedEntry = {
    value: unknown;
    hash: string;
};

const storeCache = new Map<string, CachedEntry>();
const operationQueue = new Map<string, Promise<void>>();

function cloneJson<T>(value: T): T {
    if (value === undefined || value === null) {
        return value;
    }
    return JSON.parse(JSON.stringify(value)) as T;
}

function hashJson(value: unknown): string {
    return createHash('md5').update(JSON.stringify(value)).digest('hex');
}

async function waitForPendingOperation(path: string): Promise<void> {
    const pending = operationQueue.get(path);
    if (!pending) {
        return;
    }

    try {
        await pending;
    } catch (error) {
        logger.error('Failed JSON store operation', error);
    }
}

function enqueueOperation<T>(path: string, action: () => Promise<T>): Promise<T> {
    const previous = operationQueue.get(path) ?? Promise.resolve();
    const operationResult = previous.catch(() => undefined).then(action);

    const waitPromise = operationResult
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => {
            if (operationQueue.get(path) === waitPromise) {
                operationQueue.delete(path);
            }
        });

    operationQueue.set(path, waitPromise);
    return operationResult;
}

export type JsonStore<T> = {
    read(): Promise<T>;
    write(value: T): Promise<T>;
    update(mutator: (current: T) => MaybePromise<T>): Promise<T>;
    clearCache(): Promise<void>;
};

export function createJsonStore<T>(options: JsonStoreOptions<T>): JsonStore<T> {
    const parse = options.parse ?? (async (raw: string) => JSON.parse(raw) as T);
    const serialize = options.serialize ?? (async (value: T) => JSON.stringify(value, null, 4));
    const normalize = options.normalize ?? (async (value: T) => value);

    async function resolvePath(): Promise<string> {
        const path = await options.pathProvider();
        if (!path) {
            throw new Error('JsonStore pathProvider returned an empty path');
        }
        return path;
    }

    async function getDefault(): Promise<T> {
        const value = await options.defaultValue();
        return cloneJson(value);
    }

    async function normalizeValue(value: T): Promise<T> {
        const normalized = await normalize(cloneJson(value));
        return cloneJson(normalized);
    }

    async function readFromDisk(path: string): Promise<T> {
        if (!fs.existsSync(path)) {
            return getDefault();
        }

        let data: string | undefined;
        try {
            data = await fs.promises.readFile(path, 'utf-8');
            const parsed = await parse(data);
            return cloneJson(parsed);
        } catch (error) {
            if (data !== undefined && options.onParseError) {
                const recovered = await options.onParseError(error, data);
                return cloneJson(recovered);
            }

            logger.error(`Failed to read JSON store at ${path}`, error);
            return getDefault();
        }
    }

    async function loadValue(path: string): Promise<T> {
        const cached = storeCache.get(path);
        if (cached) {
            return cloneJson(cached.value as T);
        }

        const fromDisk = await readFromDisk(path);
        const normalized = await normalizeValue(fromDisk);
        const cachedValue = cloneJson(normalized);
        storeCache.set(path, { value: cachedValue, hash: hashJson(cachedValue) });
        return cloneJson(cachedValue);
    }

    async function persistValue(path: string, value: T): Promise<T> {
        const normalized = await normalizeValue(value);
        const cachedValue = cloneJson(normalized);
        const newHash = hashJson(cachedValue);
        const existing = storeCache.get(path);

        if (existing && existing.hash === newHash) {
            storeCache.set(path, existing);
            return cloneJson(existing.value as T);
        }

        storeCache.set(path, { value: cachedValue, hash: newHash });

        const serialized = await serialize(cachedValue);
        await fs.promises.writeFile(path, serialized, 'utf-8');

        return cloneJson(cachedValue);
    }

    return {
        async read(): Promise<T> {
            const path = await resolvePath();
            await waitForPendingOperation(path);
            return loadValue(path);
        },

        async write(value: T): Promise<T> {
            const path = await resolvePath();
            return enqueueOperation(path, async () => persistValue(path, value));
        },

        async update(mutator: (current: T) => MaybePromise<T>): Promise<T> {
            const path = await resolvePath();
            return enqueueOperation(path, async () => {
                const current = await loadValue(path);
                const nextValue = await mutator(cloneJson(current));
                return persistValue(path, nextValue);
            });
        },

        async clearCache(): Promise<void> {
            try {
                const path = await options.pathProvider();
                if (path) {
                    storeCache.delete(path);
                }
            } catch (error) {
                logger.warn('Failed to clear JsonStore cache', error);
            }
        },
    };
}

export function __resetJsonStoreForTesting(): void {
    storeCache.clear();
    operationQueue.clear();
}
