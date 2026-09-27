import * as fs from 'node:fs';
import path from 'node:path';
import type { ImportedTemplateBuild } from '@shared/contracts';
import { AtomicJsonFileAdapter } from '../json-store/atomic-json-file.adapter.js';
import { importedTemplateRoot } from './imported-templates.store.js';
import { savedProjectMigrationSchema } from './saved-project-migration.schema.js';

export type SavedProjectMigration = {
    version: 1;
    projectPath: string;
    launchPath: string;
    localPath: string;
    builds: { build: ImportedTemplateBuild; fingerprint: string }[];
};

const adapter = new AtomicJsonFileAdapter();

/** Reads the one outstanding local-to-imported migration journal. */
export async function readSavedProjectMigration(): Promise<
    SavedProjectMigration | undefined
> {
    const raw = await adapter.read(
        path.join(importedTemplateRoot(), 'saved-project-migration.json'),
    );
    return raw === undefined
        ? undefined
        : savedProjectMigrationSchema.parse(JSON.parse(raw));
}

/** Persists the intended source and destination identities before copying.
 * @param migration - Validated pending migration.
 */
export async function writeSavedProjectMigration(
    migration: SavedProjectMigration,
): Promise<void> {
    await adapter.write(
        path.join(importedTemplateRoot(), 'saved-project-migration.json'),
        JSON.stringify(savedProjectMigrationSchema.parse(migration), null, 2),
    );
}

/** Removes a migration journal after cleanup completes. */
export async function clearSavedProjectMigration(): Promise<void> {
    try {
        await fs.promises.unlink(
            path.join(importedTemplateRoot(), 'saved-project-migration.json'),
        );
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
}
