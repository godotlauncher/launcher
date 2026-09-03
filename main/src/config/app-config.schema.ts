import { z } from 'zod';

export const AppPathsSchema = z.object({
    dataDir: z.string(),
    configDir: z.string(),
    projectDir: z.string(),
    prefsPath: z.string(),
    releaseCachePath: z.string(),
    installedReleasesCachePath: z.string(),
    prereleaseCachePath: z.string(),
    migrationStatePath: z.string(),
});

export const AppConfigSchema = z.object({
    appName: z.string(),
    isDev: z.boolean(),
    debugMode: z.boolean(),
    disableSandbox: z.boolean(),
    disableDevMenu: z.boolean(),
    startHidden: z.boolean(),
    e2eFixtures: z.boolean(),
    useLocalGitHubBroker: z.boolean().default(false),
    paths: AppPathsSchema,
});

export type AppPaths = z.infer<typeof AppPathsSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
