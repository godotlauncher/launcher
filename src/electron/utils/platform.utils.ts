import { exec } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { app } from 'electron';
import logger from 'electron-log';
import which from 'which';
import type { SetAutoStartResult } from '../../types/index.js';
import {
    getUserPreferences,
    setUserPreferences,
} from '../commands/userPreferences.js';
import {
    APP_INTERNAL_NAME,
    INSTALLED_RELEASES_FILENAME,
    MIGRATIONS_FILENAME,
    PREFS_FILENAME,
    PRERELEASES_FILENAME,
    RELEASES_FILENAME,
} from '../constants.js';
import { isDev } from '../utils.js';

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
    // Select the correct path module based on the platform
    // this is to make the function testable on all platforms
    // by mocking the os.platform() function and the path module

    const platform = os.platform();
    const pathModule = platform === 'win32' ? path.win32 : path.posix;
    const homedir = os.homedir();

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
        prefsPath,
        dataDir,
        configDir,
        projectDir,
        releaseCachePath,
        prereleaseCachePath,
        installedReleasesCachePath,
        migrationStatePath,
    };
}

export async function findExecutable(command: string): Promise<string | null> {
    logger.debug(`Searching for ${command} executable...`);

    const commandPath = await which(command, { nothrow: true });
    return commandPath;
}

export async function getCommandVersion(commandPath: string): Promise<string> {
    if (!commandPath) {
        return '';
    }

    return new Promise((resolve) => {
        exec(`${commandPath} --version`, (error, stdout) => {
            if (error) {
                resolve('');
            } else {
                resolve(stdout.split('\n')[0].trim());
            }
        });
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

