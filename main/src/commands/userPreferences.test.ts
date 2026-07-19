import type { UserPreferences } from '@shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const getDefaultDirs = vi.fn(() => ({ prefsPath: '/tmp/prefs.json' }));
    const getDefaultPrefs = vi.fn();
    const readPrefsFromDisk = vi.fn();
    const writePrefsToDisk = vi.fn();
    const platform = vi.fn(() => 'darwin');

    return {
        getDefaultDirs,
        getDefaultPrefs,
        readPrefsFromDisk,
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
    readPrefsFromDisk: mocks.readPrefsFromDisk,
    writePrefsToDisk: mocks.writePrefsToDisk,
}));

import { getUserPreferences, setUserPreferences } from './userPreferences.js';

function createPrefs(
    overrides: Partial<UserPreferences> = {},
): UserPreferences {
    return {
        prefs_version: 3,
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
        windows_symlink_win_notify: true,
        vs_code_path: '',
        language: 'system',
        ...overrides,
    };
}

describe('userPreferences migration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getDefaultDirs.mockReturnValue({ prefsPath: '/tmp/prefs.json' });
        mocks.getDefaultPrefs.mockResolvedValue(createPrefs());
    });

    it('keeps missing skipped update preference as undefined', async () => {
        mocks.readPrefsFromDisk.mockResolvedValue(
            createPrefs({
                receive_beta_updates: false,
                skipped_app_update_version: undefined,
            }),
        );

        const prefs = await getUserPreferences();

        expect(prefs.receive_beta_updates).toBe(false);
        expect(prefs.skipped_app_update_version).toBeUndefined();
        expect(mocks.writePrefsToDisk).toHaveBeenCalledTimes(0);
    });

    it('clears invalid skipped update preference values', async () => {
        mocks.readPrefsFromDisk.mockResolvedValue(
            createPrefs({
                skipped_app_update_version: 42 as unknown as string,
            }),
        );

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
