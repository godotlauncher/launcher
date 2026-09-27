import path from 'node:path';
import type {
    ImportedTemplateBuild,
    ImportedTemplateLibrary,
    TemplateBuildSelection,
} from '@shared/contracts';
import { getCurrentAppConfig } from '../config/current-app-config.js';
import { AtomicJsonFileAdapter } from '../json-store/atomic-json-file.adapter.js';
import { isPortablePathSegment } from '../utils/portable-path.util.js';
import { sanitiseProjectDirectoryName } from '../utils/projectDirectoryName.utils.js';
import {
    importedTemplateIdentitySchema,
    importedTemplateLibrarySchema,
} from './imported-templates.schema.js';
import { assertTemplateStorageAvailable } from './template-storage.service.js';

const adapter = new AtomicJsonFileAdapter();
const currentManifest = 'imported-templates.json';

/** Returns launcher-owned storage, outside Godot's ordinary collection. */
export function importedTemplateRoot(): string {
    return path.join(getCurrentAppConfig().paths.configDir, 'export-templates');
}
/** Returns the default physical imported-template library beside Editors and Projects. */
export function importedTemplateDefaultRoot(): string {
    return getCurrentAppConfig().paths.templateDir;
}
/** Reads and validates the registry without hiding corrupt data. */
export async function readImportedTemplates(): Promise<ImportedTemplateLibrary> {
    await assertTemplateStorageAvailable('imported');
    const raw = await adapter.read(
        path.join(importedTemplateRoot(), currentManifest),
    );
    return raw === undefined
        ? { schemaVersion: 1, builds: [] }
        : importedTemplateLibrarySchema.parse(JSON.parse(raw));
}
/** Commits a complete registry atomically. Callers hold the template mutation lock.
 * @param library - Validated next registry.
 */
export async function writeImportedTemplates(
    library: ImportedTemplateLibrary,
): Promise<void> {
    await adapter.write(
        path.join(importedTemplateRoot(), currentManifest),
        JSON.stringify(importedTemplateLibrarySchema.parse(library), null, 2),
    );
}
/** Resolves package contents using its stable readable folder.
 * @param build - Registry entry whose validated metadata determines its path.
 */
export function importedTemplateFiles(build: ImportedTemplateBuild): string {
    if (!isPortablePathSegment(build.directoryName))
        throw new Error('exportTemplates:errors.unsafe');
    return path.join(
        importedTemplateRoot(),
        'imported',
        importedTemplateIdentitySchema.parse(build.setId),
        build.directoryName,
    );
}

/** Creates a portable label-derived folder name for a new build.
 * @param label - User-visible tag.
 */
export function importedTemplateDirectoryName(label: string): string {
    const name = sanitiseProjectDirectoryName(label);
    return name === 'project' && /^[. ]+$/.test(label.trim())
        ? 'template'
        : name;
}
/** Resolves a choice, rejecting a missing explicit build instead of falling back.
 * @param library - Current library.
 * @param setId - Required version and edition.
 * @param selection - Saved choice; absence means Official.
 */
export function resolveImportedTemplate(
    library: ImportedTemplateLibrary,
    setId: string,
    selection: TemplateBuildSelection = 'official',
): ImportedTemplateBuild | undefined {
    if (selection === 'official') return undefined;
    const id = selection;
    const build = library.builds.find(
        (item) => item.id === id && item.setId === setId,
    );
    if (!build) throw new Error('exportTemplates:library.missing');
    return build;
}
