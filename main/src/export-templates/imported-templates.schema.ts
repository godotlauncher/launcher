import { z } from 'zod';
import { isPortablePathSegment } from '../utils/portable-path.util.js';

export const importedTemplateIdentitySchema = z
    .string()
    .regex(/^\d+\.\d+(?:\.\d+)?\.[a-zA-Z][\w.-]*$/);

export const importedTemplateLibrarySchema = z.object({
    schemaVersion: z.literal(1),
    builds: z.array(
        z.object({
            id: z.string().uuid(),
            revision: z.string().uuid(),
            directoryName: z.string().refine(isPortablePathSegment),
            label: z.string().trim().min(1).max(80),
            setId: importedTemplateIdentitySchema,
            importedAt: z.string(),
            archiveName: z.string(),
            files: z.array(z.string()),
            sizeBytes: z.number().nonnegative(),
        }),
    ),
});
