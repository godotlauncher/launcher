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
import { REMOVE_LEGACY_INSTALLED_TOOLS_PREFERENCE_ID } from './migrations/remove-legacy-installed-tools-preference.migration.js';
import { REMOVE_WINDOWS_SYMLINK_NOTICE_PREFERENCE_ID } from './migrations/remove-windows-symlink-notice-preference.migration.js';

const operationMocks = vi.hoisted(() => ({
    clearReleaseCaches: vi.fn(),
    migrateCodeEditorPreferences: vi.fn(),
    migrateCodeEditorProjects: vi.fn(),
    writePreferences: vi.fn(),
}));
const electronMocks = vi.hoisted(() => ({
    getVersion: vi.fn(() => '1.12.0'),
}));

vi.mock('electron', () => ({
    app: { getVersion: electronMocks.getVersion },
}));

vi.mock('../commands/releases.js', () => ({
    clearReleaseCaches: operationMocks.clearReleaseCaches,
}));

vi.mock('./code-editor-persistence.util.js', () => ({
    migrateCodeEditorPreferences: operationMocks.migrateCodeEditorPreferences,
    migrateCodeEditorProjects: operationMocks.migrateCodeEditorProjects,
}));

vi.mock('../utils/prefs.utils.js', () => ({
    getDefaultPrefs: vi.fn(async () => ({})),
    getPrefsPath: vi.fn(async () => '/config/preferences.json'),
    readPrefsSnapshotFromDisk: vi.fn(async () => ({
        stored: {
            installed_tools: { last_scan: 123, tools: [] },
            windows_symlink_win_notify: false,
        },
        merged: {},
    })),
    writePrefsToDisk: operationMocks.writePreferences,
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
        operationMocks.writePreferences.mockResolvedValue(undefined);
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
        operationMocks.writePreferences.mockImplementation(
            async (_path, preferences) => {
                if (!Object.hasOwn(preferences, 'installed_tools')) {
                    order.push('remove-installed-tools');
                } else if (
                    !Object.hasOwn(preferences, 'windows_symlink_win_notify')
                ) {
                    order.push('remove-symlink-notice');
                }
            },
        );

        await bootstrapMigrations(statePath);

        expect(order).toEqual([
            'release-cache',
            'preferences',
            'projects',
            'remove-installed-tools',
            'remove-symlink-notice',
        ]);
        expect(readCompletedIds(statePath)).toEqual([
            CLEAR_RELEASE_CACHE_MIGRATION_ID,
            MIGRATE_CODE_EDITOR_PREFERENCES_ID,
            MIGRATE_CODE_EDITOR_PROJECTS_ID,
            REMOVE_LEGACY_INSTALLED_TOOLS_PREFERENCE_ID,
            REMOVE_WINDOWS_SYMLINK_NOTICE_PREFERENCE_ID,
        ]);
        expect(readMigrationState(statePath)).toMatchObject({
            lastSeenVersion: '1.12.0',
            completed: [
                {
                    id: CLEAR_RELEASE_CACHE_MIGRATION_ID,
                    launcherVersion: '1.12.0',
                },
                {
                    id: MIGRATE_CODE_EDITOR_PREFERENCES_ID,
                    launcherVersion: '1.12.0',
                },
                {
                    id: MIGRATE_CODE_EDITOR_PROJECTS_ID,
                    launcherVersion: '1.12.0',
                },
                {
                    id: REMOVE_LEGACY_INSTALLED_TOOLS_PREFERENCE_ID,
                    launcherVersion: '1.12.0',
                },
                {
                    id: REMOVE_WINDOWS_SYMLINK_NOTICE_PREFERENCE_ID,
                    launcherVersion: '1.12.0',
                },
            ],
        });
        for (const migration of readMigrationState(statePath).completed) {
            expect(Date.parse(migration.executedAt ?? '')).not.toBeNaN();
        }
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
        expect(operationMocks.writePreferences).toHaveBeenCalledTimes(2);
        expect(readMigrationState(statePath)).toEqual({
            lastSeenVersion: '1.12.0',
            completed: [
                { id: CLEAR_RELEASE_CACHE_MIGRATION_ID },
                {
                    id: MIGRATE_CODE_EDITOR_PREFERENCES_ID,
                    executedAt: expect.any(String),
                    launcherVersion: '1.12.0',
                },
                {
                    id: MIGRATE_CODE_EDITOR_PROJECTS_ID,
                    executedAt: expect.any(String),
                    launcherVersion: '1.12.0',
                },
                {
                    id: REMOVE_LEGACY_INSTALLED_TOOLS_PREFERENCE_ID,
                    executedAt: expect.any(String),
                    launcherVersion: '1.12.0',
                },
                {
                    id: REMOVE_WINDOWS_SYMLINK_NOTICE_PREFERENCE_ID,
                    executedAt: expect.any(String),
                    launcherVersion: '1.12.0',
                },
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
            REMOVE_LEGACY_INSTALLED_TOOLS_PREFERENCE_ID,
            REMOVE_WINDOWS_SYMLINK_NOTICE_PREFERENCE_ID,
        ]);

        await bootstrapMigrations(statePath);

        expect(
            operationMocks.migrateCodeEditorPreferences,
        ).toHaveBeenCalledTimes(2);
        expect(operationMocks.migrateCodeEditorProjects).toHaveBeenCalledOnce();
        expect(readCompletedIds(statePath)).toEqual([
            CLEAR_RELEASE_CACHE_MIGRATION_ID,
            MIGRATE_CODE_EDITOR_PROJECTS_ID,
            REMOVE_LEGACY_INSTALLED_TOOLS_PREFERENCE_ID,
            REMOVE_WINDOWS_SYMLINK_NOTICE_PREFERENCE_ID,
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
    completed: Array<{
        id: string;
        executedAt?: string;
        launcherVersion?: string;
    }>;
} {
    return JSON.parse(readFileSync(stateFilePath, 'utf-8')) as {
        lastSeenVersion: string;
        completed: Array<{
            id: string;
            executedAt?: string;
            launcherVersion?: string;
        }>;
    };
}

function readCompletedIds(stateFilePath: string): string[] {
    return readMigrationState(stateFilePath).completed.map(({ id }) => id);
}
