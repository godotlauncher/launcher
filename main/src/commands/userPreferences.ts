import type { UserPreferences } from '@shared/contracts';
import { getDefaultDirs } from '../utils/platform.utils.js';
import {
    getDefaultPrefs,
    readPrefsSnapshotFromDisk,
    type StoredUserPreferences,
    writePrefsToDisk,
} from '../utils/prefs.utils.js';

function migrateUserPreferences(
    prefs: UserPreferences,
    storedPrefs: StoredUserPreferences,
    defaultPrefs: UserPreferences,
): { updated: boolean; value: UserPreferences } {
    let updated = false;
    const nextPrefs: UserPreferences = { ...prefs };
    const storedPrefsVersion = storedPrefs.prefs_version ?? 0;

    if (storedPrefsVersion < 4) {
        nextPrefs.prefs_version = 4;
        updated = true;
    }

    if (typeof nextPrefs.windows_enable_symlinks === 'undefined') {
        nextPrefs.windows_enable_symlinks =
            defaultPrefs.windows_enable_symlinks;
        updated = true;
    }

    if (typeof nextPrefs.receive_beta_updates === 'undefined') {
        nextPrefs.receive_beta_updates = defaultPrefs.receive_beta_updates;
        updated = true;
    }

    if (
        nextPrefs.skipped_app_update_version !== undefined &&
        typeof nextPrefs.skipped_app_update_version !== 'string'
    ) {
        nextPrefs.skipped_app_update_version = undefined;
        updated = true;
    }

    const legacyVSCodePath = storedPrefs.vs_code_path?.trim();
    const vscodeIntegration = nextPrefs.code_editor_integrations?.vscode;
    if (
        storedPrefsVersion < 4 &&
        legacyVSCodePath &&
        !vscodeIntegration?.executable_path?.trim()
    ) {
        nextPrefs.code_editor_integrations = {
            ...nextPrefs.code_editor_integrations,
            vscode: {
                ...vscodeIntegration,
                enabled: vscodeIntegration?.enabled ?? true,
                executable_path: legacyVSCodePath,
            },
        };
        updated = true;
    }

    return { updated, value: nextPrefs };
}

export async function getUserPreferences(): Promise<UserPreferences> {
    const { prefsPath } = getDefaultDirs();

    const defaultPrefs = await getDefaultPrefs();
    const prefs = await readPrefsSnapshotFromDisk(prefsPath, defaultPrefs);
    const migrated = migrateUserPreferences(
        prefs.merged,
        prefs.stored,
        defaultPrefs,
    );

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
