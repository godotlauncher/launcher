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

export const REMOVE_LEGACY_INSTALLED_TOOLS_PREFERENCE_ID =
    '2026-08-remove-legacy-installed-tools-preference';

@AppMigration({
    id: REMOVE_LEGACY_INSTALLED_TOOLS_PREFERENCE_ID,
    fatal: false,
    description: 'Remove the retired installed tools preference cache.',
})
export class RemoveLegacyInstalledToolsPreferenceMigration
    implements AppMigrationRunnable
{
    /** Removes the legacy cache while preserving unrelated preferences. */
    async execute(): Promise<void> {
        const prefsPath = await getPrefsPath();
        const defaultPrefs = await getDefaultPrefs();
        const { stored } = await readPrefsSnapshotFromDisk(
            prefsPath,
            defaultPrefs,
        );

        if (!Object.hasOwn(stored, 'installed_tools')) {
            return;
        }

        const {
            installed_tools: _legacyInstalledTools,
            ...remainingPreferences
        } = stored;
        await writePrefsToDisk(prefsPath, remainingPreferences);
    }
}
