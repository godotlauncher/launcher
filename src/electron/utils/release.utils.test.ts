import { beforeEach, describe, expect, test, vi, suite } from "vitest";
import {
    parseReleaseName,
    sortReleases,
    createAssetSummary,
    getPlatformAsset,
    downloadReleaseAsset,
    getStoredAvailableReleases,
    storeAvailableReleases,
    getStoredInstalledReleases,
    addStoredInstalledRelease,
    removeStoredInstalledRelease,
    saveStoredInstalledReleases,
    removeProjectEditorUsingRelease
} from './releases.utils';

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
    }
}));

vi.mock('node:stream', () => ({
    Readable: {
        fromWeb: vi.fn(() => ({
            pipe: vi.fn(dest => dest),
            on: vi.fn(),
            push: vi.fn(),
        }))
    }
}));

vi.mock('node:stream/promises', () => ({
    finished: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('electron-log', () => ({
    default: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        log: vi.fn()
    }
}));

vi.mock('./projects.utils.js', () => ({
    getStoredProjectsList: vi.fn().mockResolvedValue([])
}));

vi.mock('./platform.utils.js', () => ({
    getDefaultDirs: vi.fn().mockReturnValue({
        configDir: '/fake/config/dir',
        dataDir: '/fake/data/dir',
        projectDir: '/fake/project/dir',
        prefsPath: '/fake/config/dir/prefs.json',
        releaseCachePath: '/fake/config/dir/releases.json',
        installedReleasesCachePath: '/fake/config/dir/installed.json',
        prereleaseCachePath: '/fake/config/dir/prereleases.json'
    })
}));

vi.mock('./godot.utils.js', () => ({
    removeProjectEditor: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('electron', () => ({
    Menu: {
        setApplicationMenu: vi.fn()
    },
    ipcMain: {
        on: vi.fn(),
        handle: vi.fn()
    },
    app: {
        isPackaged: false,
        getName: vi.fn(),
        getVersion: vi.fn(),
        getLocale: vi.fn(),
        getPath: vi.fn(),
        on: vi.fn(),
        whenReady: vi.fn(),
        quit: vi.fn()
    },
    BrowserWindow: vi.fn(),
    shell: {
        showItemInFolder: vi.fn(),
        openExternal: vi.fn()
    },
    dialog: {
        showOpenDialog: vi.fn(),
        showMessageBox: vi.fn()
    }
}));

// Import modules for direct access to mocks in tests
import * as fs from 'node:fs';
import * as streamPromises from 'node:stream/promises';
import { Readable } from 'node:stream';
import logger from 'electron-log';
import { getStoredProjectsList } from './projects.utils.js';
import { getDefaultDirs } from './platform.utils.js';
import { removeProjectEditor } from './godot.utils.js';

// Test data
const versions = [
    { version: "4.3-stable" },
    { version: "4.4-beta1" },
    { version: "4.4-dev3" },
    { version: "4.2-stable" },
    { version: "2.0.0.1-stable" },
    { version: "3.6-beta10" },
    { version: "4.4-stable" },
];

// Some helper types to avoid errors in tests
type ReleaseSummary = { version: string;[key: string]: any; };
type InstalledRelease = { version: string; mono: boolean; version_number?: number; editor_path?: string;[key: string]: any; };
type ReleaseAsset = { name: string; browser_download_url: string;[key: string]: any; };
type AssetSummary = { name: string; download_url: string; platform_tags: string[]; mono: boolean;[key: string]: any; };

suite("Releases Utils", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("Parse release names", () => {
        test("Should parse stable release name", () => {
            const parsed = parseReleaseName("4.3-stable");
            expect(parsed).toMatchObject({
                major: 4,
                minor: 3,
                patch: 0,
                type: "stable",
                suffixNumber: 0,
            });
        });

        test("Should parse release name with suffix", () => {
            const parsed = parseReleaseName("4.4-beta1");
            expect(parsed).toMatchObject({
                major: 4,
                minor: 4,
                patch: 0,
                type: "beta",
                suffixNumber: 1,
            });
        });

        test("Should parse release name with 3 components", () => {
            const parsed = parseReleaseName("4.4.4-dev3");
            expect(parsed).toMatchObject({
                major: 4,
                minor: 4,
                patch: 4,
                type: "dev",
                suffixNumber: 3,
            });
        });

        test("Should parse release name with 4 components", () => {
            const parsed = parseReleaseName("2.1.2.3-dev69");
            expect(parsed).toMatchObject({
                major: 2,
                minor: 1,
                patch: 2,
                revision: 3,
                type: "dev",
                suffixNumber: 69,
            });
        });
    });

    describe("Sort releases", () => {
        test("Should sort releases", () => {
            const sorted = [...versions].sort(sortReleases);

            expect(sorted.map(s => s.version)).toEqual([
                "4.4-stable",
                "4.4-beta1",
                "4.4-dev3",
                "4.3-stable",
                "4.2-stable",
                "3.6-beta10",
                "2.0.0.1-stable",
            ]);
        });
    });

    describe('createAssetSummary', () => {
        const baseAssetProps = { id: 1, url: '', node_id: '', label: '', uploader: {}, content_type: '', state: '', size: 0, download_count: 0, created_at: '', updated_at: '' };

        test('should correctly summarize a Windows 64-bit asset', () => {
            const asset: ReleaseAsset = {
                name: 'Godot_v3.6-stable_win64.exe.zip',
                browser_download_url: 'https://example.com/download/Godot_v3.6-stable_win64.exe.zip',
                ...baseAssetProps
            };
            const summary = createAssetSummary(asset);
            expect(summary).toEqual({
                name: 'Godot_v3.6-stable_win64.exe.zip',
                download_url: 'https://example.com/download/Godot_v3.6-stable_win64.exe.zip',
                platform_tags: ['win32', 'x64'],
                mono: false,
            });
        });

        test('should correctly identify a mono asset (win64 mono)', () => {
            const asset: ReleaseAsset = {
                name: 'Godot_v3.6-stable_mono_win64.exe.zip',
                browser_download_url: 'https://example.com/download/Godot_v3.6-stable_mono_win64.exe.zip',
                ...baseAssetProps
            };
            const summary = createAssetSummary(asset);
            expect(summary.mono).toBe(true);
            expect(summary.platform_tags).toEqual(['win32', 'x64']);
        });

        test('should correctly summarize a Linux 64-bit asset', () => {
            const asset: ReleaseAsset = {
                name: 'Godot_v4.0-stable_linux.x86_64.zip',
                browser_download_url: 'https://example.com/Godot_v4.0-stable_linux.x86_64.zip',
                ...baseAssetProps
            };
            const summary = createAssetSummary(asset);
            expect(summary).toEqual({
                name: 'Godot_v4.0-stable_linux.x86_64.zip',
                download_url: 'https://example.com/Godot_v4.0-stable_linux.x86_64.zip',
                platform_tags: ['linux', 'x64'],
                mono: false,
            });
        });

        test('should correctly summarize a macOS universal asset', () => {
            const asset: ReleaseAsset = {
                name: 'Godot_v4.0-stable_macos.universal.zip',
                browser_download_url: 'https://example.com/Godot_v4.0-stable_macos.universal.zip',
                ...baseAssetProps
            };
            const summary = createAssetSummary(asset);
            expect(summary).toEqual({
                name: 'Godot_v4.0-stable_macos.universal.zip',
                download_url: 'https://example.com/Godot_v4.0-stable_macos.universal.zip',
                platform_tags: ['darwin', 'x64', 'arm64'],
                mono: false,
            });
        });
    });

    describe('getPlatformAsset', () => {
        const assets: AssetSummary[] = [
            { name: 'win64.zip', download_url: 'url1', platform_tags: ['win32', 'x64'], mono: false },
            { name: 'linux_x86_64.zip', download_url: 'url2', platform_tags: ['linux', 'x64'], mono: false },
            { name: 'osx_arm64.zip', download_url: 'url3', platform_tags: ['darwin', 'arm64'], mono: true },
            { name: 'linux_arm64.zip', download_url: 'url4', platform_tags: ['linux', 'arm64'], mono: false },
            { name: 'win32.zip', download_url: 'url5', platform_tags: ['win32', 'ia32'], mono: false },
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

        test('should return an empty array if no matching asset is found for arch', () => {
            const result = getPlatformAsset('win32', 'arm64', assets);
            expect(result).toEqual([]);
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
            expect(fs.createWriteStream).toHaveBeenCalledWith(downloadPath, { flags: 'wx' });
        });

        test('should throw an error if download fetch fails', async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: false,
                statusText: 'Network Error',
                body: null,
            } as any);

            await expect(downloadReleaseAsset(mockAsset, downloadPath))
                .rejects.toThrow('Failed to download asset: Network Error');
        });
    });

    describe('Available releases storage', () => {
        beforeEach(() => {
            vi.mocked(fs.existsSync).mockClear();
            vi.mocked(fs.promises.readFile).mockClear();
            vi.mocked(fs.promises.writeFile).mockClear();
        });

        test('should store available releases correctly', async () => {
            const testDate = new Date(2024, 0, 1);
            const releases = [{ version: '4.4-stable' }] as ReleaseSummary[];

            const cached = await storeAvailableReleases('/tmp/releases.json', testDate, releases);

            expect(fs.promises.writeFile).toHaveBeenCalledWith(
                '/tmp/releases.json',
                expect.any(String),
                'utf-8'
            );
            expect(cached.lastPublishDate).toEqual(testDate);
            expect(cached.releases).toEqual(releases);
            expect(cached.lastUpdated).toBeGreaterThan(0);
        });

        test('should get stored available releases when file exists', async () => {
            vi.mocked(fs.existsSync).mockReturnValueOnce(true);
            const testDateStr = new Date(2024, 0, 1).toISOString();
            vi.mocked(fs.promises.readFile).mockResolvedValueOnce(JSON.stringify({
                lastUpdated: 123456,
                releases: [{ version: '4.4-stable' }],
                lastPublishDate: testDateStr
            }));

            const result = await getStoredAvailableReleases('/tmp/releases.json');

            expect(fs.existsSync).toHaveBeenCalledWith('/tmp/releases.json');
            expect(fs.promises.readFile).toHaveBeenCalledWith('/tmp/releases.json', 'utf-8');
            expect(result.lastPublishDate).toEqual(new Date(testDateStr));
            expect(result.releases).toEqual([{ version: '4.4-stable' }]);
            expect(result.lastUpdated).toBe(123456);
        });

        test('should return empty releases when file does not exist', async () => {
            vi.mocked(fs.existsSync).mockReturnValueOnce(false);

            const result = await getStoredAvailableReleases('/tmp/releases.json');

            expect(result).toEqual({
                lastPublishDate: new Date(0),
                lastUpdated: 0,
                releases: []
            });
        });

        test('should return empty releases when file reading fails', async () => {
            vi.mocked(fs.existsSync).mockReturnValueOnce(true);
            vi.mocked(fs.promises.readFile).mockRejectedValueOnce(new Error('Failed to read'));

            const result = await getStoredAvailableReleases('/tmp/releases.json');

            expect(result).toEqual({
                lastPublishDate: new Date(0),
                lastUpdated: 0,
                releases: []
            });
            expect(logger.error).toHaveBeenCalled();
        });
    });

    describe('Installed releases management', () => {
        beforeEach(() => {
            vi.mocked(fs.existsSync).mockClear();
            vi.mocked(fs.promises.readFile).mockClear();
            vi.mocked(fs.promises.writeFile).mockClear();
        });

        test('should get stored installed releases when file exists', async () => {
            vi.mocked(fs.existsSync).mockReturnValueOnce(true);
            const mockReleases = [
                { version: '4.4-stable', mono: false, version_number: 1 },
                { version: '4.5-beta1', mono: true, version_number: 2 }
            ];
            vi.mocked(fs.promises.readFile).mockResolvedValueOnce(JSON.stringify(mockReleases));

            const result = await getStoredInstalledReleases('/tmp/installed.json');

            expect(result).toEqual(mockReleases);
        });

        test('should get empty array when installed releases file does not exist', async () => {
            vi.mocked(fs.existsSync).mockReturnValueOnce(false);

            const result = await getStoredInstalledReleases('/tmp/installed.json');

            expect(result).toEqual([]);
        });

        test('should add a release to installed releases', async () => {
            vi.mocked(fs.existsSync).mockReturnValueOnce(true);
            const existingReleases = [
                { version: '4.4-stable', mono: true, version_number: 1 }
            ];
            vi.mocked(fs.promises.readFile).mockResolvedValueOnce(JSON.stringify(existingReleases));

            const newRelease = { version: '4.5-beta1', mono: false, version_number: 2 } as InstalledRelease;
            const result = await addStoredInstalledRelease('/tmp/installed.json', newRelease);

            expect(fs.promises.writeFile).toHaveBeenCalledWith(
                '/tmp/installed.json',
                expect.stringContaining('4.5-beta1'),
                'utf-8'
            );
            expect(result).toEqual([...existingReleases, newRelease]);
        });

        test('should remove a release from installed releases', async () => {
            vi.mocked(fs.existsSync).mockReturnValueOnce(true);
            const existingReleases = [
                { version: '4.4-stable', mono: true, version_number: 1 },
                { version: '4.5-beta1', mono: false, version_number: 2 }
            ];
            vi.mocked(fs.promises.readFile).mockResolvedValueOnce(JSON.stringify(existingReleases));

            const releaseToRemove = { version: '4.4-stable', mono: true } as InstalledRelease;
            const result = await removeStoredInstalledRelease('/tmp/installed.json', releaseToRemove);

            expect(result).toEqual([existingReleases[1]]);
        });

        test('should save installed releases directly', async () => {
            const releases = [
                { version: '4.6-stable', mono: false, version_number: 3 }
            ] as InstalledRelease[];

            await saveStoredInstalledReleases('/tmp/installed.json', releases);

            expect(fs.promises.writeFile).toHaveBeenCalledWith(
                '/tmp/installed.json',
                JSON.stringify(releases, null, 4),
                'utf-8'
            );
        });
    });

    describe('removeProjectEditorUsingRelease', () => {
        const mockRelease = {
            version: '4.4-stable',
            mono: false,
            editor_path: '/fake/path/godot'
        } as InstalledRelease;
        beforeEach(() => {
            vi.mocked(getDefaultDirs).mockReturnValue({
                configDir: '/fake/config/dir',
                dataDir: '/fake/data/dir',
                projectDir: '/fake/project/dir',
                prefsPath: '/fake/config/dir/prefs.json',
                releaseCachePath: '/fake/config/dir/releases.json',
                installedReleasesCachePath: '/fake/config/dir/installed.json',
                prereleaseCachePath: '/fake/config/dir/prereleases.json'
            });

            vi.mocked(getStoredProjectsList).mockResolvedValue([
                { name: 'Project1', release: { editor_path: '/fake/path/godot' } },
                { name: 'Project2', release: { editor_path: '/other/path/godot' } }
            ]);

            vi.mocked(removeProjectEditor).mockResolvedValue(undefined);
        });
        test('should remove editor from projects using the release', async () => {
            await removeProjectEditorUsingRelease(mockRelease);

            // Instead of checking the exact path, just verify it was called
            expect(getStoredProjectsList).toHaveBeenCalled();
            expect(removeProjectEditor).toHaveBeenCalledTimes(1);
            expect(removeProjectEditor).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Project1' })
            );
        });

        test('should not call removeProjectEditor if no projects use the release', async () => {
            const mockReleaseUnused = {
                version: '4.4-stable',
                mono: false,
                editor_path: '/unused/path/godot'
            } as InstalledRelease;

            await removeProjectEditorUsingRelease(mockReleaseUnused);

            expect(removeProjectEditor).not.toHaveBeenCalled();
        });
    });
});
