export class RWLock {
    private readers = 0;
    private writer = false;
    private waiting: (() => void)[] = [];

    async withRead<T>(fn: () => Promise<T> | T): Promise<T> {
        await this.acquireRead();
        try {
            return await fn();
        } finally {
            this.releaseRead();
        }
    }

    async withWrite<T>(fn: () => Promise<T> | T): Promise<T> {
        await this.acquireWrite();
        try {
            return await fn();
        } finally {
            this.releaseWrite();
        }
    }

    private acquireRead(): Promise<void> {
        if (!this.writer) {
            this.readers++;
            return Promise.resolve();
        }
        return new Promise((res) =>
            this.waiting.push(() => {
                this.readers++;
                res();
            }),
        );
    }

    private acquireWrite(): Promise<void> {
        const canWrite = !this.writer && this.readers === 0;
        if (canWrite) {
            this.writer = true;
            return Promise.resolve();
        }
        return new Promise((res) =>
            this.waiting.push(() => {
                this.writer = true;
                res();
            }),
        );
    }

    private releaseRead() {
        this.readers--;
        if (this.readers === 0) this.drain();
    }

    private releaseWrite() {
        this.writer = false;
        this.drain();
    }

    private drain() {
        if (this.writer) return;
        // Give priority to writers waiting (prevents writer starvation)
        const writerIdx = this.waiting.findIndex(() => true);
        if (writerIdx >= 0 && this.readers === 0) {
            const next = this.waiting.splice(writerIdx, 1)[0];
            next?.();
            return;
        }
        // Otherwise release all readers
        while (this.waiting.length && !this.writer) {
            const next = this.waiting.shift();
            // First waiter becomes writer if readers are zero and no writer selected
            if (this.readers === 0 && !this.writer) {
                this.writer = true;
                next?.();
                break;
            } else {
                // treat as reader
                this.readers++;
                next?.();
            }
        }
    }
}
