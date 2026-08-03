import semver from 'semver';

import { clearReleaseCaches } from '../commands/releases.js';
import {
    migrateCodeEditorPreferences,
    migrateCodeEditorProjects,
} from './codeEditorPersistence.js';
import type { MigrationExecutionContext, MigrationRegistry } from './types.js';

export const CLEAR_RELEASE_CACHE_MIGRATION_ID = '2024-11-clear-release-cache';
export const MIGRATE_CODE_EDITOR_PREFERENCES_ID =
    '2026-07-migrate-code-editor-preferences';
export const MIGRATE_CODE_EDITOR_PROJECTS_ID =
    '2026-07-migrate-code-editor-projects';

function normalizeVersion(version: string): string {
    const coerced = semver.coerce(version);
    if (!coerced) {
        return '0.0.0';
    }

    return coerced.version;
}

function isTargetVersionUpgrade({
    currentVersion,
    lastSeenVersion,
    options,
}: MigrationExecutionContext): boolean {
    const normalizedCurrent = normalizeVersion(currentVersion);
    const normalizedPrevious = normalizeVersion(lastSeenVersion);
    const targetVersion =
        typeof options?.targetVersion === 'string'
            ? options.targetVersion
            : '0.0.0';
    const normalizedTarget = normalizeVersion(targetVersion);

    return (
        semver.gte(normalizedCurrent, normalizedTarget) &&
        semver.lt(normalizedPrevious, normalizedTarget)
    );
}

export const migrations = [
    {
        id: CLEAR_RELEASE_CACHE_MIGRATION_ID,
        description:
            'Rebuild release caches to ensure Windows ARM64 assets are available.',
        options: {
            targetVersion: '1.6.1',
        },
        predicate: isTargetVersionUpgrade,
        run: async (context) => {
            void context;
            await clearReleaseCaches();
            return {
                id: CLEAR_RELEASE_CACHE_MIGRATION_ID,
                status: 'completed' as const,
            };
        },
    },
    {
        id: MIGRATE_CODE_EDITOR_PREFERENCES_ID,
        description: 'Canonicalize code editor preferences.',
        options: { targetVersion: '1.11.0' },
        predicate: isTargetVersionUpgrade,
        run: async () => {
            await migrateCodeEditorPreferences();
            return {
                id: MIGRATE_CODE_EDITOR_PREFERENCES_ID,
                status: 'completed' as const,
            };
        },
    },
    {
        id: MIGRATE_CODE_EDITOR_PROJECTS_ID,
        description: 'Canonicalize project code editor selections.',
        options: { targetVersion: '1.11.0' },
        predicate: isTargetVersionUpgrade,
        run: async () => {
            await migrateCodeEditorProjects();
            return {
                id: MIGRATE_CODE_EDITOR_PROJECTS_ID,
                status: 'completed' as const,
            };
        },
    },
] as const satisfies MigrationRegistry;
