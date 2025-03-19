import { getDefaultDirs } from '../utils/platform.utils.js';
import { getDefaultPrefs, readPrefsFromDisk, writePrefsToDisk } from '../utils/prefs.utils.js';


export async function getUserPreferences(): Promise<UserPreferences> {

    const { prefsPath } = getDefaultDirs();

    const prefs = await readPrefsFromDisk(prefsPath, await getDefaultPrefs());
    return prefs;
}

export async function setUserPreferences(
    prefs: UserPreferences
): Promise<UserPreferences> {

    const { prefsPath } = getDefaultDirs();

    await writePrefsToDisk(prefsPath, prefs);
    return prefs;
}