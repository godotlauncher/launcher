import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platformMocks = vi.hoisted(() => ({
    getDefaultDirs: vi.fn(),
}));

vi.mock('../utils/platform.utils.js', () => platformMocks);

const releasesMocks = vi.hoisted(() => ({
    clearReleaseCaches: vi.fn(),
}));

vi.mock('../commands/releases.js', () => releasesMocks);

const MIGRATION_ID = '2024-03-clear-release-cache';

describe('runMigrations', () => {
    let runMigrations: typeof import('./index.js').runMigrations;
    let tmpDir: string;
    let statePath: string;

    beforeEach(async () => {
        vi.resetModules();

        tmpDir = mkdtempSync(path.join(os.tmpdir(), 'gd-launcher-migrations-'));
        statePath = path.join(tmpDir, 'migrations.json');

        platformMocks.getDefaultDirs.mockReturnValue({
            dataDir: '',
            configDir: '',
            projectDir: '',
            prefsPath: '',
            releaseCachePath: '',
            prereleaseCachePath: '',
            installedReleasesCachePath: '',
            migrationStatePath: statePath,
        });

        releasesMocks.clearReleaseCaches.mockResolvedValue();

        ({ runMigrations } = await import('./index.js'));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
        vi.clearAllMocks();
    });

    it('runs the release cache migration when upgrading to 1.6.1', async () => {
        const appVersion = '1.6.1';
        writeFileSync(
            statePath,
            JSON.stringify({ lastSeenVersion: '1.5.0', completed: [] }, null, 4)
        );

        await runMigrations(appVersion);

        expect(releasesMocks.clearReleaseCaches).toHaveBeenCalledTimes(1);

        const state = JSON.parse(readFileSync(statePath, 'utf-8')) as {
            lastSeenVersion: string;
            completed: string[];
        };

        expect(state.completed).toContain(MIGRATION_ID);
        expect(state.lastSeenVersion).toBe(appVersion);
    });

    it('skips the migration when it has already completed', async () => {
        const appVersion = '1.6.2';
        writeFileSync(
            statePath,
            JSON.stringify(
                { lastSeenVersion: '1.6.1', completed: [MIGRATION_ID] },
                null,
                4
            )
        );

        await runMigrations(appVersion);

        expect(releasesMocks.clearReleaseCaches).not.toHaveBeenCalled();

        const state = JSON.parse(readFileSync(statePath, 'utf-8')) as {
            lastSeenVersion: string;
            completed: string[];
        };

        expect(state.completed.filter((value) => value === MIGRATION_ID)).toHaveLength(1);
        expect(state.lastSeenVersion).toBe(appVersion);
    });

    it('does not rerun the migration when downgrading below 1.6.1', async () => {
        const appVersion = '1.5.3';
        writeFileSync(
            statePath,
            JSON.stringify(
                { lastSeenVersion: '1.6.2', completed: [MIGRATION_ID] },
                null,
                4
            )
        );

        await runMigrations(appVersion);

        expect(releasesMocks.clearReleaseCaches).not.toHaveBeenCalled();

        const state = JSON.parse(readFileSync(statePath, 'utf-8')) as {
            lastSeenVersion: string;
            completed: string[];
        };

        expect(state.completed).toContain(MIGRATION_ID);
        expect(state.lastSeenVersion).toBe(appVersion);
    });

    it('persists state after a failure and retries on next launch', async () => {
        const appVersion = '1.6.1';
        const failure = new Error('network down');

        writeFileSync(
            statePath,
            JSON.stringify({ lastSeenVersion: '1.5.0', completed: [] }, null, 4)
        );

        releasesMocks.clearReleaseCaches.mockReset();
        releasesMocks.clearReleaseCaches
            .mockRejectedValueOnce(failure)
            .mockResolvedValueOnce(undefined);

        await expect(runMigrations(appVersion)).rejects.toThrow(failure);

        const stateAfterFailure = JSON.parse(readFileSync(statePath, 'utf-8')) as {
            lastSeenVersion: string;
            completed: string[];
        };

        expect(stateAfterFailure.lastSeenVersion).toBe('1.5.0');
        expect(stateAfterFailure.completed).toEqual([]);

        await runMigrations(appVersion);

        expect(releasesMocks.clearReleaseCaches).toHaveBeenCalledTimes(2);

        const finalState = JSON.parse(readFileSync(statePath, 'utf-8')) as {
            lastSeenVersion: string;
            completed: string[];
        };

        expect(finalState.lastSeenVersion).toBe(appVersion);
        expect(finalState.completed).toContain(MIGRATION_ID);
    });
});
