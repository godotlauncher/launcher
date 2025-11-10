export interface LockOptions {
    ttlMs?: number;
    acquireTimeoutMs?: number;
    retryDelayMs?: number;
}

export interface JsonDBOptions {
    dataPath: string;
    lock?: LockOptions;
}
