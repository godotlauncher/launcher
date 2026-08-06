import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoveWindowsSymlinkNoticePreferenceMigration } from './remove-windows-symlink-notice-preference.migration.js';

const preferenceMocks = vi.hoisted(() => ({
    getDefaultPrefs: vi.fn(),
    getPrefsPath: vi.fn(),
    readPrefsSnapshotFromDisk: vi.fn(),
    writePrefsToDisk: vi.fn(),
}));

vi.mock('../../utils/prefs.utils.js', () => preferenceMocks);

describe('RemoveWindowsSymlinkNoticePreferenceMigration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        preferenceMocks.getPrefsPath.mockResolvedValue('/config/prefs.json');
        preferenceMocks.getDefaultPrefs.mockResolvedValue({});
        preferenceMocks.writePrefsToDisk.mockResolvedValue(undefined);
    });

    it('removes the retired preference and preserves other stored values', async () => {
        preferenceMocks.readPrefsSnapshotFromDisk.mockResolvedValue({
            stored: {
                first_run: false,
                windows_enable_symlinks: true,
                windows_symlink_win_notify: false,
            },
            merged: {},
        });

        await new RemoveWindowsSymlinkNoticePreferenceMigration().execute();

        expect(preferenceMocks.writePrefsToDisk).toHaveBeenCalledWith(
            '/config/prefs.json',
            {
                first_run: false,
                windows_enable_symlinks: true,
            },
        );
    });

    it('does not rewrite preferences when the retired key is absent', async () => {
        preferenceMocks.readPrefsSnapshotFromDisk.mockResolvedValue({
            stored: { first_run: false },
            merged: {},
        });

        await new RemoveWindowsSymlinkNoticePreferenceMigration().execute();

        expect(preferenceMocks.writePrefsToDisk).not.toHaveBeenCalled();
    });
});
