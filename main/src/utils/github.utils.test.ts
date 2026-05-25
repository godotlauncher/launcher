import { describe, expect, it, suite, vi } from 'vitest';
import type { ReleaseAsset } from '../types/github.js';
import { getReleases } from './github.utils.js';
import { createAssetSummary, getPlatformAsset } from './releases.utils.js';

// Mock electron-updater
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

// Mock electron
vi.mock('electron', () => ({
    Menu: {
        setApplicationMenu: vi.fn(),
    },
    app: {
        getAppPath: vi.fn(() => '/app/path'),
        isPackaged: false,
        getName: vi.fn(),
        getVersion: vi.fn(() => '1.0.0'),
        getLocale: vi.fn(),
        getPath: vi.fn(),
        on: vi.fn(),
        whenReady: vi.fn(),
        quit: vi.fn(),
        requestSingleInstanceLock: vi.fn(() => true),
        dock: {
            show: vi.fn(),
            hide: vi.fn(),
        },
    },
    BrowserWindow: vi.fn(),
    shell: {
        showItemInFolder: vi.fn(),
        openExternal: vi.fn(),
    },
    dialog: {
        showOpenDialog: vi.fn(),
        showMessageBox: vi.fn(),
    },
}));

const allAssetNames = [
    'godot-4.3-stable.tar.xz',
    'godot-4.3-stable.tar.xz.sha256',
    'godot-lib.4.3.stable.mono.template_release.aar',
    'godot-lib.4.3.stable.template_release.aar',
    'Godot_v4.3-stable_android_editor.aab',
    'Godot_v4.3-stable_android_editor.apk',
    'Godot_v4.3-stable_export_templates.tpz',
    'Godot_v4.3-stable_linux.arm32.zip',
    'Godot_v4.3-stable_linux.arm64.zip',
    'Godot_v4.3-stable_linux.x86_32.zip',
    'Godot_v4.3-stable_linux.x86_64.zip',
    'Godot_v4.3-stable_macos.universal.zip',
    'Godot_v4.3-stable_mono_export_templates.tpz',
    'Godot_v4.3-stable_mono_linux_arm32.zip',
    'Godot_v4.3-stable_mono_linux_arm64.zip',
    'Godot_v4.3-stable_mono_linux_x86_32.zip',
    'Godot_v4.3-stable_mono_linux_x86_64.zip',
    'Godot_v4.3-stable_mono_macos.universal.zip',
    'Godot_v4.3-stable_mono_win32.zip',
    'Godot_v4.3-stable_mono_win64.zip',
    'Godot_v4.3-stable_mono_windows_arm64.zip',
    'Godot_v4.3-stable_web_editor.zip',
    'Godot_v4.3-stable_win32.exe.zip',
    'Godot_v4.3-stable_win64.exe.zip',
    'Godot_v4.3-stable_windows_arm64.exe.zip',
    'SHA512-SUMS.txt',

    'Godot_v3.6-stable_x11.32.zip',
    'Godot_v3.6-stable_x11.64.zip',
];

// Utility to create ReleaseAsset objects from just a name
function makeReleaseAsset(name: string): ReleaseAsset {
    return {
        name,
        browser_download_url: `https://example.com/${name}`,
        content_type: 'application/zip',
        created_at: new Date().toISOString(),
        download_count: 0,
        id: 0,
        label: null,
        node_id: '',
        size: 0,
        state: 'uploaded',
        url: '',
        updated_at: new Date().toISOString(),
        uploader: null,
    } satisfies ReleaseAsset;
}

