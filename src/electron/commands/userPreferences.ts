import { getDefaultDirs } from '../utils/platform.utils.js';
import { getDefaultPrefs, readPrefsFromDisk, writePrefsToDisk } from '../utils/prefs.utils.js';

function migrateUserPreferences(
    prefs: UserPreferences,
    defaultPrefs: UserPreferences
): { updated: boolean; value: UserPreferences } {
    let updated = false;
    const nextPrefs: UserPreferences = { ...prefs };

    if (nextPrefs.prefs_version < 3) {
        nextPrefs.prefs_version = 3;
        updated = true;
    }

    if (typeof nextPrefs.windows_enable_symlinks === 'undefined') {
        nextPrefs.windows_enable_symlinks = defaultPrefs.windows_enable_symlinks;
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
    prefs: UserPreferences
): Promise<UserPreferences> {

    const { prefsPath } = getDefaultDirs();

    await writePrefsToDisk(prefsPath, prefs);
    return prefs;
}
