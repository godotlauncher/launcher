import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigService } from '@mariodebono/di-config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/index.js';
import {
    DEFAULT_MIGRATION_STATE,
    LauncherAppMigrationStore,
    normalizeMigrationState,
} from './app-migration.store.js';

const loggerMocks = vi.hoisted(() => ({
    debug: vi.fn(),
    warn: vi.fn(),
}));
const electronMocks = vi.hoisted(() => ({
    getVersion: vi.fn(() => '1.12.0'),
}));

vi.mock('electron', () => ({
    app: { getVersion: electronMocks.getVersion },
}));

vi.mock('electron-log', () => ({
    default: loggerMocks,
}));

describe('LauncherAppMigrationStore', () => {
    let tempDir: string;
    let statePath: string;
    let store: LauncherAppMigrationStore;

    beforeEach(() => {
        tempDir = mkdtempSync(
            path.join(os.tmpdir(), 'gd-launcher-migration-store-'),
        );
        statePath = path.join(tempDir, 'nested', 'migrations.json');
        store = createStore(statePath);
        vi.clearAllMocks();
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    it('returns no completed IDs when the state file is missing', async () => {
        await expect(store.listCompletedMigrationIds()).resolves.toEqual([]);
        expect(loggerMocks.debug).toHaveBeenCalledOnce();
    });

    it('normalizes legacy and structured completion records', async () => {
        writeState(statePath, {
            lastSeenVersion: ' 1.11.0 ',
            completed: [
                'alpha',
                42,
                { id: 'alpha', executedAt: '2026-08-01T10:00:00.000Z' },
                { id: ' beta ', launcherVersion: ' 1.11.0 ' },
                { id: ' ' },
            ],
        });

        await expect(store.listCompletedMigrationIds()).resolves.toEqual([
            'alpha',
            'beta',
        ]);
    });

    it('recovers from an empty state file without logging a parse error', async () => {
        mkdirSync(path.dirname(statePath), { recursive: true });
        writeFileSync(statePath, '   ', 'utf-8');

        await expect(store.listCompletedMigrationIds()).resolves.toEqual([]);
        expect(loggerMocks.warn).toHaveBeenCalledWith(
            `Migration state at ${statePath} is empty, using defaults`,
        );
    });

    it('records completion metadata and the launcher version', async () => {
        await store.markCompleted(
            'alpha',
            new Date('2026-08-06T08:00:00.000Z'),
        );
        await store.markCompleted('beta', new Date('2026-08-06T09:00:00.000Z'));
        await store.markCompleted(
            'alpha',
            new Date('2026-08-06T10:00:00.000Z'),
        );

        expect(readState(statePath)).toEqual({
            lastSeenVersion: '1.12.0',
            completed: [
                {
                    id: 'alpha',
                    executedAt: '2026-08-06T08:00:00.000Z',
                    launcherVersion: '1.12.0',
                },
                {
                    id: 'beta',
                    executedAt: '2026-08-06T09:00:00.000Z',
                    launcherVersion: '1.12.0',
                },
            ],
        });
    });

    it('upgrades legacy IDs on the next successful completion', async () => {
        writeState(statePath, {
            lastSeenVersion: '1.11.0',
            completed: ['previous-migration'],
        });

        await store.markCompleted(
            'new-migration',
            new Date('2026-08-06T10:00:00.000Z'),
        );

        expect(readState(statePath)).toEqual({
            lastSeenVersion: '1.12.0',
            completed: [
                { id: 'previous-migration' },
                {
                    id: 'new-migration',
                    executedAt: '2026-08-06T10:00:00.000Z',
                    launcherVersion: '1.12.0',
                },
            ],
        });
    });

    it('warns and recovers from malformed state on the next completion', async () => {
        mkdirSync(path.dirname(statePath), { recursive: true });
        writeFileSync(statePath, '{invalid', 'utf-8');

        await expect(store.listCompletedMigrationIds()).resolves.toEqual([]);
        expect(loggerMocks.warn).toHaveBeenCalledWith(
            `Migration state at ${statePath} contains invalid JSON, using defaults`,
        );

        await store.markCompleted(
            'recovered',
            new Date('2026-08-06T10:00:00.000Z'),
        );
        expect(readState(statePath)).toEqual({
            lastSeenVersion: '1.12.0',
            completed: [
                {
                    id: 'recovered',
                    executedAt: '2026-08-06T10:00:00.000Z',
                    launcherVersion: '1.12.0',
                },
            ],
        });
    });

    it('rejects a failed write without caching the completion', async () => {
        const blockingParent = path.join(tempDir, 'blocking-parent');
        writeFileSync(blockingParent, 'not a directory', 'utf-8');
        const blockedStore = createStore(
            path.join(blockingParent, 'migrations.json'),
        );

        await expect(
            blockedStore.markCompleted('not-persisted', new Date()),
        ).rejects.toThrow();
        await expect(blockedStore.listCompletedMigrationIds()).resolves.toEqual(
            [],
        );
    });
});

describe('normalizeMigrationState', () => {
    it('uses defaults for invalid state fields', () => {
        expect(
            normalizeMigrationState({
                lastSeenVersion: ' ',
                completed: 'not-an-array',
            }),
        ).toEqual(DEFAULT_MIGRATION_STATE);
    });

    it('preserves available metadata when duplicate records are merged', () => {
        expect(
            normalizeMigrationState({
                lastSeenVersion: '1.12.0',
                completed: [
                    {
                        id: 'alpha',
                        executedAt: '2026-08-06T08:00:00.000Z',
                    },
                    { id: 'alpha', launcherVersion: '1.12.0' },
                ],
            }),
        ).toEqual({
            lastSeenVersion: '1.12.0',
            completed: [
                {
                    id: 'alpha',
                    executedAt: '2026-08-06T08:00:00.000Z',
                    launcherVersion: '1.12.0',
                },
            ],
        });
    });
});

function createStore(stateFilePath: string): LauncherAppMigrationStore {
    const configService = new ConfigService<AppConfig>({
        paths: { migrationStatePath: stateFilePath },
    } as AppConfig);
    return new LauncherAppMigrationStore(configService);
}

function writeState(stateFilePath: string, state: unknown): void {
    mkdirSync(path.dirname(stateFilePath), { recursive: true });
    writeFileSync(stateFilePath, JSON.stringify(state), 'utf-8');
}

function readState(stateFilePath: string): unknown {
    return JSON.parse(readFileSync(stateFilePath, 'utf-8')) as unknown;
}
