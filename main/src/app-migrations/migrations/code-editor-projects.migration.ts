import {
    AppMigration,
    type AppMigrationRunnable,
} from '@mariodebono/di-app-migrations';
import { migrateCodeEditorProjects } from '../code-editor-persistence.util.js';

export const MIGRATE_CODE_EDITOR_PROJECTS_ID =
    '2026-07-migrate-code-editor-projects';

@AppMigration({
    id: MIGRATE_CODE_EDITOR_PROJECTS_ID,
    fatal: false,
    description: 'Canonicalize project code editor selections.',
})
export class MigrateCodeEditorProjectsMigration
    implements AppMigrationRunnable
{
    async execute(): Promise<void> {
        await migrateCodeEditorProjects();
    }
}
