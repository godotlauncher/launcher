import type { UserPreferences } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredUserPreferences } from '../utils/prefs.utils.js';

const mocks = vi.hoisted(() => {
    const getDefaultDirs = vi.fn(() => ({ prefsPath: '/tmp/prefs.json' }));
    const getDefaultPrefs = vi.fn();
    const readPrefsSnapshotFromDisk = vi.fn();
    const writePrefsToDisk = vi.fn();
    const platform = vi.fn(() => 'darwin');

    return {
        getDefaultDirs,
        getDefaultPrefs,
        readPrefsSnapshotFromDisk,
        writePrefsToDisk,
        platform,
    };
});

vi.mock('node:os', () => ({
    platform: mocks.platform,
}));

vi.mock('../utils/platform.utils.js', () => ({
    getDefaultDirs: mocks.getDefaultDirs,
}));

vi.mock('../utils/prefs.utils.js', () => ({
    getDefaultPrefs: mocks.getDefaultPrefs,
    readPrefsSnapshotFromDisk: mocks.readPrefsSnapshotFromDisk,
    writePrefsToDisk: mocks.writePrefsToDisk,
}));

import { getUserPreferences, setUserPreferences } from './userPreferences.js';

function createPrefs(
    overrides: Partial<UserPreferences> = {},
): UserPreferences {
    return {
        prefs_version: 4,
        install_location: '/tmp/install',
        config_location: '/tmp/config',
        projects_location: '/tmp/projects',
        post_launch_action: 'close_to_tray',
        auto_check_updates: true,
        receive_beta_updates: false,
        skipped_app_update_version: undefined,
        auto_start: true,
        start_in_tray: true,
        confirm_project_remove: true,
        first_run: true,
        windows_enable_symlinks: false,
        language: 'system',
        ...overrides,
    };
}

function mockStoredPrefs(stored: StoredUserPreferences): void {
    const { vs_code_path: _legacyVSCodePath, ...runtimePrefs } = stored;
    mocks.readPrefsSnapshotFromDisk.mockResolvedValue({
        stored,
        merged: createPrefs(runtimePrefs),
    });
}

