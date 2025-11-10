import fs from 'node:fs';
import path from 'node:path';
import type { IJsonCollection } from './jsonCollection/jsonCollection.interfaces.js';
import { JsonCollection } from './jsonCollection/jsonCollection.js';
import type { JsonDBOptions, LockOptions } from './jsonDB.options.js';

export class JsonDB {
    private readonly absDataDir: string;

    private collections: Map<string, unknown> = new Map();
    private readonly lockOptions?: LockOptions;

    constructor(options: JsonDBOptions) {
        const { dataPath, lock } = options;
        this.lockOptions = lock || {
            // sensible defaults
            ttlMs: 10_000,
            acquireTimeoutMs: 5_000,
        };

        if (path.isAbsolute(dataPath)) {
            this.absDataDir = dataPath;
            return;
        } else {
            this.absDataDir = path.join(process.cwd(), dataPath);
        }

        if (!fs.existsSync(this.absDataDir)) {
            fs.mkdirSync(this.absDataDir, { recursive: true });
        }
    }

    private getCollection<T extends object>(name: string): IJsonCollection<T> {
        if (!this.collections.has(name)) {
            this.collections.set(
                name,
                new JsonCollection<T>(
                    path.join(this.absDataDir, `${name}.json`),
                    this.lockOptions,
                ),
            );
        }
        return this.collections.get(name) as IJsonCollection<T>;
    }

    collection<T extends object>(name: string): IJsonCollection<T> {
        return this.getCollection<T>(name);
    }
}
