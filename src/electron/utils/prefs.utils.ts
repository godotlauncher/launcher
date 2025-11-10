import * as os from 'node:os';
import * as path from 'node:path';
import { dialog } from 'electron';
import logger from 'electron-log';
import type { UserPreferences } from '../../types/index.js';
import { startAutoUpdateChecks, stopAutoUpdateChecks } from '../autoUpdater.js';
import {
    getUserPreferences,
    setUserPreferences,
} from '../commands/userPreferences.js';
import { t } from '../i18n/index.js';
import { getMainWindow } from '../main.js';
import { __resetJsonStoreForTesting } from './jsonStore.js';
import {
    __resetJsonStoreFactoryForTesting,
    createTypedJsonStore,
    type TypedJsonStore,
} from './jsonStoreFactory.js';
import { getDefaultDirs } from './platform.utils.js';

type StoredUserPreferences = Partial<UserPreferences>;

let prefsPathCache: string | null = null;
let prefsStore: TypedJsonStore<StoredUserPreferences> | null = null;

function clonePrefs<T>(prefs: T): T {
    if (prefs === undefined || prefs === null) {
        return prefs;
    }
    return JSON.parse(JSON.stringify(prefs));
}

function mergeWithDefaults(
    defaultPrefs: UserPreferences,
    prefs: StoredUserPreferences,
): UserPreferences {
    return {
        ...clonePrefs(defaultPrefs),
        ...clonePrefs(prefs),
    };
}

function resolvePrefsPath(pathOverride?: string): string {
    if (pathOverride) {
        prefsPathCache = pathOverride;
        return pathOverride;
    }

    if (!prefsPathCache) {
        const defaultPaths = getDefaultDirs();
        prefsPathCache = defaultPaths.prefsPath;
    }

    return prefsPathCache;
}

async function showPreferencesParseError(
    raw: string,
    error: unknown,
): Promise<void> {
    logger.debug('Could not parse user preferences, using defaults', error);
    logger.debug('Corrupted preferences data:', raw);
    try {
        await dialog.showMessageBox(getMainWindow(), {
            type: 'error',
            title: t('dialogs:preferencesError.title'),
            message: t('dialogs:preferencesError.message'),
            buttons: ['OK'],
        });
    } catch (dialogError) {
        logger.error('Failed to show preferences error dialog', dialogError);
    }
}

function ensurePrefsStore(
    pathOverride?: string,
): TypedJsonStore<StoredUserPreferences> {
    const resolvedPath = resolvePrefsPath(pathOverride);
    if (prefsStore && prefsPathCache === resolvedPath) {
        return prefsStore;
    }

    prefsStore = createTypedJsonStore<StoredUserPreferences>({
        id: `user-preferences:${resolvedPath}`,
        logLabel: 'user preferences',
        pathProvider: () => resolvedPath,
        defaultValue: async () => ({}) as StoredUserPreferences,
        onParseError: async (error, raw) => {
            await showPreferencesParseError(raw, error);
            return {} as StoredUserPreferences;
        },
    });

    return prefsStore;
}

export async function getPrefsPath(): Promise<string> {
    return resolvePrefsPath();
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
        windows_symlink_win_notify: platform !== 'win32',
        vs_code_path: '',
        language: 'system', // Default to system language detection
    };
}

export async function readPrefsFromDisk(
    prefsPath: string,
    defaultPrefs: UserPreferences,
): Promise<UserPreferences> {
    const store = ensurePrefsStore(prefsPath);
    const storedPrefs = await store.read();
    const merged = mergeWithDefaults(defaultPrefs, storedPrefs);
    return clonePrefs(merged);
}

export async function writePrefsToDisk(
    prefsPath: string,
    prefs: UserPreferences,
): Promise<void> {
    const store = ensurePrefsStore(prefsPath);
    await store.write(clonePrefs(prefs));
}

export async function getLoadedPrefs(): Promise<UserPreferences> {
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
    } else {
        stopAutoUpdateChecks();
    }

    return enabled;
}

export function __resetPrefsCacheForTesting(): void {
    prefsStore = null;
    prefsPathCache = null;
    __resetJsonStoreFactoryForTesting();
    __resetJsonStoreForTesting();
}
