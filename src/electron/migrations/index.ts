import logger from 'electron-log';

import { getDefaultDirs } from '../utils/platform.utils.js';
import { migrations } from './registry.js';
import { loadMigrationState, saveMigrationState } from './state.js';
import type {
    Migration,
    MigrationContext,
    MigrationExecutionContext,
    MigrationResult,
} from './types.js';

function hasCompleted(state: readonly string[], migration: Migration): boolean {
    return state.includes(migration.id);
}

async function evaluatePredicate(
    migration: Migration,
    context: MigrationExecutionContext,
): Promise<boolean> {
    if (!migration.predicate) {
        return true;
    }

    const result = await migration.predicate(context);
    return Boolean(result);
}

function assertMigrationResult(
    migration: Migration,
    outcome: MigrationResult | void,
): void {
    const normalizedStatus = outcome?.status ?? 'completed';
    if (normalizedStatus === 'failed') {
        const message =
            outcome?.message ?? `Migration ${migration.id} reported failure`;
        throw new Error(message);
    }
}

export async function runMigrations(appVersion: string): Promise<void> {
    const { migrationStatePath } = getDefaultDirs();
    const state = await loadMigrationState(migrationStatePath);

    if (!migrations.length) {
        if (state.lastSeenVersion !== appVersion) {
            state.lastSeenVersion = appVersion;
            await saveMigrationState(migrationStatePath, state);
        }
        return;
    }

    const initialLastSeenVersion = state.lastSeenVersion;
    const context: MigrationContext = {
        currentVersion: appVersion,
        lastSeenVersion: initialLastSeenVersion,
    };

    let completedAny = false;

    for (const migration of migrations) {
        if (hasCompleted(state.completed, migration)) {
            logger.debug(
                `Migration ${migration.id} already completed, skipping`,
            );
            continue;
        }

        const executionContext: MigrationExecutionContext = {
            ...context,
            ...(migration.options ? { options: migration.options } : {}),
        };

        let shouldRun: boolean;
        try {
            shouldRun = await evaluatePredicate(migration, executionContext);
        } catch (error) {
            logger.error(
                `Migration predicate for ${migration.id} threw`,
                error,
            );
            throw error;
        }

        if (!shouldRun) {
            logger.debug(
                `Migration ${migration.id} predicate returned false, skipping`,
            );
            continue;
        }

        try {
            logger.info(`Running migration ${migration.id}`);
            const result = await migration.run(executionContext);
            assertMigrationResult(migration, result);
            state.completed.push(migration.id);
            completedAny = true;
            await saveMigrationState(migrationStatePath, state);
            logger.info(`Migration ${migration.id} completed successfully`);
        } catch (error) {
            logger.error(`Migration ${migration.id} failed`, error);
            await saveMigrationState(migrationStatePath, state);
            throw error;
        }
    }

    if (completedAny || state.lastSeenVersion !== appVersion) {
        state.lastSeenVersion = appVersion;
        await saveMigrationState(migrationStatePath, state);
    }
}
