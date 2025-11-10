import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installRelease } from './installRelease';

type AssetSummary = {
    name: string;
    download_url: string;
    platform_tags: string[];
    mono: boolean;
};

type ReleaseSummary = {
    version: string;
    version_number: number;
    prerelease: boolean;
    draft: boolean;
    published_at: string | null;
    assets: AssetSummary[];
};

const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
    promises: {
        mkdir: vi.fn(),
        rm: vi.fn(),
    },
}));

vi.mock('node:fs', () => ({
    existsSync: fsMocks.existsSync,
    promises: fsMocks.promises,
    default: {
        existsSync: fsMocks.existsSync,
        promises: fsMocks.promises,
    },
}));

const osMocks = vi.hoisted(() => ({
    platform: vi.fn(() => 'win32'),
    arch: vi.fn(() => 'arm64'),
}));

vi.mock('os', () => ({
    platform: osMocks.platform,
    arch: osMocks.arch,
    default: {
        platform: osMocks.platform,
        arch: osMocks.arch,
    },
}));

const decompressMocks = vi.hoisted(() => ({
    decompress: vi.fn(),
}));

vi.mock('decompress', () => ({
    default: decompressMocks.decompress,
}));

vi.mock('electron-updater', () => ({
    default: {
        autoUpdater: {
            on: vi.fn(),
            logger: null,
            channel: null,
            checkForUpdates: vi.fn(),
            checkForUpdatesAndNotify: vi.fn(),
            downloadUpdate: vi.fn(),
            quitAndInstall: vi.fn(),
            setFeedURL: vi.fn(),
            addAuthHeader: vi.fn(),
            isUpdaterActive: vi.fn(),
            currentVersion: '1.0.0',
        },
    },
    UpdateCheckResult: {},
}));

const releasesUtilsMocks = vi.hoisted(() => ({
    downloadReleaseAsset: vi.fn(),
    addStoredInstalledRelease: vi.fn(),
}));

vi.mock('../utils/releases.utils.js', async () => {
    const actual = await vi.importActual<
        typeof import('../utils/releases.utils.js')
    >('../utils/releases.utils.js');
    return {
        ...actual,
        downloadReleaseAsset: releasesUtilsMocks.downloadReleaseAsset,
        addStoredInstalledRelease: releasesUtilsMocks.addStoredInstalledRelease,
    };
});

const platformUtilsMocks = vi.hoisted(() => ({
    getDefaultDirs: vi.fn(() => ({
        configDir: '/config',
        dataDir: '/data',
        projectDir: '/projects',
        prefsPath: '/prefs.json',
        releaseCachePath: '/config/releases.json',
        installedReleasesCachePath: '/cache/installed.json',
        prereleaseCachePath: '/config/prereleases.json',
        migrationStatePath: '/config/migrations.json',
    })),
}));

vi.mock('../utils/platform.utils.js', () => platformUtilsMocks);

const userPreferencesMocks = vi.hoisted(() => ({
    getUserPreferences: vi.fn(),
}));

vi.mock('./userPreferences.js', () => userPreferencesMocks);

const godotUtilsMocks = vi.hoisted(() => ({
    getProjectDefinition: vi.fn(),
    DEFAULT_PROJECT_DEFINITION: {},
}));

vi.mock('../utils/godot.utils.js', () => godotUtilsMocks);

const checksMocks = vi.hoisted(() => ({
    checkAndUpdateProjects: vi.fn(),
}));

vi.mock('../checks.js', () => checksMocks);

vi.mock('../i18n/index.js', () => ({
    t: (key: string) => key,
}));

describe('installRelease', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        fsMocks.existsSync.mockReturnValue(false);
        fsMocks.promises.mkdir.mockResolvedValue(undefined);
        fsMocks.promises.rm.mockResolvedValue(undefined);

        releasesUtilsMocks.downloadReleaseAsset.mockResolvedValue(undefined);
        releasesUtilsMocks.addStoredInstalledRelease.mockResolvedValue(
            undefined,
        );

        platformUtilsMocks.getDefaultDirs.mockReturnValue({
            configDir: '/config',
            dataDir: '/data',
            projectDir: '/projects',
            prefsPath: '/prefs.json',
            releaseCachePath: '/config/releases.json',
            installedReleasesCachePath: '/cache/installed.json',
            prereleaseCachePath: '/config/prereleases.json',
            migrationStatePath: '/config/migrations.json',
        });

        userPreferencesMocks.getUserPreferences.mockResolvedValue({
            install_location: '/installs',
        });

        godotUtilsMocks.getProjectDefinition.mockReturnValue({
            configVersion: 5,
        });

        decompressMocks.decompress.mockResolvedValue(undefined);
        checksMocks.checkAndUpdateProjects.mockResolvedValue(undefined);

        osMocks.platform.mockReturnValue('win32');
        osMocks.arch.mockReturnValue('arm64');
    });

    it('downloads and registers the Windows arm64 editor asset', async () => {
        const arm64Asset: AssetSummary = {
            name: 'Godot_v4.5.1-stable_windows_arm64.exe.zip',
            download_url:
                'https://example.com/Godot_v4.5.1-stable_windows_arm64.exe.zip',
            platform_tags: ['win32', 'arm64'],
            mono: false,
        };

        const release: ReleaseSummary = {
            version: 'Godot_v4.5.1-stable',
            version_number: 4.5,
            prerelease: false,
            draft: false,
            published_at: '2024-01-01T00:00:00Z',
            assets: [arm64Asset],
        };

        const result = await installRelease(release, false);

        const expectedInstallPath = path.resolve(
            '/installs',
            'Godot_v4.5.1-stable',
        );
        const expectedDownloadPath = path.resolve(
            '/installs',
            'tmp',
            'Godot_v4.5.1-stable',
        );
        const expectedEditorPath = path.resolve(
            expectedInstallPath,
            'Godot_v4.5.1-stable_windows_arm64.exe',
        );

        expect(releasesUtilsMocks.downloadReleaseAsset).toHaveBeenCalledWith(
            arm64Asset,
            path.resolve(expectedDownloadPath, arm64Asset.name),
        );
        expect(decompressMocks.decompress).toHaveBeenCalledWith(
            path.resolve(expectedDownloadPath, arm64Asset.name),
            expectedInstallPath,
        );
        expect(
            releasesUtilsMocks.addStoredInstalledRelease,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                arch: 'arm64',
                platform: 'win32',
                mono: false,
                install_path: expectedInstallPath,
                editor_path: expectedEditorPath,
            }),
        );
        expect(result.success).toBe(true);
        expect(result.release?.arch).toBe('arm64');
        expect(result.release?.editor_path).toBe(expectedEditorPath);
    });
});
