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

    it('normalizes completed IDs without changing valid history', async () => {
        writeState(statePath, {
            lastSeenVersion: ' 1.11.0 ',
            completed: ['alpha', 42, 'alpha', 'beta'],
        });

        await expect(store.listCompletedMigrationIds()).resolves.toEqual([
            'alpha',
            'beta',
        ]);
    });

    it('creates the parent directory and preserves state when completing a migration', async () => {
        await store.markCompleted('alpha', new Date());
        await store.markCompleted('beta', new Date());
        await store.markCompleted('alpha', new Date());

        expect(readState(statePath)).toEqual({
            lastSeenVersion: '0.0.0',
            completed: ['alpha', 'beta'],
        });
    });

    it('preserves previous completion history and lastSeenVersion', async () => {
        writeState(statePath, {
            lastSeenVersion: '1.11.0',
            completed: ['previous-migration'],
        });

        await store.markCompleted('new-migration', new Date());

        expect(readState(statePath)).toEqual({
            lastSeenVersion: '1.11.0',
            completed: ['previous-migration', 'new-migration'],
        });
    });

    it('warns and recovers from malformed state on the next completion', async () => {
        mkdirSync(path.dirname(statePath), { recursive: true });
        writeFileSync(statePath, '{invalid', 'utf-8');

        await expect(store.listCompletedMigrationIds()).resolves.toEqual([]);
        expect(loggerMocks.warn).toHaveBeenCalledOnce();

        await store.markCompleted('recovered', new Date());
        expect(readState(statePath)).toEqual({
            lastSeenVersion: '0.0.0',
            completed: ['recovered'],
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
