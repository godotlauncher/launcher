import semver from 'semver';

import { clearReleaseCaches } from '../commands/releases.js';
import type { MigrationRegistry } from './types.js';

export const CLEAR_RELEASE_CACHE_MIGRATION_ID = '2024-11-clear-release-cache';

function normalizeVersion(version: string): string {
    const coerced = semver.coerce(version);
    if (!coerced) {
        return '0.0.0';
    }

    return coerced.version;
}

export const migrations = [
    {
        id: CLEAR_RELEASE_CACHE_MIGRATION_ID,
        description:
            'Rebuild release caches to ensure Windows ARM64 assets are available.',
        options: {
            targetVersion: '1.6.1',
        },
        predicate: ({ currentVersion, lastSeenVersion, options }) => {
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
        },
        run: async (context) => {
            void context;
            await clearReleaseCaches();
            return {
                id: CLEAR_RELEASE_CACHE_MIGRATION_ID,
                status: 'completed' as const,
            };
        },
    },
] as const satisfies MigrationRegistry;
