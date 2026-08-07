import { Module } from '@mariodebono/di';
import { AppMigrationsModule as DiAppMigrationsModule } from '@mariodebono/di-app-migrations';
import { LauncherAppMigrationStore } from './app-migration.store.js';
import { ClearReleaseCacheMigration } from './migrations/clear-release-cache.migration.js';
import { MigrateCodeEditorPreferencesMigration } from './migrations/code-editor-preferences.migration.js';
import { MigrateCodeEditorProjectsMigration } from './migrations/code-editor-projects.migration.js';
import { RemoveWindowsSymlinkNoticePreferenceMigration } from './migrations/remove-windows-symlink-notice-preference.migration.js';

@Module({
    imports: [
        DiAppMigrationsModule.forRoot({
            store: LauncherAppMigrationStore,
        }),
    ],
    providers: [
        ClearReleaseCacheMigration,
        MigrateCodeEditorPreferencesMigration,
        MigrateCodeEditorProjectsMigration,
        RemoveWindowsSymlinkNoticePreferenceMigration,
    ],
})
export class AppMigrationsModule {}
