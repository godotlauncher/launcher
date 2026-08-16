import * as fs from 'node:fs';
import * as path from 'node:path';
import extractZip from '@electron-internal/extract-zip';
import { t } from '../i18n/index.js';

/**
 * Extracts one editor archive into a new, empty managed directory.
 *
 * @param archivePath - Absolute path to the verified ZIP archive.
 * @param destinationPath - Absolute path to the empty extraction directory.
 * @returns A promise that completes after safe extraction.
 */
export async function extractEditorArchive(
    archivePath: string,
    destinationPath: string,
): Promise<void> {
    try {
        if (
            !path.isAbsolute(archivePath) ||
            !path.isAbsolute(destinationPath)
        ) {
            throw new Error('Archive paths must be absolute');
        }

        const [archive, destination] = await Promise.all([
            fs.promises.lstat(archivePath),
            fs.promises.lstat(destinationPath),
        ]);
        if (
            !archive.isFile() ||
            archive.isSymbolicLink() ||
            !destination.isDirectory() ||
            destination.isSymbolicLink()
        ) {
            throw new Error('Archive extraction paths are not newly prepared');
        }
        if ((await fs.promises.readdir(destinationPath)).length > 0) {
            throw new Error('Archive extraction destination must be empty');
        }

        await extractZip(archivePath, { dir: destinationPath });
    } catch (error) {
        throw new Error(t('installEditor:errors.unsafeArchive'), {
            cause: error,
        });
    }
}
