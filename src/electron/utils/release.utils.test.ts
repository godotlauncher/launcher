import {
    afterEach,
    beforeEach,
    describe,
    expect,
    suite,
    test,
    vi,
} from 'vitest';
import type { ReleaseAsset } from '../types/github.js';
import {
    __resetInstalledReleasesStoreForTesting,
    __resetReleaseCachesForTesting,
    addStoredInstalledRelease,
    createAssetSummary,
    downloadReleaseAsset,
    getPlatformAsset,
    getStoredAvailableReleases,
    getStoredInstalledReleases,
    parseReleaseName,
    removeProjectEditorUsingRelease,
    removeStoredInstalledRelease,
    saveStoredInstalledReleases,
    sortReleases,
    storeAvailableReleases,
} from './releases.utils.js';

// Mock the modules needed by releases.utils.ts
vi.mock('node:fs', () => ({
    existsSync: vi.fn(),
    createWriteStream: vi.fn(() => ({
        on: vi.fn(),
        once: vi.fn(),
        emit: vi.fn(),
        close: vi.fn(),
        pipe: vi.fn().mockReturnThis(),
    })),
    promises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
    },
}));

vi.mock('node:stream', () => ({
    Readable: {
        fromWeb: vi.fn(() => ({
            pipe: vi.fn((dest) => dest),
            on: vi.fn(),
            push: vi.fn(),
        })),
    },
}));

