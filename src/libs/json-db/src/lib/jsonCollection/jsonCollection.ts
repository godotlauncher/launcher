import fs from 'node:fs/promises';
import type {
    DeleteOptions,
    FindAndModifyOptions,
    FindOptions,
    UpdateOptions,
} from '../interfaces/operationOptions.interfaces.js';
import type {
    DeleteManyResult,
    DeleteOneResult,
    InsertManyResult,
    InsertOneResult,
    UpdateManyResult,
    UpdateOneResult,
} from '../interfaces/results.interfaces.js';
import type { LockOptions } from '../jsonDB.options.js';
import { matchCondition } from '../query/conditions.js';
import type { JsonDbDocument } from '../types/document.types.js';
import { atomicWriteJson } from '../utils/atomicWriteJson.js';
import { JsonDBId } from '../utils/jsonDBId.js';
import { LockFile } from '../utils/lockFIle.js';
import { RWLock } from '../utils/RWLock.js';
import type { IJsonCollection } from './jsonCollection.interfaces.js';

type CollectionCache<T extends object> = {
    data: JsonDbDocument<T>[];
    version: number;
};

export class JsonCollection<T extends object> implements IJsonCollection<T> {
    private lock = new RWLock();
    private lockfile: LockFile;
    private cache: CollectionCache<T> | null = null;

    constructor(
        private filePath: string,
        lockOptions?: LockOptions,
    ) {
        this.lockfile = new LockFile(`${filePath}.lock`, lockOptions);
    }

    private async load(): Promise<void> {
        if (this.cache) return;
        try {
            const txt = await fs.readFile(this.filePath, 'utf8');
            this.cache = {
                data: JSON.parse(txt) as JsonDbDocument<T>[],
                version: 1,
            };
        } catch (e) {
            const error = e as NodeJS.ErrnoException;
            if (error.code === 'ENOENT') this.cache = { data: [], version: 1 };
            else throw e;
        }
    }

    private async ensureCache(): Promise<CollectionCache<T>> {
        if (!this.cache) await this.load();
        return this.cache as CollectionCache<T>;
    }

    async findOne(options?: FindOptions<T>): Promise<JsonDbDocument<T> | null> {
        const results = await this.findMany(options);
        return results[0] || null;
    }

    async findMany(options?: FindOptions<T>): Promise<JsonDbDocument<T>[]> {
        const { where, projection, sort } = options || {};

        return this.lock.withRead(async () => {
            const cache = await this.ensureCache();
            const source = cache.data;

            const filtered = !where
                ? source.slice()
                : source.filter((doc) => matchCondition(doc, where));

            if (sort) {
                filtered.sort(JsonCollection.sortComparator(sort));
            }

            if (!projection) {
                return filtered.map((doc) => ({ ...doc }));
            }

            return filtered.map((doc) =>
                JsonCollection.applyProjection(doc, projection),
            );
        });
    }

    private static sortComparator<T extends object>(
        sort: Partial<Record<keyof JsonDbDocument<T>, 1 | -1>>,
    ) {
        const entries = Object.entries(sort).flatMap((entry) => {
            const [key, direction] = entry;
            if (direction !== 1 && direction !== -1) return [];
            return [
                [key as keyof JsonDbDocument<T>, direction] as [
                    keyof JsonDbDocument<T>,
                    1 | -1,
                ],
            ];
        });
        return (a: JsonDbDocument<T>, b: JsonDbDocument<T>) => {
            for (const [key, direction] of entries) {
                const aValue = a[key];
                const bValue = b[key];
                if (aValue === bValue) continue;
                const comparison = aValue < bValue ? -1 : 1;
                return direction === 1 ? comparison : -comparison;
            }
            return 0;
        };
    }

    private static applyProjection<T extends object>(
        doc: JsonDbDocument<T>,
        projection: Partial<Record<keyof JsonDbDocument<T>, boolean>>,
    ): JsonDbDocument<T> {
        const entries = Object.entries(projection).flatMap((entry) => {
            const [key, flag] = entry;
            if (flag === undefined) return [];
            return [
                [key as keyof JsonDbDocument<T>, flag] as [
                    keyof JsonDbDocument<T>,
                    boolean,
                ],
            ];
        });

        const hasInclude = entries.some(([, flag]) => flag);
        const clone: Partial<JsonDbDocument<T>> = {};

        if (hasInclude) {
            const target = clone as Record<string, unknown>;
            for (const [key, flag] of entries) {
                if (flag || key === '_id') {
                    const typedKey = key as keyof JsonDbDocument<T>;
                    target[typedKey as string] = doc[typedKey];
                }
            }
        } else {
            Object.assign(clone, doc);
            for (const [key, flag] of entries) {
                if (!flag && key in clone) {
                    delete clone[key];
                }
            }
            if (projection._id === false) delete clone._id;
        }

        if (!('_id' in clone) && projection._id !== false) {
            clone._id = doc._id as JsonDbDocument<T>['_id'];
        }

        return clone as JsonDbDocument<T>;
    }

