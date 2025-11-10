import { closeSync, fsyncSync, openSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function atomicWriteJson(
    file: string,
    data: unknown,
): Promise<void> {
    const dir = path.dirname(file);
    const tmp = `${file}.tmp`;
    const json = JSON.stringify(data, null, 2);

    // 1) write tmp
    const handle = await fs.open(tmp, 'w'); // create/truncate temp
    try {
        await handle.writeFile(json);
        await handle.sync(); // flush file contents
    } finally {
        await handle.close();
    }

    // 2) atomic rename (with Windows-friendly fallback)
    await renameTempFile(tmp, file);

    // 3) fsync dir (best effort; noop on some platforms)
    try {
        const dirfd = openSync(dir, 'r');
        fsyncSync(dirfd);
        closeSync(dirfd);
    } catch {
        /* ignore */
    }
}

async function renameTempFile(tmp: string, file: string): Promise<void> {
    try {
        await fs.rename(tmp, file);
        return;
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        const isWindows = process.platform === 'win32';
        const isBusy =
            err.code === 'EPERM' ||
            err.code === 'EACCES' ||
            err.code === 'EBUSY';

        if (isWindows && isBusy) {
            // Some Windows programs (editors, AV) keep destination handles open.
            // Removing the target first gives rename another chance.
            await fs.rm(file, { force: true }).catch(() => {});
            await fs.rename(tmp, file);
            return;
        }

        await fs.rm(tmp, { force: true }).catch(() => {});
        throw error;
    }
}
