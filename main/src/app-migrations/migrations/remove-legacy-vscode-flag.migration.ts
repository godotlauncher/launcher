import {
    AppMigration,
    type AppMigrationRunnable,
} from '@mariodebono/di-app-migrations';
import { migrateCodeEditorProjects } from '../code-editor-persistence.util.js';

export const REMOVE_LEGACY_VSCODE_FLAG_ID = '2026-09-remove-legacy-vscode-flag';

@AppMigration({
    id: REMOVE_LEGACY_VSCODE_FLAG_ID,
    fatal: false,
    description: 'Remove the legacy VS Code project flag.',
})
export class RemoveLegacyVSCodeFlagMigration implements AppMigrationRunnable {
    /** Removes the persisted mirror while preserving code editor selections. */
    async execute(): Promise<void> {
        await migrateCodeEditorProjects();
    }
}