    async insertOne(
        doc: Omit<JsonDbDocument<T>, '_id'> &
            Partial<Pick<JsonDbDocument<T>, '_id'>>,
    ): Promise<InsertOneResult> {
        return this.lock.withWrite(async () => {
            await this.lockfile.acquire();
            try {
                const cache = await this.ensureCache();

                const _id = doc._id ?? new JsonDBId().toString(); // mongo-like id
                const newDoc = { ...doc, _id } as JsonDbDocument<T>;

                const next = [...cache.data, newDoc];
                await atomicWriteJson(this.filePath, next);
                this.cache = {
                    data: next,
                    version: cache.version + 1,
                };

                return { acknowledged: true, insertedId: _id };
            } finally {
                await this.lockfile.release();
            }
        });
    }

    async insertMany(
        docs: Array<
            Omit<JsonDbDocument<T>, '_id'> &
                Partial<Pick<JsonDbDocument<T>, '_id'>>
        >,
    ): Promise<InsertManyResult> {
        return this.lock.withWrite(async () => {
            await this.lockfile.acquire();
            try {
                const cache = await this.ensureCache();

                const newDocs: JsonDbDocument<T>[] = docs.map((doc) => {
                    const _id = doc._id ?? new JsonDBId().toString(); // mongo-like id
                    return { ...doc, _id } as JsonDbDocument<T>;
                });

                const next = [...cache.data, ...newDocs];
                await atomicWriteJson(this.filePath, next);

                this.cache = {
                    data: next,
                    version: cache.version + 1,
                };

                return {
                    acknowledged: true,
                    insertedIds: newDocs.map((d) => d._id),
                };
            } finally {
                await this.lockfile.release();
            }
        });
    }

    async updateOne(options: UpdateOptions<T>): Promise<UpdateOneResult> {
        const { where, update } = options;
        return this.lock.withWrite(async () => {
            await this.lockfile.acquire();
            try {
                const cache = await this.ensureCache();

                // find index of the first matching document
                const idx = cache.data.findIndex((doc) =>
                    matchCondition(doc, where),
                );
                const next = cache.data.slice();

                if (idx < 0) {
                    return { matchedCount: 0, modifiedCount: 0 };
                }

                // update the found document
                const doc = next[idx] as JsonDbDocument<T>;

                const updatedDoc = {
                    ...doc,
                    ...update,
                    _id: doc._id,
                } as JsonDbDocument<T>;

                next[idx] = { ...next[idx], ...updatedDoc };

                // write and update the cache
                await atomicWriteJson(this.filePath, next);
                this.cache = { data: next, version: cache.version + 1 };

                return { matchedCount: 1, modifiedCount: 1 };
            } finally {
                await this.lockfile.release();
            }
        });
    }

    updateMany(options: UpdateOptions<T>): Promise<UpdateManyResult> {
        const { where, update } = options;
        return this.lock.withWrite(async () => {
            await this.lockfile.acquire();
            try {
                const cache = await this.ensureCache();
                let matchedCount = 0;

                // create a copy of the data
                const next = cache.data.slice();

                // find documents to update
                for (let idx = 0; idx < next.length; idx++) {
                    const doc = next[idx] as JsonDbDocument<T>;
                    if (!matchCondition(doc, where)) continue;
                    matchedCount++;

                    const updatedDoc = {
                        ...doc,
                        ...update,
                        _id: doc._id,
                    } as JsonDbDocument<T>;

                    next[idx] = updatedDoc;
                }

                if (matchedCount === 0) {
                    return { matchedCount: 0, modifiedCount: 0 };
                }

                // write and update the cache
                await atomicWriteJson(this.filePath, next);
                this.cache = { data: next, version: cache.version + 1 };

                return {
                    matchedCount,
                    modifiedCount: matchedCount,
                };
            } finally {
                await this.lockfile.release();
            }
        });
    }