describe('userPreferences migration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getDefaultDirs.mockReturnValue({ prefsPath: '/tmp/prefs.json' });
        mocks.getDefaultPrefs.mockResolvedValue(createPrefs());
    });

    it('keeps missing skipped update preference as undefined', async () => {
        mockStoredPrefs({
            prefs_version: 4,
            receive_beta_updates: false,
        });

        const prefs = await getUserPreferences();

        expect(prefs.receive_beta_updates).toBe(false);
        expect(prefs.skipped_app_update_version).toBeUndefined();
        expect(mocks.writePrefsToDisk).toHaveBeenCalledTimes(0);
    });

    it('copies the legacy VS Code path into integration settings', async () => {
        mockStoredPrefs({
            prefs_version: 3,
            vs_code_path: '/opt/code',
        });

        const prefs = await getUserPreferences();

        expect(prefs).toMatchObject({
            prefs_version: 4,
            code_editor_integrations: {
                vscode: {
                    enabled: true,
                    executable_path: '/opt/code',
                },
            },
        });
        expect(mocks.writePrefsToDisk).toHaveBeenCalledWith(
            '/tmp/prefs.json',
            prefs,
        );
    });

    it('uses a missing stored version as a legacy migration source', async () => {
        mockStoredPrefs({
            vs_code_path: '/opt/code',
        });

        const prefs = await getUserPreferences();

        expect(prefs).toMatchObject({
            prefs_version: 4,
            code_editor_integrations: {
                vscode: {
                    enabled: true,
                    executable_path: '/opt/code',
                },
            },
        });
        expect(mocks.writePrefsToDisk).toHaveBeenCalledWith(
            '/tmp/prefs.json',
            prefs,
        );
    });

    it('persists version 4 when the stored version is missing', async () => {
        mockStoredPrefs({
            language: 'de',
        });

        const prefs = await getUserPreferences();

        expect(prefs.prefs_version).toBe(4);
        expect(prefs.code_editor_integrations).toBeUndefined();
        expect(mocks.writePrefsToDisk).toHaveBeenCalledWith(
            '/tmp/prefs.json',
            prefs,
        );
    });

    it('does not copy the legacy path from version 4 preferences', async () => {
        mockStoredPrefs({
            prefs_version: 4,
            vs_code_path: '/opt/code',
        });

        const firstRead = await getUserPreferences();
        const secondRead = await getUserPreferences();

        expect(firstRead.code_editor_integrations).toBeUndefined();
        expect(secondRead.code_editor_integrations).toBeUndefined();
        expect(mocks.writePrefsToDisk).not.toHaveBeenCalled();
    });

    it('does not create integration settings for an empty legacy path', async () => {
        mockStoredPrefs({
            prefs_version: 3,
            vs_code_path: '   ',
        });

        const prefs = await getUserPreferences();

        expect(prefs.prefs_version).toBe(4);
        expect(prefs.code_editor_integrations).toBeUndefined();
        expect(mocks.writePrefsToDisk).toHaveBeenCalledWith(
            '/tmp/prefs.json',
            prefs,
        );
    });

    it('preserves an existing generic VS Code configuration', async () => {
        mockStoredPrefs({
            prefs_version: 3,
            vs_code_path: '/legacy/code',
            code_editor_integrations: {
                vscode: {
                    enabled: false,
                    executable_path: '/generic/code',
                    executable_args: '--reuse-window',
                    is_default: true,
                },
            },
        });

        const prefs = await getUserPreferences();

        expect(prefs.code_editor_integrations?.vscode).toEqual({
            enabled: false,
            executable_path: '/generic/code',
            executable_args: '--reuse-window',
            is_default: true,
        });
        expect(mocks.writePrefsToDisk).toHaveBeenCalledWith(
            '/tmp/prefs.json',
            prefs,
        );
    });

    it('adds only the migrated path and default enabled state to partial settings', async () => {
        mockStoredPrefs({
            prefs_version: 3,
            vs_code_path: '/legacy/code',
            code_editor_integrations: {
                vscode: {
                    executable_args: '--reuse-window',
                    is_default: true,
                },
            },
        });

        const prefs = await getUserPreferences();

        expect(prefs.code_editor_integrations?.vscode).toEqual({
            enabled: true,
            executable_path: '/legacy/code',
            executable_args: '--reuse-window',
            is_default: true,
        });
    });

    it('preserves an explicit disabled state while copying the legacy path', async () => {
        mockStoredPrefs({
            prefs_version: 3,
            vs_code_path: '/legacy/code',
            code_editor_integrations: {
                vscode: {
                    enabled: false,
                    executable_args: '--reuse-window',
                    is_default: true,
                },
            },
        });

        const prefs = await getUserPreferences();

        expect(prefs.code_editor_integrations?.vscode).toEqual({
            enabled: false,
            executable_path: '/legacy/code',
            executable_args: '--reuse-window',
            is_default: true,
        });
    });

    it('does not add enabled to generic version 4 settings', async () => {
        mockStoredPrefs({
            prefs_version: 4,
            code_editor_integrations: {
                vscode: {
                    executable_path: '/generic/code',
                    executable_args: '--reuse-window',
                    is_default: true,
                },
            },
        });

        const prefs = await getUserPreferences();

        expect(prefs.code_editor_integrations?.vscode).toEqual({
            executable_path: '/generic/code',
            executable_args: '--reuse-window',
            is_default: true,
        });
        expect(mocks.writePrefsToDisk).not.toHaveBeenCalled();
    });

    it('does not restore the legacy path after reset and reload', async () => {
        let stored: StoredUserPreferences = {
            prefs_version: 3,
            vs_code_path: '/legacy/code',
        };
        mocks.readPrefsSnapshotFromDisk.mockImplementation(async () => {
            const { vs_code_path: _legacyVSCodePath, ...runtimePrefs } = stored;
            return {
                stored,
                merged: createPrefs(runtimePrefs),
            };
        });
        mocks.writePrefsToDisk.mockImplementation(async (_path, value) => {
            stored = JSON.parse(JSON.stringify(value));
        });

        const migrated = await getUserPreferences();
        await setUserPreferences({
            ...migrated,
            code_editor_integrations: {
                ...migrated.code_editor_integrations,
                vscode: {
                    ...migrated.code_editor_integrations?.vscode,
                    executable_path: undefined,
                },
            },
        });
        const reloaded = await getUserPreferences();

        expect(reloaded).not.toHaveProperty('vs_code_path');
        expect(stored).not.toHaveProperty('vs_code_path');
        expect(
            reloaded.code_editor_integrations?.vscode?.executable_path,
        ).toBeUndefined();
        expect(mocks.writePrefsToDisk).toHaveBeenCalledTimes(2);
    });

    it('clears invalid skipped update preference values', async () => {
        mockStoredPrefs({
            prefs_version: 4,
            skipped_app_update_version: 42 as unknown as string,
        });

        const prefs = await getUserPreferences();

        expect(prefs.skipped_app_update_version).toBeUndefined();
        expect(mocks.writePrefsToDisk).toHaveBeenCalledWith(
            '/tmp/prefs.json',
            expect.objectContaining({
                skipped_app_update_version: undefined,
            }),
        );
    });

    it('persists explicit skipped versions', async () => {
        const prefs = createPrefs({
            skipped_app_update_version: '1.9.1',
        });

        await setUserPreferences(prefs);

        expect(mocks.writePrefsToDisk).toHaveBeenCalledWith(
            '/tmp/prefs.json',
            prefs,
        );
    });
});
