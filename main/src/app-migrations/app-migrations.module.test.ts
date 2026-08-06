import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApplication, Module } from '@mariodebono/di';
import { ConfigModule } from '@mariodebono/di-config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/index.js';
import { AppMigrationsModule } from './app-migrations.module.js';
import {
    CLEAR_RELEASE_CACHE_MIGRATION_ID,
    ClearReleaseCacheMigration,
} from './migrations/clear-release-cache.migration.js';
import { MIGRATE_CODE_EDITOR_PREFERENCES_ID } from './migrations/code-editor-preferences.migration.js';
import { MIGRATE_CODE_EDITOR_PROJECTS_ID } from './migrations/code-editor-projects.migration.js';

const operationMocks = vi.hoisted(() => ({
    clearReleaseCaches: vi.fn(),
    migrateCodeEditorPreferences: vi.fn(),
    migrateCodeEditorProjects: vi.fn(),
}));

vi.mock('../commands/releases.js', () => ({
    clearReleaseCaches: operationMocks.clearReleaseCaches,
}));

vi.mock('./code-editor-persistence.util.js', () => ({
    migrateCodeEditorPreferences: operationMocks.migrateCodeEditorPreferences,
    migrateCodeEditorProjects: operationMocks.migrateCodeEditorProjects,
}));

vi.mock('electron-log', () => ({
    default: {
        debug: vi.fn(),
        warn: vi.fn(),
    },
}));

describe('AppMigrationsModule', () => {
    let tempDir: string;
    let statePath: string;

    beforeEach(() => {
        tempDir = mkdtempSync(
            path.join(os.tmpdir(), 'gd-launcher-migrations-module-'),
        );
        statePath = path.join(tempDir, 'config', 'migrations.json');
        vi.clearAllMocks();
        operationMocks.clearReleaseCaches.mockResolvedValue(undefined);
        operationMocks.migrateCodeEditorPreferences.mockResolvedValue(
            undefined,
        );
        operationMocks.migrateCodeEditorProjects.mockResolvedValue(undefined);
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    it('runs all historical migrations in ID order and records them', async () => {
        const order: string[] = [];
        operationMocks.clearReleaseCaches.mockImplementation(async () => {
            order.push('release-cache');
        });
        operationMocks.migrateCodeEditorPreferences.mockImplementation(
            async () => {
                order.push('preferences');
            },
        );
        operationMocks.migrateCodeEditorProjects.mockImplementation(
            async () => {
                order.push('projects');
            },
        );

        await bootstrapMigrations(statePath);

        expect(order).toEqual(['release-cache', 'preferences', 'projects']);
        expect(readCompletedIds(statePath)).toEqual([
            CLEAR_RELEASE_CACHE_MIGRATION_ID,
            MIGRATE_CODE_EDITOR_PREFERENCES_ID,
            MIGRATE_CODE_EDITOR_PROJECTS_ID,
        ]);
    });

    it('keeps completed history and runs only missing migration IDs', async () => {
        writeMigrationState(statePath, {
            lastSeenVersion: '1.11.0',
            completed: [CLEAR_RELEASE_CACHE_MIGRATION_ID],
        });

        await bootstrapMigrations(statePath);
        await bootstrapMigrations(statePath);

        expect(operationMocks.clearReleaseCaches).not.toHaveBeenCalled();
        expect(
            operationMocks.migrateCodeEditorPreferences,
        ).toHaveBeenCalledOnce();
        expect(operationMocks.migrateCodeEditorProjects).toHaveBeenCalledOnce();
        expect(readMigrationState(statePath)).toEqual({
            lastSeenVersion: '1.11.0',
            completed: [
                CLEAR_RELEASE_CACHE_MIGRATION_ID,
                MIGRATE_CODE_EDITOR_PREFERENCES_ID,
                MIGRATE_CODE_EDITOR_PROJECTS_ID,
            ],
        });
    });

    it('continues after a failure and retries the incomplete migration', async () => {
        operationMocks.migrateCodeEditorPreferences
            .mockRejectedValueOnce(new Error('migration failed'))
            .mockResolvedValueOnce(undefined);

        await bootstrapMigrations(statePath);

        expect(readCompletedIds(statePath)).toEqual([
            CLEAR_RELEASE_CACHE_MIGRATION_ID,
            MIGRATE_CODE_EDITOR_PROJECTS_ID,
        ]);

        await bootstrapMigrations(statePath);

        expect(
            operationMocks.migrateCodeEditorPreferences,
        ).toHaveBeenCalledTimes(2);
        expect(operationMocks.migrateCodeEditorProjects).toHaveBeenCalledOnce();
        expect(readCompletedIds(statePath)).toEqual([
            CLEAR_RELEASE_CACHE_MIGRATION_ID,
            MIGRATE_CODE_EDITOR_PROJECTS_ID,
            MIGRATE_CODE_EDITOR_PREFERENCES_ID,
        ]);
    });

    it('propagates operation errors from a migration class', async () => {
        const error = new Error('release migration failed');
        operationMocks.clearReleaseCaches.mockRejectedValue(error);

        await expect(new ClearReleaseCacheMigration().execute()).rejects.toBe(
            error,
        );
    });
});

async function bootstrapMigrations(migrationStatePath: string): Promise<void> {
    @Module({
        imports: [
            ConfigModule.forRoot<AppConfig>({
                cache: true,
                isGlobal: true,
                loadProcessEnv: false,
                load: [
                    () =>
                        ({
                            paths: { migrationStatePath },
                        }) as AppConfig,
                ],
            }),
            AppMigrationsModule,
        ],
    })
    class TestAppModule {}

    const application = await createApplication(TestAppModule, {
        logger: false,
    });
    await application.destroyAsync();
}

function writeMigrationState(stateFilePath: string, state: unknown): void {
    mkdirSync(path.dirname(stateFilePath), { recursive: true });
    writeFileSync(stateFilePath, JSON.stringify(state), 'utf-8');
}

function readMigrationState(stateFilePath: string): {
    lastSeenVersion: string;
    completed: string[];
} {
    return JSON.parse(readFileSync(stateFilePath, 'utf-8')) as {
        lastSeenVersion: string;
        completed: string[];
    };
}

function readCompletedIds(stateFilePath: string): string[] {
    return readMigrationState(stateFilePath).completed;
}
