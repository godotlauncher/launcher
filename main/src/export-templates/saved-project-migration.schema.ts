import { z } from 'zod';

const buildSchema = z.object({
    id: z.string().uuid(),
    revision: z.string().uuid(),
    directoryName: z.string(),
    label: z.string(),
    setId: z.string().regex(/^\d+\.\d+(?:\.\d+)?\.[a-zA-Z][\w.-]*$/),
    importedAt: z.string(),
    archiveName: z.string(),
    files: z.array(z.string()),
    sizeBytes: z.number().nonnegative(),
});

export const savedProjectMigrationSchema = z.object({
    version: z.literal(1),
    projectPath: z.string(),
    launchPath: z.string(),
    localPath: z.string(),
    builds: z.array(
        z.object({
            build: buildSchema,
            fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
        }),
    ),
});
