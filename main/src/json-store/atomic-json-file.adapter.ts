import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Injectable } from '@mariodebono/di';

/** Reads JSON files and replaces them without exposing partial writes. */
@Injectable()
export class AtomicJsonFileAdapter {
    /**
     * Reads a UTF-8 file.
     *
     * @param {stirng} filePath The path of the file to read.
     * @returns {string} The file contents, or `undefined` when the file does not exist.
     */
    async read(filePath: string): Promise<string | undefined> {
        try {
            return await fs.readFile(filePath, 'utf-8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return undefined;
            }

            throw error;
        }
    }

    /**
     * Writes through a temporary file and then replaces the target file.
     *
     * @param {string} filePath - The path of the file to replace.
     * @param {string} contents - The complete UTF-8 contents to write.
     * @returns A promise that resolves after the target file is replaced.
     */
    async write(filePath: string, contents: string): Promise<void> {
        const directory = path.dirname(filePath);
        const temporaryPath = path.join(
            directory,
            `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
        );

        await fs.mkdir(directory, { recursive: true });

        let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
        try {
            // The temporary file is in the same directory so rename stays on
            // the same file system.
            handle = await fs.open(temporaryPath, 'wx');
            await handle.writeFile(contents, 'utf-8');
            await handle.sync();
            await handle.close();
            handle = undefined;
            await fs.rename(temporaryPath, filePath);
        } catch (error) {
            // Cleanup must not hide the original write error.
            await handle?.close().catch(() => undefined);
            await fs.unlink(temporaryPath).catch(() => undefined);
            throw error;
        }
    }
}
