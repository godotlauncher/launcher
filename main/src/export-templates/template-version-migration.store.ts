import * as fs from 'node:fs';
import path from 'node:path';
import { AtomicJsonFileAdapter } from '../json-store/atomic-json-file.adapter.js';
import { importedTemplateRoot } from './imported-templates.store.js';
import { templateLstat } from './template-files.util.js';
import { projectTemplateStorage } from './template-paths.util.js';
import {
    type TemplateVersionLayout,
    type TemplateVersionMigration,
    templateVersionLayoutSchema,
    templateVersionMigrationSchema,
} from './template-version-migration.schema.js';

const adapter = new AtomicJsonFileAdapter();
const unreadableRecoveryId = '00000000-0000-4000-8000-000000000005';

/** Keeps an unreadable or redirected version journal visible as a blocking recovery. */
export async function templateVersionMigrationRecoveryId(): Promise<
    string | undefined
> {
    if (
        !(await templateLstat(
            path.join(importedTemplateRoot(), 'version-migration.json'),
        ))
    )
        return undefined;
    try {
        return (await readTemplateVersionMigration())?.id;
    } catch {
        return unreadableRecoveryId;
    }
}

/** Reads an optional regular JSON file without following a redirected journal.
 * @param filename - Main-owned layout or journal filename.
 */
async function read(filename: string): Promise<unknown> {
    const stat = await templateLstat(filename);
    if (!stat) return undefined;
    if (!stat.isFile() || stat.isSymbolicLink())
        throw new Error('exportTemplates:errors.unsafe');
    return JSON.parse(await fs.promises.readFile(filename, 'utf8'));
}
/** Locates the ownership record beside a project's template collection.
 * @param editor - Project-owned editor directory.
 */
export function templateVersionLayoutPath(editor: string): string {
    return path.join(projectTemplateStorage(editor), 'version-layout.json');
}
/** Reads a project's managed version identities, without touching template contents.
 * @param editor - Project-owned editor directory.
 */
export async function readTemplateVersionLayout(
    editor: string,
): Promise<TemplateVersionLayout | undefined> {
    const raw = await read(templateVersionLayoutPath(editor));
    return raw === undefined
        ? undefined
        : templateVersionLayoutSchema.parse(raw);
}
/** Commits or removes a project ownership record during a serialised operation.
 * @param editor - Project-owned editor directory.
 * @param layout - Desired ownership record, or absent when rolling back the first version.
 */
export async function writeTemplateVersionLayout(
    editor: string,
    layout?: TemplateVersionLayout,
): Promise<void> {
    const filename = templateVersionLayoutPath(editor);
    if (layout)
        await adapter.write(
            filename,
            JSON.stringify(templateVersionLayoutSchema.parse(layout), null, 2),
        );
    else await remove(filename);
}
/** Reads the single interrupted version migration, under the template operation lock. */
export async function readTemplateVersionMigration(): Promise<
    TemplateVersionMigration | undefined
> {
    const raw = await read(
        path.join(importedTemplateRoot(), 'version-migration.json'),
    );
    return raw === undefined
        ? undefined
        : templateVersionMigrationSchema.parse(raw);
}
/** Persists recovery inputs before creating copies or changing a version's connection.
 * @param migration - Main-owned version transaction.
 */
export async function writeTemplateVersionMigration(
    migration: TemplateVersionMigration,
): Promise<void> {
    await adapter.write(
        path.join(importedTemplateRoot(), 'version-migration.json'),
        JSON.stringify(
            templateVersionMigrationSchema.parse(migration),
            null,
            2,
        ),
    );
}
/** Removes a completed or rolled-back version migration journal. */
export async function clearTemplateVersionMigration(): Promise<void> {
    await remove(path.join(importedTemplateRoot(), 'version-migration.json'));
}
/** Removes only a known metadata file, preserving errors other than absence.
 * @param filename - Main-owned metadata filename.
 */
async function remove(filename: string): Promise<void> {
    try {
        await fs.promises.unlink(filename);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
}