    async findOneAndUpdate(
        options: FindAndModifyOptions<T>,
    ): Promise<JsonDbDocument<T> | null> {
        const { where, update, returnNew = false } = options;
        return this.lock.withWrite(async () => {
            await this.lockfile.acquire();
            try {
                const cache = await this.ensureCache();
                const idx = cache.data.findIndex((doc) =>
                    matchCondition(doc, where),
                );
                if (idx < 0) return null;

                const current = cache.data[idx] as JsonDbDocument<T>;
                const prev: JsonDbDocument<T> = { ...current };
                const updatedDoc = {
                    ...prev,
                    ...update,
                    _id: prev._id,
                } as JsonDbDocument<T>;

                const next = cache.data.slice();
                next[idx] = updatedDoc;
                await atomicWriteJson(this.filePath, next);
                this.cache = { data: next, version: cache.version + 1 };
                return returnNew ? updatedDoc : prev;
            } finally {
                await this.lockfile.release();
            }
        });
    }

    async findManyAndUpdate(
        options: FindAndModifyOptions<T>,
    ): Promise<JsonDbDocument<T>[]> {
        const { where, update, returnNew = false } = options;
        return this.lock.withWrite(async () => {
            await this.lockfile.acquire();
            try {
                const cache = await this.ensureCache();
                const next = cache.data.slice();
                const result: JsonDbDocument<T>[] = [];
                let mutated = false;

                for (let idx = 0; idx < next.length; idx++) {
                    const doc = next[idx] as JsonDbDocument<T>;
                    if (!matchCondition(doc, where)) continue;
                    mutated = true;
                    const prev = { ...doc };
                    const updatedDoc = {
                        ...doc,
                        ...update,
                        _id: doc._id,
                    } as JsonDbDocument<T>;
                    next[idx] = updatedDoc;
                    result.push(returnNew ? updatedDoc : prev);
                }

                if (!mutated) return [];

                await atomicWriteJson(this.filePath, next);
                this.cache = { data: next, version: cache.version + 1 };
                return result;
            } finally {
                await this.lockfile.release();
            }
        });
    }

    async findOneAndDelete(
        options: DeleteOptions<T>,
    ): Promise<JsonDbDocument<T> | null> {
        const { where } = options;
        return this.lock.withWrite(async () => {
            await this.lockfile.acquire();
            try {
                const cache = await this.ensureCache();
                const idx = cache.data.findIndex((doc) =>
                    matchCondition(doc, where),
                );
                if (idx < 0) return null;

                const next = cache.data.slice();
                const [deleted] = next.splice(idx, 1) as [JsonDbDocument<T>];
                await atomicWriteJson(this.filePath, next);
                this.cache = { data: next, version: cache.version + 1 };
                return deleted;
            } finally {
                await this.lockfile.release();
            }
        });
    }

    async findManyAndDelete(
        options: DeleteOptions<T>,
    ): Promise<JsonDbDocument<T>[]> {
        const { where } = options;
        return this.lock.withWrite(async () => {
            await this.lockfile.acquire();
            try {
                const cache = await this.ensureCache();
                const deleted: JsonDbDocument<T>[] = [];
                const next = cache.data.filter((doc) => {
                    if (matchCondition(doc, where)) {
                        deleted.push(doc);
                        return false;
                    }
                    return true;
                });

                if (deleted.length === 0) return [];

                await atomicWriteJson(this.filePath, next);
                this.cache = { data: next, version: cache.version + 1 };
                return deleted;
            } finally {
                await this.lockfile.release();
            }
        });
    }

    async deleteOne(options: DeleteOptions<T>): Promise<DeleteOneResult> {
        const { where } = options;
        return this.lock.withWrite(async () => {
            await this.lockfile.acquire();
            try {
                const cache = await this.ensureCache();
                const idx = cache.data.findIndex((doc) =>
                    matchCondition(doc, where),
                );
                if (idx < 0) return { deletedCount: 0 };
                const next = cache.data.slice();
                next.splice(idx, 1);
                await atomicWriteJson(this.filePath, next);
                this.cache = { data: next, version: cache.version + 1 };
                return { deletedCount: 1 };
            } finally {
                await this.lockfile.release();
            }
        });
    }

    async deleteMany(options: DeleteOptions<T>): Promise<DeleteManyResult> {
        const { where } = options;
        return this.lock.withWrite(async () => {
            await this.lockfile.acquire();
            try {
                const cache = await this.ensureCache();
                const toDelete = cache.data.filter((doc) =>
                    matchCondition(doc, where),
                );
                if (toDelete.length === 0) return { deletedCount: 0 };
                const next = cache.data.filter((d) => !toDelete.includes(d));
                await atomicWriteJson(this.filePath, next);
                this.cache = { data: next, version: cache.version + 1 };
                return { deletedCount: toDelete.length };
            } finally {
                await this.lockfile.release();
            }
        });
    }
}
