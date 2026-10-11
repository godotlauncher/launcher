import { z } from 'zod';
import {
    importedTemplateIdentitySchema,
    importedTemplateLibrarySchema,
} from './imported-templates.schema.js';

export const templateVersionLayoutSchema = z.object({
    version: z.literal(1),
    root: z.enum(['active', 'official']),
    managed: z.record(importedTemplateIdentitySchema, z.string().uuid()),
});
export type TemplateVersionLayout = z.infer<typeof templateVersionLayoutSchema>;

const migrationInputs = z.object({
    id: z.string().uuid(),
    projectPath: z.string(),
    launchPath: z.string(),
    setId: importedTemplateIdentitySchema,
    editorSetId: importedTemplateIdentitySchema,
    root: z.enum(['active', 'official']),
    localRealPath: z.string(),
    sharedRoot: z.string(),
    choice: z.enum(['save-imported', 'share-project', 'use-shared']),
    beforeMode: z.enum(['shared', 'separate']).optional(),
    beforeSelections: z.record(importedTemplateIdentitySchema, z.string()),
    beforeLayout: templateVersionLayoutSchema.optional(),
    build: importedTemplateLibrarySchema.shape.builds.element.optional(),
});
const fileMetadata = z.object({
    relative: z.string(),
    size: z.number().nonnegative(),
    mode: z.number().int(),
    hash: z.literal(''),
    metadata: z
        .object({
            mtimeMs: z.number(),
            ctimeMs: z.number(),
            ino: z.number(),
            dev: z.number(),
        })
        .optional(),
});
const directoryIdentity = z.object({ dev: z.number(), ino: z.number() });

export const templateVersionMigrationSchema = z.discriminatedUnion('version', [
    migrationInputs.extend({
        version: z.literal(1),
        files: z.array(
            z.object({
                relative: z.string(),
                size: z.number().nonnegative(),
                mode: z.number().int(),
                hash: z.string().regex(/^[a-f0-9]{64}$/),
            }),
        ),
    }),
    migrationInputs.extend({
        version: z.literal(2),
        transfer: z.enum(['move', 'copy', 'merge', 'shared']),
        sourceIdentity: directoryIdentity,
        targetIdentity: directoryIdentity.optional(),
        files: z.array(fileMetadata),
        targetFiles: z.array(fileMetadata).optional(),
    }),
]);
export type TemplateVersionMigration = z.infer<
    typeof templateVersionMigrationSchema
>;
export type FastTemplateVersionMigration = Extract<
    TemplateVersionMigration,
    { version: 2 }
>;
