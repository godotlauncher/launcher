import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Injectable } from '@mariodebono/di';
import type { AppMigrationStore } from '@mariodebono/di-app-migrations';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ConfigService } from '@mariodebono/di-config';
import logger from 'electron-log';
import type { AppConfig } from '../config/index.js';

export interface MigrationState {
    lastSeenVersion: string;
    completed: string[];
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
    const completed = Array.isArray(record.completed)
        ? record.completed.filter(
              (value): value is string => typeof value === 'string',
          )
        : [];

    return {
        lastSeenVersion,
        completed: [...new Set(completed)],
    };
}

@Injectable()
export class LauncherAppMigrationStore implements AppMigrationStore {
    constructor(private readonly configService: ConfigService<AppConfig>) {}

    async listCompletedMigrationIds(): Promise<string[]> {
        const state = await this.loadState();
        return [...state.completed];
    }

    async markCompleted(id: string, executedAt: Date): Promise<void> {
        void executedAt;

        const state = await this.loadState();
        if (state.completed.includes(id)) {
            return;
        }

        state.completed.push(id);
        await this.saveState(state);
    }

    private get statePath(): string {
        return this.configService.getOrThrow('paths.migrationStatePath');
    }

    private async loadState(): Promise<MigrationState> {
        try {
            const data = await fs.readFile(this.statePath, 'utf-8');
            return normalizeMigrationState(JSON.parse(data) as unknown);
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
