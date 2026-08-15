import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoveLegacyInstalledToolsPreferenceMigration } from './remove-legacy-installed-tools-preference.migration.js';

const preferenceMocks = vi.hoisted(() => ({
    getDefaultPrefs: vi.fn(),
    getPrefsPath: vi.fn(),
    readPrefsSnapshotFromDisk: vi.fn(),
    writePrefsToDisk: vi.fn(),
}));

vi.mock('../../utils/prefs.utils.js', () => preferenceMocks);

describe('RemoveLegacyInstalledToolsPreferenceMigration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        preferenceMocks.getPrefsPath.mockResolvedValue('/config/prefs.json');
        preferenceMocks.getDefaultPrefs.mockResolvedValue({});
        preferenceMocks.writePrefsToDisk.mockResolvedValue(undefined);
    });

    it('removes installed tools and preserves other stored preferences', async () => {
        preferenceMocks.readPrefsSnapshotFromDisk.mockResolvedValue({
            stored: {
                first_run: false,
                language: 'mt',
                installed_tools: {
                    last_scan: 123,
                    tools: [
                        {
                            name: 'Git',
                            path: '/usr/bin/git',
                            version: '2.51.0',
                            verified: true,
                        },
                    ],
                },
            },
            merged: {},
        });

        await new RemoveLegacyInstalledToolsPreferenceMigration().execute();

        expect(preferenceMocks.writePrefsToDisk).toHaveBeenCalledWith(
            '/config/prefs.json',
            {
                first_run: false,
                language: 'mt',
            },
        );
    });

    it('does not rewrite preferences when installed tools are absent', async () => {
        preferenceMocks.readPrefsSnapshotFromDisk.mockResolvedValue({
            stored: { first_run: false },
            merged: {},
        });

        await new RemoveLegacyInstalledToolsPreferenceMigration().execute();

        expect(preferenceMocks.writePrefsToDisk).not.toHaveBeenCalled();
    });
});
