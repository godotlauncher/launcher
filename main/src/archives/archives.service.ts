import * as fs from 'node:fs';
import * as path from 'node:path';
import extractZip from '@electron-internal/extract-zip';
import { Injectable } from '@mariodebono/di';
import { ArchiveError } from './archive.error.js';
import type { CheckedZipOptions, ZipManifest } from './archives.types.js';
import { extractCheckedZip } from './checked-zip.adapter.js';

/** Owns native and checked ZIP extraction; callers own staging and cleanup. */
@Injectable()
export class ArchivesService {
    /** Extracts a trusted ZIP into an existing empty directory without cancellation.
     * Download integrity must already have been verified by the caller.
     * @param archivePath - Absolute path to a regular ZIP file.
     * @param destinationPath - Absolute path to an existing empty directory.
     */
    async extractZip(
        archivePath: string,
        destinationPath: string,
    ): Promise<void> {
        try {
            if (
                !path.isAbsolute(archivePath) ||
                !path.isAbsolute(destinationPath)
            )
                throw new ArchiveError('unsafe');
            const [archive, destination] = await Promise.all([
                fs.promises.lstat(archivePath),
                fs.promises.lstat(destinationPath),
            ]);
            if (
                !archive.isFile() ||
                archive.isSymbolicLink() ||
                !destination.isDirectory() ||
                destination.isSymbolicLink()
            )
                throw new ArchiveError('unsafe');
            if ((await fs.promises.readdir(destinationPath)).length)
                throw new ArchiveError('unsafe');
            await extractZip(archivePath, { dir: destinationPath });
        } catch (error) {
            if (error instanceof ArchiveError) throw error;
            throw new ArchiveError('unsafe', { cause: error });
        }
    }

    /** Validates entries and capacity before streaming files into a new directory.
     * Cancellation closes streams; partially extracted files remain caller-owned.
     * @param archivePath - Absolute path to a regular ZIP file.
     * @param destinationPath - Absolute path to a directory that does not yet exist.
     * @param options - Cancellation and feature-specific entry validation.
     */
    extractCheckedZip(
        archivePath: string,
        destinationPath: string,
        options: CheckedZipOptions,
    ): Promise<ZipManifest> {
        return extractCheckedZip(archivePath, destinationPath, options);
    }
}
