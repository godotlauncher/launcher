import { execFile } from 'node:child_process';
import type { SetAutoStartResult } from '@shared';
import { app } from 'electron';
import logger from 'electron-log';
import which from 'which';
import {
    getUserPreferences,
    setUserPreferences,
} from '../commands/userPreferences.js';
import {
    getCurrentAppConfigIfInitialized,
    resolveAppPaths,
} from '../config/index.js';
import { isDev } from '../utils.js';

const COMMAND_VERSION_TIMEOUT_MS = 3000;
const FIND_EXECUTABLE_TIMEOUT_MS = 3000;

/**
 * Returns default data/config directories for an app, based on the given platform.
 *
 * - dataDir  : Large user-specific data (e.g. downloaded Godot binaries).
 * - configDir: Small user-specific configs/preferences.
 *
 * @param platform A string from `os.platform()` e.g. "win32", "darwin", "linux"
 * @returns An object containing `dataDir` and `configDir`.
 */
export function getDefaultDirs(): {
    dataDir: string;
    configDir: string;
    projectDir: string;
    prefsPath: string;
    releaseCachePath: string;
    installedReleasesCachePath: string;
    prereleaseCachePath: string;
    migrationStatePath: string;
} {
    return getCurrentAppConfigIfInitialized()?.paths ?? resolveAppPaths();
}

export async function findExecutable(command: string): Promise<string | null> {
    logger.debug(`Searching for ${command} executable...`);

    let timeout: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<null>((resolve) => {
        timeout = setTimeout(() => {
            logger.debug(
                `Timed out searching for ${command} executable after ${FIND_EXECUTABLE_TIMEOUT_MS}ms`,
            );
            resolve(null);
        }, FIND_EXECUTABLE_TIMEOUT_MS);
    });

    try {
        return await Promise.race([
            which(command, { nothrow: true }),
            timeoutPromise,
        ]);
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }
}

export async function getCommandVersion(commandPath: string): Promise<string> {
    if (!commandPath) {
        return '';
    }

    return new Promise((resolve) => {
        execFile(
            commandPath,
            ['--version'],
            { timeout: COMMAND_VERSION_TIMEOUT_MS, windowsHide: true },
            (error, stdout) => {
                if (error) {
                    logger.debug(
                        `Failed to read command version for ${commandPath}`,
                        error,
                    );
                    resolve('');
                } else {
                    resolve(stdout.split('\n')[0].trim());
                }
            },
        );
    });
}

export async function setAutoStart(
    autoStart: boolean,
    hidden: boolean,
): Promise<SetAutoStartResult> {
    // ensure save in prefs
    const prefs = await getUserPreferences();
    await setUserPreferences({
        ...prefs,
        auto_start: autoStart,
        start_in_tray: hidden,
    });

    if (isDev()) {
        app.setLoginItemSettings({
            openAtLogin: false,
        });
    } else {
        logger.info(
            `Setting auto start to ${autoStart} and hidden to ${hidden}`,
        );
        app.setLoginItemSettings({
            openAtLogin: autoStart,
            args: [...(hidden ? ['--hidden'] : [])],
        });
    }
    return {
        success: true,
    };
}
