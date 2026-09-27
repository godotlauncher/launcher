import { z } from 'zod';

const entrySchema = z.object({
    relative: z.string().min(1),
    type: z.enum(['directory', 'file']),
    size: z.number().int().nonnegative(),
    mode: z.number().int().nonnegative(),
    hash: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
});
const projectLinkSchema = z.object({
    link: z.string(),
    before: z.string(),
    after: z.string(),
});
export const templateStorageJournalSchema = z.object({
    id: z.uuid(),
    kind: z.enum(['official', 'imported']),
    source: z.string(),
    canonical: z.string(),
    destination: z.string(),
    backup: z.string(),
    destinationCreated: z.boolean(),
    restore: z.boolean().optional().default(false),
    entries: z.array(entrySchema),
    projectLinks: z.array(projectLinkSchema).optional().default([]),
    phase: z.enum(['copying', 'verified', 'switching', 'linked']),
});
export const templateStorageSavedSchema = z.object({
    official: z.string().optional(),
    imported: z.string().optional(),
    importedBootstrapIssue: z.boolean().optional(),
    officialWorkRoots: z.array(z.string()).optional(),
    managedRoots: z.array(z.string()).optional(),
});
