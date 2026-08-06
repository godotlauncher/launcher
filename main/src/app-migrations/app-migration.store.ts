import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type { AppMigrationStore } from '@mariodebono/di-app-migrations';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ConfigService } from '@mariodebono/di-config';
import { app } from 'electron';
import logger from 'electron-log';
import type { AppConfig } from '../config/index.js';

export interface CompletedMigration {
    id: string;
    executedAt?: string;
    launcherVersion?: string;
}

export interface MigrationState {
    lastSeenVersion: string;
    completed: CompletedMigration[];
}

export const DEFAULT_MIGRATION_STATE: MigrationState = {
    lastSeenVersion: '0.0.0',
    completed: [],
};

function defaultMigrationState(): MigrationState {
    return {
        lastSeenVersion: DEFAULT_MIGRATION_STATE.lastSeenVersion,
        completed: [],
    };
}

export function normalizeMigrationState(candidate: unknown): MigrationState {
    if (!candidate || typeof candidate !== 'object') {
        return defaultMigrationState();
    }

    const record = candidate as Record<string, unknown>;
    const lastSeenVersion =
        typeof record.lastSeenVersion === 'string' &&
        record.lastSeenVersion.trim()
            ? record.lastSeenVersion.trim()
            : DEFAULT_MIGRATION_STATE.lastSeenVersion;
    const completedById = new Map<string, CompletedMigration>();

    if (Array.isArray(record.completed)) {
        for (const value of record.completed) {
            const completedMigration = normalizeCompletedMigration(value);
            if (!completedMigration) {
                continue;
            }

            const existing = completedById.get(completedMigration.id);
            completedById.set(completedMigration.id, {
                ...existing,
                ...completedMigration,
            });
        }
    }

    return {
        lastSeenVersion,
        completed: [...completedById.values()],
    };
}

function normalizeCompletedMigration(
    candidate: unknown,
): CompletedMigration | undefined {
    if (typeof candidate === 'string') {
        const id = candidate.trim();
        return id ? { id } : undefined;
    }

    if (!candidate || typeof candidate !== 'object') {
        return undefined;
    }

    const record = candidate as Record<string, unknown>;
    if (typeof record.id !== 'string' || !record.id.trim()) {
        return undefined;
    }

    const completedMigration: CompletedMigration = {
        id: record.id.trim(),
    };
    if (typeof record.executedAt === 'string' && record.executedAt.trim()) {
        completedMigration.executedAt = record.executedAt.trim();
    }
    if (
        typeof record.launcherVersion === 'string' &&
        record.launcherVersion.trim()
    ) {
        completedMigration.launcherVersion = record.launcherVersion.trim();
    }

    return completedMigration;
}

@Injectable()
export class LauncherAppMigrationStore implements AppMigrationStore {
    constructor(private readonly configService: ConfigService<AppConfig>) {}

    async listCompletedMigrationIds(): Promise<string[]> {
        const state = await this.loadState();
        return state.completed.map(({ id }) => id);
    }

    async markCompleted(id: string, executedAt: Date): Promise<void> {
        const state = await this.loadState();
        if (state.completed.some((migration) => migration.id === id)) {
            return;
        }

        const launcherVersion = app.getVersion();
        state.completed.push({
            id,
            executedAt: executedAt.toISOString(),
            launcherVersion,
        });
        state.lastSeenVersion = launcherVersion;
        await this.saveState(state);
    }

    private get statePath(): string {
        return this.configService.getOrThrow('paths.migrationStatePath');
    }

    private async loadState(): Promise<MigrationState> {
        let data: string;
        try {
            data = await fs.readFile(this.statePath, 'utf-8');
        } catch (error) {
            const fileError = error as NodeJS.ErrnoException;
            if (fileError.code === 'ENOENT') {
                logger.debug(
                    `Migration state not found at ${this.statePath}, using defaults`,
                );
                return defaultMigrationState();
            }

            logger.warn(
                `Failed to read migration state from ${this.statePath}, using defaults`,
                fileError,
            );
            return defaultMigrationState();
        }

        if (!data.trim()) {
            logger.warn(
                `Migration state at ${this.statePath} is empty, using defaults`,
            );
            return defaultMigrationState();
        }

        try {
            return normalizeMigrationState(JSON.parse(data) as unknown);
        } catch {
            logger.warn(
                `Migration state at ${this.statePath} contains invalid JSON, using defaults`,
            );
            return defaultMigrationState();
        }
    }

    private async saveState(state: MigrationState): Promise<void> {
        const safeState = normalizeMigrationState(state);
        await fs.mkdir(path.dirname(this.statePath), { recursive: true });
        await fs.writeFile(
            this.statePath,
            JSON.stringify(safeState, null, 4),
            'utf-8',
        );
    }
}
