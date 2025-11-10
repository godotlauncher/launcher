import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface LockFileOptions {
    ttlMs?: number;
    acquireTimeoutMs?: number;
    retryDelayMs?: number;
}

type LockMetadata = {
    pid: number;
    hostname: string;
    expiresAt: number;
};

export class LockFile {
    private readonly ttlMs: number;
    private readonly acquireTimeoutMs: number | null;
    private readonly retryDelayMs: number;

    constructor(
        private lockPath: string,
        options?: LockFileOptions,
    ) {
        this.ttlMs = options?.ttlMs ?? 10_000;
        const acquireTimeout = options?.acquireTimeoutMs ?? 5_000;
        this.acquireTimeoutMs = acquireTimeout > 0 ? acquireTimeout : null;
        this.retryDelayMs = options?.retryDelayMs ?? 100;
    }

    async acquire(): Promise<void> {
        const deadline =
            this.acquireTimeoutMs !== null
                ? Date.now() + this.acquireTimeoutMs
                : null;

        while (true) {
            const now = Date.now();
            const content = JSON.stringify({
                pid: process.pid,
                hostname: os.hostname(),
                expiresAt: now + this.ttlMs,
            });

            try {
                const handle = await fs.open(
                    this.lockPath,
                    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
                    0o600,
                );
                await handle.writeFile(content);
                await handle.close();
                return;
            } catch {
                const cleared = await this.tryClearStaleLock(now);
                if (cleared) {
                    continue;
                }

                if (deadline !== null && Date.now() >= deadline) {
                    throw new Error(
                        `Lock busy: ${path.basename(
                            this.lockPath,
                        )} (timeout after ${this.acquireTimeoutMs}ms)`,
                    );
                }

                await delay(this.retryDelayMs);
            }
        }
    }

    async refresh(): Promise<void> {
        const now = Date.now();
        await fs.writeFile(
            this.lockPath,
            JSON.stringify({
                pid: process.pid,
                hostname: os.hostname(),
                expiresAt: now + this.ttlMs,
            }),
        );
    }

    private async tryClearStaleLock(now: number): Promise<boolean> {
        let meta: LockMetadata | null = null;
        try {
            const txt = await fs.readFile(this.lockPath, 'utf8');
            meta = JSON.parse(txt) as LockMetadata;
        } catch {
            await fs.unlink(this.lockPath).catch(() => {});
            return true;
        }

        if (meta.hostname && meta.hostname !== os.hostname()) {
            return false;
        }

        const expired = meta.expiresAt < now;
        const ownerAlive = isProcessAlive(meta.pid);

        if (expired || !ownerAlive) {
            await fs.unlink(this.lockPath).catch(() => {});
            return true;
        }

        return false;
    }

    async release(): Promise<void> {
        await fs.unlink(this.lockPath).catch(() => {});
    }
}

const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, ms));

function isProcessAlive(pid: number): boolean {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ESRCH') {
            return false;
        }
        return true;
    }
}