vi.mock('node:stream/promises', () => ({
    finished: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('electron-log', () => ({
    default: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        log: vi.fn(),
    },
}));

vi.mock('./projects.utils.js', () => ({
    getStoredProjectsList: vi.fn().mockResolvedValue([]),
}));

const platformUtilsMocks = vi.hoisted(() => ({
    getDefaultDirs: vi.fn().mockReturnValue({
        configDir: '/fake/config/dir',
        dataDir: '/fake/data/dir',
        projectDir: '/fake/project/dir',
        prefsPath: '/fake/config/dir/prefs.json',
        releaseCachePath: '/fake/config/dir/releases.json',
        installedReleasesCachePath: '/fake/config/dir/installed.json',
        prereleaseCachePath: '/fake/config/dir/prereleases.json',
    }),
}));

vi.mock('./platform.utils.js', () => platformUtilsMocks);

vi.mock('./godot.utils.js', () => ({
    removeProjectEditor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('electron', () => ({
    Menu: {
        setApplicationMenu: vi.fn(),
    },
    ipcMain: {
        on: vi.fn(),
        handle: vi.fn(),
    },
    app: {
        isPackaged: false,
        getName: vi.fn(),
        getVersion: vi.fn(),
        getLocale: vi.fn(),
        getPath: vi.fn(),
        on: vi.fn(),
        whenReady: vi.fn(),
        quit: vi.fn(),
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

import * as fs from 'node:fs';
import { Readable } from 'node:stream';
import * as streamPromises from 'node:stream/promises';
// Import modules for direct access to mocks in tests
import logger from 'electron-log';
import { removeProjectEditor } from './godot.utils.js';
import { getDefaultDirs } from './platform.utils.js';
import { getStoredProjectsList } from './projects.utils.js';

// Test data
const versions = [
    { version: '4.3-stable' },
    { version: '4.4-beta1' },
    { version: '4.4-dev3' },
    { version: '4.2-stable' },
    { version: '2.0.0.1-stable' },
    { version: '3.6-beta10' },
    { version: '4.4-stable' },
];

suite('Releases Utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Parse release names', () => {
        test('Should parse stable release name', () => {
            const parsed = parseReleaseName('4.3-stable');
            expect(parsed).toMatchObject({
                major: 4,
                minor: 3,
                patch: 0,
                type: 'stable',
                suffixNumber: 0,
            });
        });

        test('Should parse release name with suffix', () => {
            const parsed = parseReleaseName('4.4-beta1');
            expect(parsed).toMatchObject({
                major: 4,
                minor: 4,
                patch: 0,
                type: 'beta',
                suffixNumber: 1,
            });
        });

        test('Should parse release name with 3 components', () => {
            const parsed = parseReleaseName('4.4.4-dev3');
            expect(parsed).toMatchObject({
                major: 4,
                minor: 4,
                patch: 4,
                type: 'dev',
                suffixNumber: 3,
            });
        });

        test('Should parse release name with 4 components', () => {
            const parsed = parseReleaseName('2.1.2.3-dev69');
            expect(parsed).toMatchObject({
                major: 2,
                minor: 1,
                patch: 2,
                revision: 3,
                type: 'dev',
                suffixNumber: 69,
            });
        });
    });

    describe('Sort releases', () => {
        test('Should sort releases', () => {
            const sorted = [...versions].sort(sortReleases);

            expect(sorted.map((s) => s.version)).toEqual([
                '4.4-stable',
                '4.4-beta1',
                '4.4-dev3',
                '4.3-stable',
                '4.2-stable',
                '3.6-beta10',
                '2.0.0.1-stable',
            ]);
        });
    });

    describe('createAssetSummary', () => {
        const baseAssetProps: Omit<
            ReleaseAsset,
            'name' | 'browser_download_url'
        > = {
            id: 1,
            url: '',
            node_id: '',
            state: 'uploaded',
            uploader: null,
            label: '',
            content_type: '',
            size: 0,
            download_count: 0,
            created_at: '',
            updated_at: '',
        };

        test('should correctly summarize a Windows 64-bit asset', () => {
            const asset: ReleaseAsset = {
                name: 'Godot_v3.6-stable_win64.exe.zip',
                browser_download_url:
                    'https://example.com/download/Godot_v3.6-stable_win64.exe.zip',
                ...baseAssetProps,
            };
            const summary = createAssetSummary(asset);
            expect(summary).toEqual({
                name: 'Godot_v3.6-stable_win64.exe.zip',
                download_url:
                    'https://example.com/download/Godot_v3.6-stable_win64.exe.zip',
                platform_tags: ['win32', 'x64'],
                mono: false,
            });
        });

        test('should correctly summarize a Windows ARM64 asset', () => {
            const asset: ReleaseAsset = {
                name: 'Godot_v4.5.1-stable_windows_arm64.exe.zip',
                browser_download_url:
                    'https://example.com/download/Godot_v4.5.1-stable_windows_arm64.exe.zip',
                ...baseAssetProps,
            };
            const summary = createAssetSummary(asset);
            expect(summary).toEqual({
                name: 'Godot_v4.5.1-stable_windows_arm64.exe.zip',
                download_url:
                    'https://example.com/download/Godot_v4.5.1-stable_windows_arm64.exe.zip',
                platform_tags: ['win32', 'arm64'],
                mono: false,
            });
        });

        test('should correctly identify a mono asset (win64 mono)', () => {
            const asset: ReleaseAsset = {
                name: 'Godot_v3.6-stable_mono_win64.exe.zip',
                browser_download_url:
                    'https://example.com/download/Godot_v3.6-stable_mono_win64.exe.zip',
                ...baseAssetProps,
            };
            const summary = createAssetSummary(asset);
            expect(summary.mono).toBe(true);
            expect(summary.platform_tags).toEqual(['win32', 'x64']);
        });

        test('should correctly identify a mono asset (windows arm64 mono)', () => {
            const asset: ReleaseAsset = {
                name: 'Godot_v4.5.1-stable_mono_windows_arm64.zip',
                browser_download_url:
                    'https://example.com/download/Godot_v4.5.1-stable_mono_windows_arm64.zip',
                ...baseAssetProps,
            };
            const summary = createAssetSummary(asset);
            expect(summary.mono).toBe(true);
            expect(summary.platform_tags).toEqual(['win32', 'arm64']);
        });

        test('should correctly summarize a Linux 64-bit asset', () => {
            const asset: ReleaseAsset = {
                name: 'Godot_v4.0-stable_linux.x86_64.zip',
                browser_download_url:
                    'https://example.com/Godot_v4.0-stable_linux.x86_64.zip',
                ...baseAssetProps,
            };
            const summary = createAssetSummary(asset);
            expect(summary).toEqual({
                name: 'Godot_v4.0-stable_linux.x86_64.zip',
                download_url:
                    'https://example.com/Godot_v4.0-stable_linux.x86_64.zip',
                platform_tags: ['linux', 'x64'],
                mono: false,
            });
        });

        test('should correctly summarize a macOS universal asset', () => {
            const asset: ReleaseAsset = {
                name: 'Godot_v4.0-stable_macos.universal.zip',
                browser_download_url:
                    'https://example.com/Godot_v4.0-stable_macos.universal.zip',
                ...baseAssetProps,
            };
            const summary = createAssetSummary(asset);
            expect(summary).toEqual({
                name: 'Godot_v4.0-stable_macos.universal.zip',
                download_url:
                    'https://example.com/Godot_v4.0-stable_macos.universal.zip',
                platform_tags: ['darwin', 'x64', 'arm64'],
                mono: false,
            });
        });
    });

    describe('getPlatformAsset', () => {
        const assets: AssetSummary[] = [
            {
                name: 'win64.zip',
                download_url: 'url1',
                platform_tags: ['win32', 'x64'],
                mono: false,
            },
            {
                name: 'linux_x86_64.zip',
                download_url: 'url2',
                platform_tags: ['linux', 'x64'],
                mono: false,
            },
            {
                name: 'osx_arm64.zip',
                download_url: 'url3',
                platform_tags: ['darwin', 'arm64'],
                mono: true,
            },
            {
                name: 'linux_arm64.zip',
                download_url: 'url4',
                platform_tags: ['linux', 'arm64'],
                mono: false,
            },
            {
                name: 'win32.zip',
                download_url: 'url5',
                platform_tags: ['win32', 'ia32'],
                mono: false,
            },
            {
                name: 'windows_arm64.zip',
                download_url: 'url6',
                platform_tags: ['win32', 'arm64'],
                mono: false,
            },
            {
                name: 'windows_arm64_mono.zip',
                download_url: 'url7',
                platform_tags: ['win32', 'arm64'],
                mono: true,
            },
        ];

        test('should find a matching asset for windows x64', () => {
            const result = getPlatformAsset('win32', 'x64', assets);
            expect(result).toEqual([assets[0]]);
        });

        test('should find a matching asset for linux arm64', () => {
            const result = getPlatformAsset('linux', 'arm64', assets);
            expect(result).toEqual([assets[3]]);
        });

        test('should return an empty array if no matching asset is found for platform', () => {
            const result = getPlatformAsset('android', 'x64', assets);
            expect(result).toEqual([]);
        });

        test('should find matching assets for windows arm64', () => {
            const result = getPlatformAsset('win32', 'arm64', assets);
            expect(result).toEqual([assets[5], assets[6]]);
        });

        test('should filter mono windows arm64 assets when provided', () => {
            const result = getPlatformAsset(
                'win32',
                'arm64',
                assets.filter((asset) => asset.mono),
            );
            expect(result).toEqual([assets[6]]);
        });
    });

    describe('downloadReleaseAsset', () => {
        const mockAsset: AssetSummary = {
            name: 'test_asset.zip',
            download_url: 'http://example.com/test_asset.zip',
            platform_tags: ['test'],
            mono: false,
        };
        const downloadPath = '/fake/path/test_asset.zip';

        beforeEach(() => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                statusText: 'OK',
                body: {}, // Simple mock body
            });

            // Reset mocks
            vi.mocked(fs.createWriteStream).mockClear();
            vi.mocked(streamPromises.finished).mockClear();
            vi.mocked(Readable.fromWeb).mockClear();
        });

        test('should download and save an asset successfully', async () => {
            await downloadReleaseAsset(mockAsset, downloadPath);

            expect(global.fetch).toHaveBeenCalledWith(mockAsset.download_url);
            expect(fs.createWriteStream).toHaveBeenCalledWith(downloadPath, {
                flags: 'wx',
            });
        });

        test('should throw an error if download fetch fails', async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: false,
                statusText: 'Network Error',
                body: null,
            } as any);

            await expect(
                downloadReleaseAsset(mockAsset, downloadPath),
            ).rejects.toThrow('Failed to download asset: Network Error');
        });
    });

    describe('Available releases storage', () => {
        beforeEach(() => {
            vi.mocked(fs.existsSync).mockReset();
            vi.mocked(fs.promises.readFile).mockReset();
            vi.mocked(fs.promises.writeFile).mockReset();
            __resetReleaseCachesForTesting();
        });
        afterEach(() => {
            __resetReleaseCachesForTesting();
        });

        test('should store available releases correctly', async () => {
            const testDate = new Date(2024, 0, 1);
            const releases = [{ version: '4.4-stable' }] as ReleaseSummary[];
            vi.mocked(fs.promises.writeFile).mockResolvedValueOnce(
                undefined as unknown as undefined,
            );

            const cached = await storeAvailableReleases(
                '/tmp/releases.json',
                testDate,
                releases,
            );

            expect(fs.promises.writeFile).toHaveBeenCalledWith(
                '/tmp/releases.json',
                expect.any(String),
                'utf-8',
            );
            expect(cached.lastPublishDate).toEqual(testDate);
            expect(cached.releases).toEqual(releases);
            expect(cached.lastUpdated).toBeGreaterThan(0);
        });

        test('should get stored available releases when file exists', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            const testDateStr = new Date(2024, 0, 1).toISOString();
            vi.mocked(fs.promises.readFile).mockResolvedValueOnce(
                JSON.stringify({
                    lastUpdated: 123456,
                    releases: [{ version: '4.4-stable' }],
                    lastPublishDate: testDateStr,
                }),
            );

            const result =
                await getStoredAvailableReleases('/tmp/releases.json');

            expect(fs.existsSync).toHaveBeenCalledWith('/tmp/releases.json');
            expect(fs.promises.readFile).toHaveBeenCalledWith(
                '/tmp/releases.json',
                'utf-8',
            );
            expect(result.lastPublishDate).toEqual(new Date(testDateStr));
            expect(result.releases).toEqual([{ version: '4.4-stable' }]);
            expect(result.lastUpdated).toBe(123456);
        });

        test('should return empty releases when file does not exist', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);

            const result =
                await getStoredAvailableReleases('/tmp/releases.json');

            expect(result).toEqual({
                lastPublishDate: new Date(0),
                lastUpdated: 0,
                releases: [],
            });
        });

        test('should return empty releases when file reading fails', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.promises.readFile).mockRejectedValueOnce(
                new Error('Failed to read'),
            );

            const result =
                await getStoredAvailableReleases('/tmp/releases.json');

            expect(result).toEqual({
                lastPublishDate: new Date(0),
                lastUpdated: 0,
                releases: [],
            });
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('Installed releases management', () => {
        beforeEach(() => {
            vi.mocked(fs.existsSync).mockReset();
            vi.mocked(fs.promises.readFile).mockReset();
            vi.mocked(fs.promises.writeFile).mockReset();
            __resetInstalledReleasesStoreForTesting();
            platformUtilsMocks.getDefaultDirs.mockReturnValue({
                configDir: '/fake/config/dir',
                dataDir: '/fake/data/dir',
                projectDir: '/fake/project/dir',
                prefsPath: '/fake/config/dir/prefs.json',
                releaseCachePath: '/fake/config/dir/releases.json',
                installedReleasesCachePath: '/tmp/installed.json',
                prereleaseCachePath: '/fake/config/dir/prereleases.json',
            });
        });

        test('should get stored installed releases when file exists', async () => {
            vi.mocked(fs.existsSync).mockReturnValueOnce(true);
            const mockReleases = [
                { version: '4.4-stable', mono: false, version_number: 1 },
                { version: '4.5-beta1', mono: true, version_number: 2 },
            ];
            vi.mocked(fs.promises.readFile).mockResolvedValueOnce(
                JSON.stringify(mockReleases),
            );

            const result = await getStoredInstalledReleases();

            expect(result).toEqual(
                mockReleases.map((release) => ({ ...release, valid: true })),
            );
        });

        test('should get empty array when installed releases file does not exist', async () => {
            vi.mocked(fs.existsSync).mockReturnValueOnce(false);

            const result = await getStoredInstalledReleases();

            expect(result).toEqual([]);
        });

        test('should add a release to installed releases', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            const existingReleases = [
                {
                    version: '4.4-stable',
                    mono: true,
                    version_number: 1,
                    valid: true,
                },
            ];
            vi.mocked(fs.promises.readFile).mockResolvedValueOnce(
                JSON.stringify(existingReleases),
            );
            vi.mocked(fs.promises.writeFile).mockResolvedValueOnce(
                undefined as unknown as undefined,
            );

            const newRelease = {
                version: '4.5-beta1',
                mono: false,
                version_number: 2,
                valid: true,
            } as InstalledRelease;
            const result = await addStoredInstalledRelease(newRelease);

            expect(fs.promises.writeFile).toHaveBeenCalledWith(
                '/tmp/installed.json',
                expect.stringContaining('4.5-beta1'),
                'utf-8',
            );
            expect(result).toHaveLength(2);
            expect(
                result.some((release) => release.version === '4.4-stable'),
            ).toBe(true);
            expect(
                result.some((release) => release.version === '4.5-beta1'),
            ).toBe(true);
        });

        test('should remove a release from installed releases', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            const existingReleases = [
                {
                    version: '4.4-stable',
                    mono: true,
                    version_number: 1,
                    valid: true,
                },
                {
                    version: '4.5-beta1',
                    mono: false,
                    version_number: 2,
                    valid: true,
                },
            ];
            vi.mocked(fs.promises.readFile).mockResolvedValueOnce(
                JSON.stringify(existingReleases),
            );
            vi.mocked(fs.promises.writeFile).mockResolvedValueOnce(
                undefined as unknown as undefined,
            );

            const releaseToRemove = {
                version: '4.4-stable',
                mono: true,
            } as InstalledRelease;
            const result = await removeStoredInstalledRelease(releaseToRemove);

            expect(result).toHaveLength(1);
            expect(result[0].version).toBe('4.5-beta1');
        });

        test('should save installed releases directly', async () => {
            const releases = [
                { version: '4.6-stable', mono: false, version_number: 3 },
            ] as InstalledRelease[];

            await saveStoredInstalledReleases(releases);

            expect(fs.promises.writeFile).toHaveBeenCalledTimes(1);
            const call = vi.mocked(fs.promises.writeFile).mock.calls[0];
            expect(call[0]).toBe('/tmp/installed.json');
            expect(call[2]).toBe('utf-8');

            const payload = JSON.parse(call[1] as string) as InstalledRelease[];
            expect(payload).toEqual(
                releases.map((release) => ({
                    ...release,
                    valid: true,
                })),
            );
        });
    });

    describe('removeProjectEditorUsingRelease', () => {
        const mockRelease = {
            version: '4.4-stable',
            mono: false,
            editor_path: '/fake/path/godot',
        } as InstalledRelease;
        beforeEach(() => {
            vi.mocked(getDefaultDirs).mockReturnValue({
                configDir: '/fake/config/dir',
                dataDir: '/fake/data/dir',
                projectDir: '/fake/project/dir',
                prefsPath: '/fake/config/dir/prefs.json',
                releaseCachePath: '/fake/config/dir/releases.json',
                installedReleasesCachePath: '/fake/config/dir/installed.json',
                prereleaseCachePath: '/fake/config/dir/prereleases.json',
                migrationStatePath: '/fake/config/dir/migrations.json',
            } satisfies ReturnType<typeof getDefaultDirs>);

            vi.mocked(getStoredProjectsList).mockResolvedValue([
                {
                    name: 'Project1',
                    config_version: 5,
                    editor_settings_file: 'settings.cfg',
                    launch_path: '',
                    editor_settings_path: '',
                    last_opened: null,
                    path: '',
                    renderer: '',
                    version: '',
                    version_number: 0,
                    withGit: false,
                    withVSCode: false,
                    valid: true,
                    release: {
                        editor_path: '/fake/path/godot',
                        arch: 'x64',
                        config_version: 5,
                        install_path: '',
                        platform: 'win32',
                        prerelease: false,
                        published_at: null,
                        valid: true,
                        version: '4.4-stable',
                        version_number: 4.4,
                        mono: false,
                    },
                },
                {
                    name: 'Project2',
                    config_version: 5,
                    editor_settings_file: 'settings.cfg',
                    launch_path: '',
                    editor_settings_path: '',
                    last_opened: null,
                    path: '',
                    renderer: '',
                    version: '',
                    version_number: 0,
                    withGit: false,
                    withVSCode: false,
                    valid: true,
                    release: {
                        arch: 'x64',
                        editor_path: '/other/path/godot',
                        config_version: 5,
                        install_path: '',
                        platform: 'win32',
                        prerelease: false,
                        published_at: null,
                        valid: true,
                        version: '4.5-stable',
                        version_number: 4.5,
                        mono: false,
                    },
                },
            ]);

            vi.mocked(removeProjectEditor).mockResolvedValue(undefined);
        });
        test('should remove editor from projects using the release', async () => {
            await removeProjectEditorUsingRelease(mockRelease);

            // Instead of checking the exact path, just verify it was called
            expect(getStoredProjectsList).toHaveBeenCalled();
            expect(removeProjectEditor).toHaveBeenCalledTimes(1);
            expect(removeProjectEditor).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Project1' }),
            );
        });

        test('should not call removeProjectEditor if no projects use the release', async () => {
            const mockReleaseUnused = {
                version: '4.4-stable',
                mono: false,
                editor_path: '/unused/path/godot',
            } as InstalledRelease;

            await removeProjectEditorUsingRelease(mockReleaseUnused);

            expect(removeProjectEditor).not.toHaveBeenCalled();
        });
    });
});
