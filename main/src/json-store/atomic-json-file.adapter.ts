import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Injectable } from '@mariodebono/di';
import {
    ATOMIC_JSON_TEMP_FILE_IDENTIFIER_PATTERN,
    ATOMIC_JSON_TEMP_FILE_SUFFIX,
    STALE_ATOMIC_JSON_TEMP_FILE_AGE_MS,
} from './atomic-json-file.constants.js';

/** Reads JSON files and replaces them without exposing partial writes. */
@Injectable()
export class AtomicJsonFileAdapter {
    /**
     * Reads a UTF-8 file.
     *
     * @param filePath - Path of the file to read.
     * @returns The file contents, or `undefined` when the file does not exist.
     */
    async read(filePath: string): Promise<string | undefined> {
        await this.removeStaleTemporaryFiles(filePath);

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
        await this.removeStaleTemporaryFiles(filePath);

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

    /**
     * Removes abandoned temporary files created for one JSON target.
     *
     * Cleanup is best effort so it cannot block access to the canonical file.
     *
     * @param filePath - Canonical JSON file whose stale temporary files should be removed.
     */
    private async removeStaleTemporaryFiles(filePath: string): Promise<void> {
        const directory = path.dirname(filePath);
        const targetName = path.basename(filePath);

        try {
            const entries = await fs.readdir(directory, {
                withFileTypes: true,
            });
            await Promise.all(
                entries
                    .filter(
                        (entry) =>
                            entry.isFile() &&
                            isTemporaryFileForTarget(entry.name, targetName),
                    )
                    .map(async (entry) => {
                        const temporaryPath = path.join(directory, entry.name);
                        try {
                            const stats = await fs.stat(temporaryPath);
                            if (
                                Date.now() - stats.mtimeMs >=
                                STALE_ATOMIC_JSON_TEMP_FILE_AGE_MS
                            ) {
                                await fs.unlink(temporaryPath);
                            }
                        } catch {
                            // Another process may remove or lock the file.
                        }
                    }),
            );
        } catch {
            // Canonical file access remains authoritative if cleanup fails.
        }
    }
}

/**
 * Reports whether a filename has the exact atomic-write shape for one target.
 *
 * @param fileName - Directory entry name to inspect.
 * @param targetName - Canonical JSON filename in the same directory.
 * @returns Whether the entry belongs to an atomic write for the target.
 */
function isTemporaryFileForTarget(
    fileName: string,
    targetName: string,
): boolean {
    const prefix = `.${targetName}.`;
    if (
        !fileName.startsWith(prefix) ||
        !fileName.endsWith(ATOMIC_JSON_TEMP_FILE_SUFFIX)
    ) {
        return false;
    }

    const identifier = fileName.slice(
        prefix.length,
        -ATOMIC_JSON_TEMP_FILE_SUFFIX.length,
    );
    return ATOMIC_JSON_TEMP_FILE_IDENTIFIER_PATTERN.test(identifier);
}
