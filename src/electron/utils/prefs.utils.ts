import logger from 'electron-log';
import { getMainWindow } from '../main.js';
import { dialog } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

import { startAutoUpdateChecks, stopAutoUpdateChecks } from '../autoUpdater.js';
import { getUserPreferences, setUserPreferences } from '../commands/userPreferences.js';
import { getDefaultDirs } from './platform.utils.js';

const loadedPrefs: UserPreferences | null = null;
type CachedPrefs = {
    value: UserPreferences;
    hash: string;
};

const prefsCache = new Map<string, CachedPrefs>();
const writeQueue = new Map<string, Promise<void>>();

function clonePrefs<T>(prefs: T): T {
    return JSON.parse(JSON.stringify(prefs));
}

function hashPrefs(prefs: UserPreferences): string {
    return createHash('md5').update(JSON.stringify(prefs)).digest('hex');
}

async function waitForPendingWrite(prefsPath: string): Promise<void> {
    const pending = writeQueue.get(prefsPath);
    if (!pending) {
        return;
    }

    try {
        await pending;
    } catch (error) {
        logger.error('Failed to persist user preferences', error);
    }
}

function enqueueWrite(prefsPath: string, action: () => Promise<void>): Promise<void> {
    const previous = writeQueue.get(prefsPath) ?? Promise.resolve();
    const finalPromise = previous
        .catch(() => undefined)
        .then(action)
        .finally(() => {
            if (writeQueue.get(prefsPath) === finalPromise) {
                writeQueue.delete(prefsPath);
            }
        });

    writeQueue.set(prefsPath, finalPromise);
    return finalPromise;
}

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
        prefs_version: 3,
        install_location: pathModule.resolve(defaultPrefs.dataDir),
        config_location: pathModule.resolve(defaultPrefs.configDir),
        projects_location: pathModule.resolve(defaultPrefs.projectDir),
        post_launch_action: 'close_to_tray',
        auto_check_updates: true,
        auto_start: true,
        start_in_tray: true,
        confirm_project_remove: true,
        first_run: true,
        windows_enable_symlinks: false,
        windows_symlink_win_notify: platform === 'win32' ? false : true,
        vs_code_path: '',
        language: 'system', // Default to system language detection
    };
}

export async function readPrefsFromDisk(prefsPath: string, defaultPrefs: UserPreferences): Promise<UserPreferences> {
    await waitForPendingWrite(prefsPath);

    const cached = prefsCache.get(prefsPath);
    if (cached) {
        return clonePrefs(cached.value);
    }

    if (!fs.existsSync(prefsPath)) {
        const cachedDefaults = clonePrefs(defaultPrefs);
        prefsCache.set(prefsPath, { value: cachedDefaults, hash: hashPrefs(cachedDefaults) });
        return clonePrefs(cachedDefaults);
    }

    // Read prefs from disk
    const prefsData = await fs.promises.readFile(prefsPath, 'utf-8');
    let mergedPrefs = clonePrefs(defaultPrefs);
    try {
        const prefs = JSON.parse(prefsData);
        mergedPrefs = { ...defaultPrefs, ...prefs };
    } catch (e) {
        logger.debug('Could not parse user preferences, using defaults', e);
        logger.debug('Corrupted preferences data:', prefsData);
        // todo: translate message
        await dialog.showMessageBox(getMainWindow(), {
            type: 'error',
            title: 'Error reading preferences',
            message: 'Could not parse user preferences. Using default preferences.',
            buttons: ['OK'],
        });
    }

    const cachedPrefs = clonePrefs(mergedPrefs);
    prefsCache.set(prefsPath, { value: cachedPrefs, hash: hashPrefs(cachedPrefs) });
    return clonePrefs(cachedPrefs);
}

export async function writePrefsToDisk(prefsPath: string, prefs: UserPreferences): Promise<void> {
    const existing = prefsCache.get(prefsPath);
    const normalizedPrefs = clonePrefs(prefs);
    const newHash = hashPrefs(normalizedPrefs);

    if (existing && existing.hash === newHash) {
        await waitForPendingWrite(prefsPath);
        return;
    }

    prefsCache.set(prefsPath, { value: normalizedPrefs, hash: newHash });

    // Write prefs to disk
    const prefsData = JSON.stringify(normalizedPrefs, null, 4);
    const writePromise = enqueueWrite(prefsPath, async () => {
        await fs.promises.writeFile(prefsPath, prefsData, 'utf-8');
    });

    await writePromise;
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

export function __resetPrefsCacheForTesting(): void {
    prefsCache.clear();
    writeQueue.clear();
}
