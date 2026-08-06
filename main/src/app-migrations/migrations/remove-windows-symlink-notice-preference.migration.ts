import {
    AppMigration,
    type AppMigrationRunnable,
} from '@mariodebono/di-app-migrations';
import {
    getDefaultPrefs,
    getPrefsPath,
    readPrefsSnapshotFromDisk,
    writePrefsToDisk,
} from '../../utils/prefs.utils.js';

export const REMOVE_WINDOWS_SYMLINK_NOTICE_PREFERENCE_ID =
    '2026-08-remove-windows-symlink-notice-preference';

@AppMigration({
    id: REMOVE_WINDOWS_SYMLINK_NOTICE_PREFERENCE_ID,
    fatal: false,
    description: 'Remove the retired Windows symlink notice preference.',
})
export class RemoveWindowsSymlinkNoticePreferenceMigration
    implements AppMigrationRunnable
{
    async execute(): Promise<void> {
        const prefsPath = await getPrefsPath();
        const defaultPrefs = await getDefaultPrefs();
        const { stored } = await readPrefsSnapshotFromDisk(
            prefsPath,
            defaultPrefs,
        );

        if (!Object.hasOwn(stored, 'windows_symlink_win_notify')) {
            return;
        }

        const {
            windows_symlink_win_notify: _retiredPreference,
            ...remainingPreferences
        } = stored;
        await writePrefsToDisk(prefsPath, remainingPreferences);
    }
}
