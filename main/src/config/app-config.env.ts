import { z } from 'zod';

const BooleanFromEnvSchema = z.preprocess((value) => {
    if (typeof value !== 'string') {
        return value;
    }

    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === 'true' || normalizedValue === '1') {
        return true;
    }
    if (normalizedValue === 'false' || normalizedValue === '0') {
        return false;
    }

    return value;
}, z.boolean().optional().catch(undefined));

export const AppEnvConfigSchema = z.object({
    NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .optional()
        .catch(undefined),
    GODOT_LAUNCHER_DISABLE_SANDBOX: BooleanFromEnvSchema,
    GODOT_LAUNCHER_NO_DEV_MENU: BooleanFromEnvSchema,
    GODOT_LAUNCHER_DOCS_SCREENSHOTS: BooleanFromEnvSchema,
});

export type AppEnvConfig = z.infer<typeof AppEnvConfigSchema>;

export function parseProcessEnv(
    env: NodeJS.ProcessEnv = process.env,
): AppEnvConfig {
    return AppEnvConfigSchema.parse(env);
}
