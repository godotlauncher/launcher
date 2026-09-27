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
export const switchJournalSchema = z.discriminatedUnion('kind', [
    switchJournalBase.extend({ kind: z.literal('rename') }),
    switchJournalBase.extend({
        kind: z.literal('replace'),
        beforeFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        afterFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    }),
]);

export type SwitchJournal = z.infer<typeof switchJournalSchema>;
