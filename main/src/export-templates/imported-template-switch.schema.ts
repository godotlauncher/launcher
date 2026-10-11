import { z } from 'zod';
import { isPortablePathSegment } from '../utils/portable-path.util.js';

const cleanupFileSchema = z.object({
    relative: z
        .string()
        .refine((value) => value.split('/').every(isPortablePathSegment)),
    size: z.number().int().nonnegative(),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    mode: z.number().int().min(0).max(0o777),
});
const cleanupFilesSchema = z
    .array(cleanupFileSchema)
    .refine(
        (files) =>
            new Set(files.map((file) => file.relative)).size === files.length,
    );

const switchJournalBase = z.object({
    version: z.literal(1),
    id: z.string().uuid(),
    setId: z.string(),
    beforeRevision: z.string().uuid(),
    afterRevision: z.string().uuid(),
    beforeDirectoryName: z.string(),
    afterDirectoryName: z.string(),
    beforeCleanupFiles: cleanupFilesSchema.optional(),
    rollbackCleanupFiles: cleanupFilesSchema.optional(),
});

/** Rename recovery checks folder locations; replacement also verifies contents.
 * Older rename records may contain fingerprints, which are no longer needed.
 */
const legacySwitchJournalSchema = z.discriminatedUnion('kind', [
    switchJournalBase.extend({ kind: z.literal('rename') }),
    switchJournalBase.extend({
        kind: z.literal('replace'),
        beforeFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        afterFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    }),
]);

const metadataFileSchema = cleanupFileSchema.omit({ hash: true }).extend({
    metadata: z.object({
        mtimeMs: z.number().finite(),
        ctimeMs: z.number().finite(),
        ino: z.number().finite().nonnegative(),
        dev: z.number().finite().nonnegative(),
    }),
});
const packageSnapshotSchema = z.object({
    directory: z.object({
        ino: z.number().finite().nonnegative(),
        dev: z.number().finite().nonnegative(),
    }),
    files: z
        .array(metadataFileSchema)
        .refine(
            (files) =>
                new Set(files.map((file) => file.relative)).size ===
                files.length,
        ),
});

/** Reads legacy content-checked switches and new folder moves with metadata checks. */
export const switchJournalSchema = z.union([
    legacySwitchJournalSchema,
    switchJournalBase
        .omit({
            version: true,
            beforeCleanupFiles: true,
            rollbackCleanupFiles: true,
        })
        .extend({
            version: z.literal(2),
            kind: z.literal('replace'),
            beforeSnapshot: packageSnapshotSchema,
            afterSnapshot: packageSnapshotSchema,
        }),
]);

export type SwitchPackageSnapshot = z.infer<typeof packageSnapshotSchema>;
export type SwitchJournal = z.infer<typeof switchJournalSchema>;
