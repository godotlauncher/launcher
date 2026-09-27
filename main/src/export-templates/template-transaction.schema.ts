import { z } from 'zod';
import { isTemplateIdentity } from './template-files.util.js';
import { isLocalTemplatePath } from './template-local-path.util.js';

export const templateJournalSchema = z.object({
    version: z.literal(2),
    phase: z.enum(['committing', 'complete']),
    projectPath: z.string().optional(),
    localPath: z.string().refine(isLocalTemplatePath).optional(),
    sourceHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    metadataOnly: z.boolean().optional(),
    operation: z.enum(['detach', 'local']).optional(),
    afterHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
    localExisted: z.boolean().optional(),
    retainBackup: z.boolean().optional(),
    discardBackup: z.boolean().optional(),
    backupBytes: z.number().nonnegative().optional(),
    sets: z.array(
        z.object({
            id: z.string().refine(isTemplateIdentity),
            existed: z.boolean(),
            before: z.string().regex(/^[a-f0-9]{64}$/),
            after: z
                .string()
                .regex(/^[a-f0-9]{64}$/)
                .nullable(),
        }),
    ),
});
export type TemplateJournal = z.infer<typeof templateJournalSchema>;
