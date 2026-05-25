import * as os from 'node:os';
import * as path from 'node:path';
import {
    APP_INTERNAL_NAME,
    INSTALLED_RELEASES_FILENAME,
    MIGRATIONS_FILENAME,
    PREFS_FILENAME,
    PRERELEASES_FILENAME,
    RELEASES_FILENAME,
} from '../constants.js';
import { parseCliArgs } from './app-config.cli.js';
import { parseProcessEnv } from './app-config.env.js';
import {
    type AppConfig,
    AppConfigSchema,
    type AppPaths,
} from './app-config.schema.js';

export type ResolveAppConfigOptions = {
    args?: string[];
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    homedir?: string;
};

export type ResolveAppPathsOptions = {
    platform?: NodeJS.Platform;
    homedir?: string;
};

export function resolveAppPaths(
    options: ResolveAppPathsOptions = {},
): AppPaths {
    const platform = options.platform ?? os.platform();
    const pathModule = platform === 'win32' ? path.win32 : path.posix;
    const homedir = options.homedir ?? os.homedir();

    const configDir = pathModule.resolve(homedir, `.${APP_INTERNAL_NAME}`);
    const dataDir = pathModule.resolve(homedir, 'Godot', 'Editors');
    const projectDir = pathModule.resolve(homedir, 'Godot', 'Projects');
    const prefsPath = pathModule.resolve(configDir, PREFS_FILENAME);
    const releaseCachePath = pathModule.resolve(configDir, RELEASES_FILENAME);
    const prereleaseCachePath = pathModule.resolve(
        configDir,
        PRERELEASES_FILENAME,
    );
    const installedReleasesCachePath = pathModule.resolve(
        configDir,
        INSTALLED_RELEASES_FILENAME,
    );
    const migrationStatePath = pathModule.resolve(
        configDir,
        MIGRATIONS_FILENAME,
    );

    return {
        dataDir,
        configDir,
        projectDir,
        prefsPath,
        releaseCachePath,
        installedReleasesCachePath,
        prereleaseCachePath,
        migrationStatePath,
    };
}

export function configuration(
    options: ResolveAppConfigOptions = {},
): AppConfig {
    const envConfig = parseProcessEnv(options.env ?? process.env);
    const cliConfig = parseCliArgs(options.args ?? process.argv);
    const nodeEnv = envConfig.NODE_ENV ?? 'production';
    const isDev = nodeEnv === 'development';

    return AppConfigSchema.parse({
        appName: 'Godot Launcher',
        nodeEnv,
        isDev,
        debugMode: isDev || (cliConfig.debug ?? false),
        disableSandbox:
            (envConfig.GODOT_LAUNCHER_DISABLE_SANDBOX ?? false) ||
            (cliConfig.disableSandbox ?? false),
        disableDevMenu:
            (envConfig.GODOT_LAUNCHER_NO_DEV_MENU ?? false) ||
            (cliConfig.disableDevMenu ?? false),
        startHidden: cliConfig.startHidden ?? false,
        docsScreenshots: envConfig.GODOT_LAUNCHER_DOCS_SCREENSHOTS ?? false,
        paths: resolveAppPaths({
            platform: options.platform,
            homedir: options.homedir,
        }),
    });
}
