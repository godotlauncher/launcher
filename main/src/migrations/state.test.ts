import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    DEFAULT_MIGRATION_STATE,
    loadMigrationState,
    saveMigrationState,
} from './state.js';

describe('migration state persistence', () => {
    let tmpDir: string;
    let statePath: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(
            path.join(os.tmpdir(), 'gd-launcher-migration-state-'),
        );
        statePath = path.join(tmpDir, 'migrations.json');
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns defaults when state file is missing', async () => {
        const state = await loadMigrationState(statePath);
        expect(state).toEqual(DEFAULT_MIGRATION_STATE);
    });

    it('normalizes corrupted state files', async () => {
        writeFileSync(statePath, '{"invalid": true}', 'utf-8');

        const state = await loadMigrationState(statePath);
        expect(state).toEqual(DEFAULT_MIGRATION_STATE);
    });

    it('persists normalized state to disk', async () => {
        const state = {
            lastSeenVersion: '1.2.3',
            completed: ['alpha', 'alpha', 'beta'],
        };

        await saveMigrationState(statePath, state);

        const persisted = JSON.parse(readFileSync(statePath, 'utf-8')) as {
            lastSeenVersion: string;
            completed: string[];
        };

        expect(persisted).toEqual({
            lastSeenVersion: '1.2.3',
            completed: ['alpha', 'beta'],
        });
    });
});
