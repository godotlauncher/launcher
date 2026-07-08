import path from 'node:path';
import type { AssetSummary, ReleaseSummary } from '@shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installRelease } from './installRelease.js';

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

const extractZipMocks = vi.hoisted(() => ({
    extractZipArchive: vi.fn(),
}));

vi.mock('../utils/extractZip.utils.js', () => extractZipMocks);

const ipcMocks = vi.hoisted(() => ({
    ipcSendToMainWindowSync: vi.fn(),
}));

vi.mock('../utils.js', () => ipcMocks);

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

        extractZipMocks.extractZipArchive.mockResolvedValue(undefined);
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
            name: 'Godot_v4.5.1-stable',
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
            expect.any(Object),
        );
        expect(extractZipMocks.extractZipArchive).toHaveBeenCalledWith(
            path.resolve(expectedDownloadPath, arm64Asset.name),
            expect.objectContaining({
                dir: expectedInstallPath,
                onEntry: expect.any(Function),
            }),
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
        expect(ipcMocks.ipcSendToMainWindowSync).toHaveBeenCalledWith(
            'release-install-progress',
            expect.objectContaining({
                stage: 'complete',
                version: release.version,
                mono: false,
            }),
        );
    });

    it('shares concurrent install requests for the same editor identity', async () => {
        const arm64Asset: AssetSummary = {
            name: 'Godot_v4.5.2-stable_windows_arm64.exe.zip',
            download_url:
                'https://example.com/Godot_v4.5.2-stable_windows_arm64.exe.zip',
            platform_tags: ['win32', 'arm64'],
            mono: false,
        };
        const release: ReleaseSummary = {
            name: 'Godot_v4.5.2-stable',
            version: 'Godot_v4.5.2-stable',
            version_number: 4.5,
            prerelease: false,
            draft: false,
            published_at: '2024-01-01T00:00:00Z',
            assets: [arm64Asset],
        };

        let resolveDownload: (() => void) | undefined;
        releasesUtilsMocks.downloadReleaseAsset.mockReturnValueOnce(
            new Promise<void>((resolve) => {
                resolveDownload = resolve;
            }),
        );

        const firstInstall = installRelease(release, false);
        const secondInstall = installRelease(release, false);

        await vi.waitFor(() =>
            expect(
                releasesUtilsMocks.downloadReleaseAsset,
            ).toHaveBeenCalledTimes(1),
        );

        resolveDownload?.();
        const [firstResult, secondResult] = await Promise.all([
            firstInstall,
            secondInstall,
        ]);

        expect(
            releasesUtilsMocks.addStoredInstalledRelease,
        ).toHaveBeenCalledTimes(1);
        expect(firstResult.success).toBe(true);
        expect(secondResult).toEqual(firstResult);
    });

    it('runs different editor installs one at a time', async () => {
        const firstAsset: AssetSummary = {
            name: 'Godot_v4.5.3-stable_windows_arm64.exe.zip',
            download_url:
                'https://example.com/Godot_v4.5.3-stable_windows_arm64.exe.zip',
            platform_tags: ['win32', 'arm64'],
            mono: false,
        };
        const secondAsset: AssetSummary = {
            name: 'Godot_v4.5.4-stable_windows_arm64.exe.zip',
            download_url:
                'https://example.com/Godot_v4.5.4-stable_windows_arm64.exe.zip',
            platform_tags: ['win32', 'arm64'],
            mono: false,
        };
        const firstRelease: ReleaseSummary = {
            name: 'Godot_v4.5.3-stable',
            version: 'Godot_v4.5.3-stable',
            version_number: 4.5,
            prerelease: false,
            draft: false,
            published_at: '2024-01-01T00:00:00Z',
            assets: [firstAsset],
        };
        const secondRelease: ReleaseSummary = {
            name: 'Godot_v4.5.4-stable',
            version: 'Godot_v4.5.4-stable',
            version_number: 4.5,
            prerelease: false,
            draft: false,
            published_at: '2024-01-02T00:00:00Z',
            assets: [secondAsset],
        };

        let resolveFirstDownload: (() => void) | undefined;
        releasesUtilsMocks.downloadReleaseAsset.mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    resolveFirstDownload = resolve;
                }),
        );

        const firstInstall = installRelease(firstRelease, false);
        const secondInstall = installRelease(secondRelease, false);

        await vi.waitFor(() =>
            expect(
                releasesUtilsMocks.downloadReleaseAsset,
            ).toHaveBeenCalledTimes(1),
        );

        expect(releasesUtilsMocks.downloadReleaseAsset).toHaveBeenCalledWith(
            firstAsset,
            expect.any(String),
            expect.any(Object),
        );
        expect(
            releasesUtilsMocks.downloadReleaseAsset,
        ).not.toHaveBeenCalledWith(
            secondAsset,
            expect.any(String),
            expect.any(Object),
        );

        resolveFirstDownload?.();
        await firstInstall;
        await vi.waitFor(() =>
            expect(
                releasesUtilsMocks.downloadReleaseAsset,
            ).toHaveBeenCalledTimes(2),
        );

        const secondResult = await secondInstall;
        expect(secondResult.success).toBe(true);
        expect(
            releasesUtilsMocks.downloadReleaseAsset,
        ).toHaveBeenLastCalledWith(
            secondAsset,
            expect.any(String),
            expect.any(Object),
        );
    });

    it('continues queued installs after a failed install', async () => {
        const firstAsset: AssetSummary = {
            name: 'Godot_v4.5.5-stable_windows_arm64.exe.zip',
            download_url:
                'https://example.com/Godot_v4.5.5-stable_windows_arm64.exe.zip',
            platform_tags: ['win32', 'arm64'],
            mono: false,
        };
        const secondAsset: AssetSummary = {
            name: 'Godot_v4.5.6-stable_windows_arm64.exe.zip',
            download_url:
                'https://example.com/Godot_v4.5.6-stable_windows_arm64.exe.zip',
            platform_tags: ['win32', 'arm64'],
            mono: false,
        };
        const firstRelease: ReleaseSummary = {
            name: 'Godot_v4.5.5-stable',
            version: 'Godot_v4.5.5-stable',
            version_number: 4.5,
            prerelease: false,
            draft: false,
            published_at: '2024-01-01T00:00:00Z',
            assets: [firstAsset],
        };
        const secondRelease: ReleaseSummary = {
            name: 'Godot_v4.5.6-stable',
            version: 'Godot_v4.5.6-stable',
            version_number: 4.5,
            prerelease: false,
            draft: false,
            published_at: '2024-01-02T00:00:00Z',
            assets: [secondAsset],
        };

        releasesUtilsMocks.downloadReleaseAsset.mockRejectedValueOnce(
            new Error('network failed'),
        );

        const [firstResult, secondResult] = await Promise.all([
            installRelease(firstRelease, false),
            installRelease(secondRelease, false),
        ]);

        expect(firstResult.success).toBe(false);
        expect(firstResult.error).toBe('network failed');
        expect(secondResult.success).toBe(true);
        expect(ipcMocks.ipcSendToMainWindowSync).toHaveBeenCalledWith(
            'release-install-progress',
            expect.objectContaining({
                stage: 'error',
                version: firstRelease.version,
            }),
        );
        expect(releasesUtilsMocks.downloadReleaseAsset).toHaveBeenCalledTimes(
            2,
        );
    });
});
