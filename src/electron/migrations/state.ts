import logger from 'electron-log';
import { promises as fs } from 'node:fs';

import type { MigrationId } from './types.js';

export interface MigrationState {
    lastSeenVersion: string;
    completed: MigrationId[];
}

export const DEFAULT_MIGRATION_STATE: MigrationState = {
    lastSeenVersion: '0.0.0',
    completed: []
};

function normalizeState(candidate: unknown): MigrationState {
    if (!candidate || typeof candidate !== 'object') {
        return { ...DEFAULT_MIGRATION_STATE };
    }

    const record = candidate as Record<string, unknown>;
    const lastSeenVersion = typeof record.lastSeenVersion === 'string' && record.lastSeenVersion.trim()
        ? record.lastSeenVersion.trim()
        : DEFAULT_MIGRATION_STATE.lastSeenVersion;

    const completed = Array.isArray(record.completed)
        ? record.completed.filter((value): value is MigrationId => typeof value === 'string')
        : DEFAULT_MIGRATION_STATE.completed;

    return {
        lastSeenVersion,
        completed: [...new Set(completed)]
    };
}

export async function loadMigrationState(statePath: string): Promise<MigrationState> {
    try {
        const data = await fs.readFile(statePath, 'utf-8');
        const parsed = JSON.parse(data) as unknown;
        return normalizeState(parsed);
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err?.code === 'ENOENT') {
            logger.debug(`Migration state not found at ${statePath}, using defaults`);
            return { ...DEFAULT_MIGRATION_STATE };
        }

        logger.warn(`Failed to read migration state from ${statePath}, using defaults`, err);
        return { ...DEFAULT_MIGRATION_STATE };
    }
}

export async function saveMigrationState(statePath: string, state: MigrationState): Promise<void> {
    const safeState = normalizeState(state);
    const payload = JSON.stringify(safeState, null, 4);
    await fs.writeFile(statePath, payload, 'utf-8');
}
