import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@mariodebono/di';
import { ArchiveError } from '../archives/archive.error.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ArchivesService } from '../archives/archives.service.js';
import type { ZipManifest } from '../archives/archives.types.js';
import {
    isTemplateIdentity,
    readTemplateTree,
    templateChild,
} from './template-files.util.js';

/** Checks Godot's package layout before any files are extracted.
 * @param manifest - Validated archive entry metadata.
 */
export function validateTemplateLayout(manifest: ZipManifest): void {
    const versions = manifest.entries.filter(
        (entry) =>
            entry.kind === 'file' &&
            (entry.path === 'version.txt' ||
                entry.path.endsWith('/version.txt')),
    );
    if (versions.length !== 1 || versions[0].sizeBytes > 1024)
        throw new Error('exportTemplates:errors.identity');
    const prefix = path.posix.dirname(versions[0].path);
    if (
        manifest.entries.some(
            (entry) =>
                !(entry.kind === 'directory' && entry.path === '__MACOSX') &&
                !entry.path.startsWith('__MACOSX/') &&
                prefix !== '.' &&
                !(entry.kind === 'directory' && entry.path === prefix) &&
                !entry.path.startsWith(`${prefix}/`),
        )
    )
        throw new Error('exportTemplates:errors.unsafe');
}

/** Applies Godot-specific package rules around shared archive extraction. */
@Injectable()
export class TemplateArchiveAdapter {
    /** Uses the app's shared archive operations.
     * @param archives - ZIP extraction service.
     */
    constructor(private readonly archives: ArchivesService) {}

    /** Extracts a TPZ and resolves its Godot identity and contents directory.
     * @param archive - Job-owned local archive.
     * @param destination - New extraction directory.
     * @param signal - User cancellation.
     */
    async extract(
        archive: string,
        destination: string,
        signal: AbortSignal,
    ): Promise<{ identity: string; contents: string }> {
        let manifest: ZipManifest;
        try {
            manifest = await this.archives.extractCheckedZip(
                archive,
                destination,
                { signal, validateEntries: validateTemplateLayout },
            );
        } catch (error) {
            if (error instanceof ArchiveError) {
                const key = error.code === 'corrupt' ? 'archive' : error.code;
                throw new Error(`exportTemplates:errors.${key}`, {
                    cause: error,
                });
            }
            throw error;
        }
        const version = manifest.entries.find(
            (entry) =>
                entry.kind === 'file' &&
                (entry.path === 'version.txt' ||
                    entry.path.endsWith('/version.txt')),
        );
        if (!version) throw new Error('exportTemplates:errors.identity');
        const prefix = path.posix.dirname(version.path);
        const contents =
            prefix === '.' ? destination : templateChild(destination, prefix);
        const identity = (
            await fs.promises.readFile(
                path.join(contents, 'version.txt'),
                'utf8',
            )
        ).trim();
        if (!isTemplateIdentity(identity))
            throw new Error('exportTemplates:errors.identity');
        const files = await readTemplateTree(contents);
        if (!files.some((file) => file.relative !== 'version.txt'))
            throw new Error('exportTemplates:errors.identity');
        return { identity, contents };
    }
}
