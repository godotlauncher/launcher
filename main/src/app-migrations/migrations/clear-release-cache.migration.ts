import {
    AppMigration,
    type AppMigrationRunnable,
} from '@mariodebono/di-app-migrations';
import { clearReleaseCaches } from '../../commands/releases.js';

export const CLEAR_RELEASE_CACHE_MIGRATION_ID = '2024-11-clear-release-cache';

@AppMigration({
    id: CLEAR_RELEASE_CACHE_MIGRATION_ID,
    fatal: false,
    description:
        'Rebuild release caches to ensure Windows ARM64 assets are available.',
})
export class ClearReleaseCacheMigration implements AppMigrationRunnable {
    async execute(): Promise<void> {
        await clearReleaseCaches();
    }
}
