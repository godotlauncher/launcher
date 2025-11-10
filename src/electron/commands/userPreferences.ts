import * as os from 'node:os';
import { getDefaultDirs } from '../utils/platform.utils.js';
import {
    getDefaultPrefs,
    readPrefsFromDisk,
    writePrefsToDisk,
} from '../utils/prefs.utils.js';

function migrateUserPreferences(
    prefs: UserPreferences,
    defaultPrefs: UserPreferences,
): { updated: boolean; value: UserPreferences } {
    let updated = false;
    const nextPrefs: UserPreferences = { ...prefs };
    const platform = os.platform();

    if (nextPrefs.prefs_version < 3) {
        nextPrefs.prefs_version = 3;
        updated = true;
    }

    if (typeof nextPrefs.windows_enable_symlinks === 'undefined') {
        nextPrefs.windows_enable_symlinks =
            defaultPrefs.windows_enable_symlinks;
        updated = true;
    }

    if (typeof nextPrefs.windows_symlink_win_notify === 'undefined') {
        const receivedWindowsPrefsUpgrade =
            platform === 'win32' && prefs.prefs_version < 3;
        nextPrefs.windows_symlink_win_notify = receivedWindowsPrefsUpgrade
            ? false
            : defaultPrefs.windows_symlink_win_notify;
        updated = true;
    }

    return { updated, value: nextPrefs };
}

export async function getUserPreferences(): Promise<UserPreferences> {
    const { prefsPath } = getDefaultDirs();

    const defaultPrefs = await getDefaultPrefs();
    const prefs = await readPrefsFromDisk(prefsPath, defaultPrefs);
    const migrated = migrateUserPreferences(prefs, defaultPrefs);

    if (migrated.updated) {
        await writePrefsToDisk(prefsPath, migrated.value);
    }

    return migrated.value;
}

export async function setUserPreferences(
    prefs: UserPreferences,
): Promise<UserPreferences> {
    const { prefsPath } = getDefaultDirs();

    await writePrefsToDisk(prefsPath, prefs);
    return prefs;
}