suite('Github Utils Tests', () => {
    describe('createAssetSummary (simplified tests)', () => {
        // Generate a subset of ReleaseAssets from allAssetNames

        it('tags each asset properly', () => {
            // Just do a quick check for a few samples
            const sampleNames = [
                'Godot_v4.3-stable_win32.exe.zip',
                'Godot_v4.3-stable_mono_osx.universal.zip',
                'Godot_v4.3-stable_linux.arm64.zip',
            ];

            for (const name of sampleNames) {
                const summary = createAssetSummary(makeReleaseAsset(name));
                // We won't test every single scenario, just some basics:
                if (name.includes('win32')) {
                    expect(summary.platform_tags).toContain('win32');
                    expect(summary.platform_tags).toContain('ia32');
                }
                if (name.includes('win64')) {
                    expect(summary.platform_tags).toContain('win32');
                    expect(summary.platform_tags).toContain('x64');
                }
                if (
                    name.includes('osx') ||
                    name.includes('macos') ||
                    name.includes('universal')
                ) {
                    expect(summary.platform_tags).toContain('darwin');
                }
                if (name.includes('linux')) {
                    expect(summary.platform_tags).toContain('linux');
                }
                if (name.includes('arm64')) {
                    expect(summary.platform_tags).toContain('arm64');
                }
                if (name.includes('arm32')) {
                    expect(summary.platform_tags).toContain('arm');
                }
                if (name.includes('32.zip') && !name.includes('arm32')) {
                    expect(summary.platform_tags).toContain('ia32');
                }
                if (name.includes('64.zip') && !name.includes('arm64')) {
                    expect(summary.platform_tags).toContain('x64');
                }
                if (name.includes('mono')) {
                    expect(summary.mono).toBe(true);
                } else {
                    expect(summary.mono).toBe(false);
                }
            }
        });
    });

    describe('getPlatformAsset (Windows, macOS, Linux)', () => {
        // Build all AssetSummaries from a subset of assetNames
        const summaries: AssetSummary[] = allAssetNames.map((name) =>
            createAssetSummary(makeReleaseAsset(name)),
        );

        it('finds Windows 64-bit asset (non-mono)', () => {
            const asset = getPlatformAsset(
                'win32',
                'x64',
                summaries.filter((a) => !a.mono),
            );
            expect(asset?.length).toBe(1);
            expect(asset?.[0].mono).toBeFalsy();
            expect(asset?.[0].name).toBe('Godot_v4.3-stable_win64.exe.zip');
        });

        it('finds Windows 64-bit asset (mono)', () => {
            const asset = getPlatformAsset(
                'win32',
                'x64',
                summaries.filter((a) => a.mono),
            );
            expect(asset?.length).toBe(1);
            expect(asset?.[0].mono).toBeTruthy();
            expect(asset?.[0].name).toBe('Godot_v4.3-stable_mono_win64.zip');
        });

        // windows 32bits

        it('finds Windows 32-bit asset (non-mono)', () => {
            const asset = getPlatformAsset(
                'win32',
                'ia32',
                summaries.filter((a) => !a.mono),
            );
            expect(asset?.length).toBe(1);
            expect(asset?.[0].mono).toBeFalsy();
            expect(asset?.[0].name).toBe('Godot_v4.3-stable_win32.exe.zip');
        });

        it('finds Windows 32-bit asset (mono)', () => {
            const asset = getPlatformAsset(
                'win32',
                'ia32',
                summaries.filter((a) => a.mono),
            );
            expect(asset?.length).toBe(1);
            expect(asset?.[0].mono).toBeTruthy();
            expect(asset?.[0].name).toBe('Godot_v4.3-stable_mono_win32.zip');
        });

        it('finds Windows arm64 asset (non-mono)', () => {
            const asset = getPlatformAsset(
                'win32',
                'arm64',
                summaries.filter((a) => !a.mono),
            );
            expect(asset?.length).toBe(1);
            expect(asset?.[0].mono).toBeFalsy();
            expect(asset?.[0].name).toBe(
                'Godot_v4.3-stable_windows_arm64.exe.zip',
            );
        });

        it('finds Windows arm64 asset (mono)', () => {
            const asset = getPlatformAsset(
                'win32',
                'arm64',
                summaries.filter((a) => a.mono),
            );
            expect(asset?.length).toBe(1);
            expect(asset?.[0].mono).toBeTruthy();
            expect(asset?.[0].name).toBe(
                'Godot_v4.3-stable_mono_windows_arm64.zip',
            );
        });

        it('finds macOS universal asset (non-mono)', () => {
            const x64Asset = getPlatformAsset(
                'darwin',
                'x64',
                summaries.filter((a) => !a.mono),
            );
            const arm64Asset = getPlatformAsset(
                'darwin',
                'arm64',
                summaries.filter((a) => !a.mono),
            );

            expect(x64Asset).toBeDefined();
            expect(x64Asset?.length).toBe(1);
            expect(x64Asset?.[0].name).toBe(
                'Godot_v4.3-stable_macos.universal.zip',
            );

            expect(arm64Asset).toBeDefined();
            expect(arm64Asset?.length).toBe(1);
            expect(arm64Asset?.[0].name).toBe(
                'Godot_v4.3-stable_macos.universal.zip',
            );
        });

        it('finds macOS universal asset (mono)', () => {
            const x64Asset = getPlatformAsset(
                'darwin',
                'x64',
                summaries.filter((a) => a.mono),
            );
            const arm64Asset = getPlatformAsset(
                'darwin',
                'arm64',
                summaries.filter((a) => a.mono),
            );

            expect(x64Asset).toBeDefined();
            expect(x64Asset?.length).toBe(1);
            expect(x64Asset?.[0].name).toBe(
                'Godot_v4.3-stable_mono_macos.universal.zip',
            );

            expect(arm64Asset).toBeDefined();
            expect(arm64Asset?.length).toBe(1);
            expect(arm64Asset?.[0].name).toBe(
                'Godot_v4.3-stable_mono_macos.universal.zip',
            );
        });

        it('finds Linux arm32 asset (non-mono)', () => {
            const asset = getPlatformAsset(
                'linux',
                'arm',
                summaries.filter((a) => !a.mono),
            );
            expect(asset?.length).toBe(1);
            expect(asset?.[0].name).toBe('Godot_v4.3-stable_linux.arm32.zip');
        });

        it('finds Linux arm32 asset (mono)', () => {
            const asset = getPlatformAsset(
                'linux',
                'arm',
                summaries.filter((a) => a.mono),
            );
            expect(asset?.length).toBe(1);
            expect(asset?.[0].name).toBe(
                'Godot_v4.3-stable_mono_linux_arm32.zip',
            );
        });

        it('finds Linux 64-bit asset (non-mono)', () => {
            const asset = getPlatformAsset(
                'linux',
                'x64',
                summaries.filter((a) => !a.mono),
            );
            expect(asset?.length).toBe(2);
            expect(asset?.[0].name).toBe('Godot_v4.3-stable_linux.x86_64.zip');
            expect(asset?.[1].name).toBe('Godot_v3.6-stable_x11.64.zip');
        });

        it('finds Linux 64-bit asset (mono)', () => {
            const asset = getPlatformAsset(
                'linux',
                'x64',
                summaries.filter((a) => a.mono),
            );
            expect(asset?.length).toBe(1);
            expect(asset?.[0].name).toBe(
                'Godot_v4.3-stable_mono_linux_x86_64.zip',
            );
        });
    });

    describe('Get Github Releases', () => {
        it('should get all sorted releases', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                status: 200,
                json: vi.fn().mockResolvedValue([
                    {
                        tag_name: '4.3-stable',
                        name: 'Godot 4.3-stable',
                        published_at: '2021-12-01T00:00:00Z',
                        draft: false,
                        prerelease: false,
                        assets: allAssetNames.map(makeReleaseAsset),
                    },
                    {
                        tag_name: '4.3-stable',
                        name: 'Godot 4.4-stable',
                        published_at: '2024-12-01T00:00:00Z',
                        draft: false,
                        prerelease: false,
                        assets: allAssetNames.map(makeReleaseAsset),
                    },
                ]),
            });

            const releases = await getReleases(
                'RELEASES',
                new Date(0),
                0,
                1,
                100,
            );
            expect(releases).toBeDefined();
            expect(releases.releases.length).toEqual(2);

            expect(releases.releases[0].name).toBe('Godot 4.3-stable');
            expect(releases.releases[1].name).toBe('Godot 4.4-stable');
        });

        it('should get all releases since', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                status: 200,
                json: vi
                    .fn()
                    .mockResolvedValueOnce([
                        {
                            tag_name: '4.3-stable',
                            name: 'Godot 4.3-stable',
                            published_at: '2021-12-01T00:00:00Z',
                            draft: false,
                            prerelease: false,
                            assets: allAssetNames.map(makeReleaseAsset),
                        },
                        {
                            tag_name: '4.3-stable',
                            name: 'Godot 4.3-stable',
                            published_at: '2024-12-01T00:00:00Z',
                            draft: false,
                            prerelease: false,
                            assets: allAssetNames.map(makeReleaseAsset),
                        },
                    ])
                    .mockResolvedValueOnce([]),
            });

            const releases = await getReleases(
                'RELEASES',
                new Date(2024, 0, 1),
                0,
                1,
                2,
            );
            expect(releases).toBeDefined();
            expect(releases.releases.length).toEqual(1);
        });

        it('should get no releases', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                status: 200,
                json: vi.fn().mockResolvedValue([
                    {
                        tag_name: '4.3-stable',
                        name: 'Godot 4.3-stable',
                        published_at: '2021-12-01T00:00:00Z',
                        draft: false,
                        prerelease: false,
                        assets: allAssetNames.map(makeReleaseAsset),
                    },
                    {
                        tag_name: '4.3-stable',
                        name: 'Godot 4.3-stable',
                        published_at: '2024-12-01T00:00:00Z',
                        draft: false,
                        prerelease: false,
                        assets: allAssetNames.map(makeReleaseAsset),
                    },
                ]),
            });

            const releases = await getReleases(
                'RELEASES',
                new Date(2025, 0, 1),
                0,
                1,
                100,
            );
            expect(releases).toBeDefined();
            expect(releases.releases.length).toEqual(0);
        });

        it('should get releases with version filter', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                status: 200,
                json: vi.fn().mockResolvedValue([
                    {
                        tag_name: '4.3-stable',
                        name: 'Godot 4.3-stable',
                        published_at: '2021-12-01T00:00:00Z',
                        draft: false,
                        prerelease: false,
                        assets: allAssetNames.map(makeReleaseAsset),
                    },
                    {
                        tag_name: 'bla 2.3-stable',
                        name: '2.3-stable',
                        published_at: '2021-12-01T00:00:00Z',
                        draft: false,
                        prerelease: false,
                        assets: allAssetNames.map(makeReleaseAsset),
                    },
                    {
                        tag_name: '4.4-stable',
                        name: 'Godot 4.4-stable',
                        published_at: '2024-12-01T00:00:00Z',
                        draft: false,
                        prerelease: false,
                        assets: allAssetNames.map(makeReleaseAsset),
                    },
                ]),
            });

            const releases = await getReleases(
                'RELEASES',
                new Date(0),
                3,
                1,
                100,
            );
            expect(releases).toBeDefined();
            expect(releases.releases.length).toEqual(2);
            expect(releases.releases[0].name).toBe('Godot 4.4-stable');
        });

        it('should not crash if name is missing', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                status: 200,
                json: vi.fn().mockResolvedValue([
                    {
                        tag_name: '4.3-stable',
                        published_at: '2021-12-01T00:00:00Z',
                        draft: false,
                        prerelease: false,
                        assets: allAssetNames.map(makeReleaseAsset),
                    },
                ]),
            });

            const releases = await getReleases(
                'RELEASES',
                new Date(0),
                0,
                1,
                100,
            );
            expect(releases).toBeDefined();
            expect(releases.releases.length).toEqual(1);
        });

        it('should fall back to tag name if no name', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                status: 200,
                json: vi.fn().mockResolvedValue([
                    {
                        tag_name: '4.3-stable',
                        published_at: '2021-12-01T00:00:00Z',
                        draft: false,
                        prerelease: false,
                        assets: allAssetNames.map(makeReleaseAsset),
                    },
                ]),
            });

            const releases = await getReleases(
                'RELEASES',
                new Date(0),
                0,
                1,
                100,
            );
            expect(releases).toBeDefined();
            expect(releases.releases.length).toEqual(1);
            expect(releases.releases[0].name).toBe('4.3-stable');
        });

        it('should have a numeric version_number', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                status: 200,
                json: vi.fn().mockResolvedValue([
                    {
                        tag_name: '4.3-stable',
                        published_at: '2021-12-01T00:00:00Z',
                        draft: false,
                        prerelease: false,
                        assets: allAssetNames.map(makeReleaseAsset),
                    },
                ]),
            });

            const releases = await getReleases(
                'RELEASES',
                new Date(0),
                0,
                1,
                100,
            );
            expect(releases).toBeDefined();
            expect(releases.releases.length).toEqual(1);
            expect(releases.releases[0].version_number).toBe(4.3);
        });

        it('should fall back to name if name is empty string', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                status: 200,
                json: vi.fn().mockResolvedValue([
                    {
                        tag_name: '4.3-stable',
                        name: '',
                        published_at: '2021-12-01T00:00:00Z',
                        draft: false,
                        prerelease: false,
                        assets: allAssetNames.map(makeReleaseAsset),
                    },
                    {
                        tag_name: '4.3-stable',
                        name: '  ',
                        published_at: '2021-12-01T00:00:00Z',
                        draft: false,
                        prerelease: false,
                        assets: allAssetNames.map(makeReleaseAsset),
                    },
                    {
                        tag_name: '4.3-stable',
                        published_at: '2021-12-01T00:00:00Z',
                        draft: false,
                        prerelease: false,
                        assets: allAssetNames.map(makeReleaseAsset),
                    },
                ]),
            });

            const releases = await getReleases(
                'RELEASES',
                new Date(0),
                0,
                1,
                100,
            );
            expect(releases).toBeDefined();
            expect(releases.releases.length).toEqual(3);
            expect(releases.releases[0].name).toBe('4.3-stable');
        });

        it('should skip release if no tag name', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                status: 200,
                json: vi.fn().mockResolvedValue([
                    {
                        published_at: '2021-12-01T00:00:00Z',
                        draft: false,
                        prerelease: false,
                        assets: allAssetNames.map(makeReleaseAsset),
                    },
                    {
                        tag_name: '',
                        published_at: '2021-12-01T00:00:00Z',
                        draft: false,
                        prerelease: false,
                        assets: allAssetNames.map(makeReleaseAsset),
                    },
                    {
                        tag_name: '  ',
                        published_at: '2021-12-01T00:00:00Z',
                        draft: false,
                        prerelease: false,
                        assets: allAssetNames.map(makeReleaseAsset),
                    },
                ]),
            });

            const releases = await getReleases(
                'RELEASES',
                new Date(0),
                0,
                1,
                100,
            );
            expect(releases).toBeDefined();
            expect(releases.releases.length).toEqual(0);
        });
    });
});
