import logger from 'electron-log';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { startAutoUpdateChecks, stopAutoUpdateChecks } from '../autoUpdater.js';
import { getUserPreferences, setUserPreferences } from '../commands/userPreferences.js';
import { getDefaultDirs } from './platform.utils.js';

const loadedPrefs: UserPreferences | null = null;

export async function getPrefsPath(): Promise<string> {
    const defaultPaths = getDefaultDirs();
    return defaultPaths.prefsPath;
}

export async function getConfigDir(): Promise<string> {
    const defaultPaths = getDefaultDirs();
    return defaultPaths.configDir;
}

export async function getDefaultPrefs(): Promise<UserPreferences> {
    const defaultPrefs = getDefaultDirs();
    const platform = os.platform();
    const pathModule = platform === 'win32' ? path.win32 : path.posix;

    return {
        prefs_version: 2,
        install_location: pathModule.resolve(defaultPrefs.dataDir),
        config_location: pathModule.resolve(defaultPrefs.configDir),
        projects_location: pathModule.resolve(defaultPrefs.projectDir),
        post_launch_action: 'close_to_tray',
        auto_check_updates: true,
        auto_start: true,
        start_in_tray: true,
        confirm_project_remove: true,
        first_run: true,
        vs_code_path: '',

    };
}

export async function readPrefsFromDisk(prefsPath: string, defaultPrefs: UserPreferences): Promise<UserPreferences> {
    if (!fs.existsSync(prefsPath)) {
        // load defaults
        return defaultPrefs;
    }

    // Read prefs from disk
    const prefsData = await fs.promises.readFile(prefsPath, 'utf-8');
    try {
        const prefs = JSON.parse(prefsData);
        return { ...defaultPrefs, ...prefs };
    } catch (e) {
        logger.debug('Could not parse user preferences, using defaults', e);
        return defaultPrefs;
    }
}

export async function writePrefsToDisk(prefsPath: string, prefs: UserPreferences): Promise<void> {
    // Write prefs to disk
    const prefsData = JSON.stringify(prefs, null, 4);
    await fs.promises.writeFile(prefsPath, prefsData, 'utf-8');
}

export async function getLoadedPrefs(): Promise<UserPreferences> {

    if (loadedPrefs) {
        return loadedPrefs;
    }

    const prefsPath = await getPrefsPath();
    const defaultPrefs = await getDefaultPrefs();
    return readPrefsFromDisk(prefsPath, defaultPrefs);
}

export async function setAutoCheckUpdates(enabled: boolean): Promise<boolean> {
    // ensure save in prefs
    const prefs = await getUserPreferences();
    await setUserPreferences({ ...prefs, auto_check_updates: enabled });

    if (enabled) {
        startAutoUpdateChecks();
    }
    else {
        stopAutoUpdateChecks();
    }

    return enabled;

}
