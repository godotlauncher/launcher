import {
    AppMigration,
    type AppMigrationRunnable,
} from '@mariodebono/di-app-migrations';
import { migrateCodeEditorPreferences } from '../code-editor-persistence.util.js';

export const MIGRATE_CODE_EDITOR_PREFERENCES_ID =
    '2026-07-migrate-code-editor-preferences';

@AppMigration({
    id: MIGRATE_CODE_EDITOR_PREFERENCES_ID,
    fatal: false,
    description: 'Canonicalize code editor preferences.',
})
export class MigrateCodeEditorPreferencesMigration
    implements AppMigrationRunnable
{
    async execute(): Promise<void> {
        await migrateCodeEditorPreferences();
    }
}
