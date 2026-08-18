import { createHash } from 'node:crypto';
import type { AssetSummary, ReleaseSummary } from '@shared/contracts';
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
    __resetReleaseCachesForTesting,
    createAssetSummary,
    downloadReleaseAsset,
    getPlatformAsset,
    getStoredAvailableReleases,
    parseReleaseName,
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
        rm: vi.fn(),
    },
}));

vi.mock('node:stream', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:stream')>();

    return {
        ...actual,
        Readable: {
            ...actual.Readable,
            fromWeb: vi.fn(() => ({
                pipe: vi.fn((dest) => dest),
                on: vi.fn(),
                push: vi.fn(),
            })),
        },
    };
});

vi.mock('node:stream/promises', () => ({
    pipeline: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../i18n/index.js', () => ({
    t: vi.fn((key: string, options?: Record<string, string>) => {
        switch (key) {
            case 'installEditor:errors.downloadInterrupted':
                return 'localized download interrupted';
            case 'installEditor:errors.downloadFailed':
                return `localized download failed: ${options?.error}`;
            case 'installEditor:errors.downloadFailedUnknown':
                return 'localized download failed unknown';
            case 'installEditor:errors.downloadAssetNotFound':
                return 'localized download asset not found';
            case 'installEditor:errors.downloadRateLimited':
                return 'localized download rate limited';
            case 'installEditor:errors.downloadServiceUnavailable':
                return 'localized download service unavailable';
            case 'installEditor:errors.archiveIntegrityMismatch':
                return 'localized archive integrity mismatch';
            case 'installEditor:errors.downloadHttpError':
                return `localized download http error: ${options?.status}`;
            case 'installEditor:errors.downloadEmptyResponse':
                return 'localized download empty response';
            default:
                return key;
        }
    }),
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
        const emptyIntegrity = {
            algorithm: 'sha256' as const,
            digest: createHash('sha256').digest('hex'),
        };

        beforeEach(() => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                statusText: 'OK',
                headers: {
                    get: vi.fn(() => null),
                },
                body: {}, // Simple mock body
            });

            // Reset mocks
            vi.mocked(fs.createWriteStream).mockClear();
            vi.mocked(fs.promises.rm).mockResolvedValue(undefined);
            vi.mocked(streamPromises.pipeline).mockClear();
            vi.mocked(Readable.fromWeb).mockClear();
        });

        test('should download and save an asset successfully', async () => {
            await downloadReleaseAsset(mockAsset, downloadPath, {
                integrity: emptyIntegrity,
            });

            expect(global.fetch).toHaveBeenCalledWith(
                mockAsset.download_url,
                expect.objectContaining({
                    signal: expect.any(Object),
                }),
            );
            expect(fs.createWriteStream).toHaveBeenCalledWith(downloadPath, {
                flags: 'wx',
            });
            expect(streamPromises.pipeline).toHaveBeenCalled();
        });

        test('should throw an error if download fetch fails', async () => {
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: false,
                statusText: 'Network Error',
                headers: {
                    get: vi.fn(() => null),
                },
                body: null,
            } as Response);

            await expect(
                downloadReleaseAsset(mockAsset, downloadPath, {
                    integrity: emptyIntegrity,
                }),
            ).rejects.toThrow('localized download http error: Network Error');
        });

        test.each([
            [404, 'localized download asset not found'],
            [429, 'localized download rate limited'],
            [503, 'localized download service unavailable'],
        ])(
            'should map HTTP %i download failures to a useful message',
            async (status, expectedMessage) => {
                vi.mocked(global.fetch).mockResolvedValueOnce({
                    ok: false,
                    status,
                    statusText: 'Request failed',
                    headers: {
                        get: vi.fn(() => null),
                    },
                    body: null,
                } as Response);

                await expect(
                    downloadReleaseAsset(mockAsset, downloadPath, {
                        integrity: emptyIntegrity,
                    }),
                ).rejects.toThrow(expectedMessage);
            },
        );

        test('should show a retryable error if the download is interrupted before a response', async () => {
            vi.mocked(global.fetch).mockRejectedValueOnce(
                new TypeError('terminated'),
            );

            await expect(
                downloadReleaseAsset(mockAsset, downloadPath, {
                    integrity: emptyIntegrity,
                }),
            ).rejects.toThrow('localized download interrupted');
        });

        test('should show a retryable error when fetch wraps a closed socket', async () => {
            const socketError = Object.assign(new Error('other side closed'), {
                code: 'UND_ERR_SOCKET',
            });
            const fetchError = new TypeError('fetch failed', {
                cause: socketError,
            });
            vi.mocked(global.fetch).mockRejectedValueOnce(fetchError);

            await expect(
                downloadReleaseAsset(mockAsset, downloadPath, {
                    integrity: emptyIntegrity,
                }),
            ).rejects.toThrow('localized download interrupted');
        });

        test('should show a retryable error if the response stream is interrupted', async () => {
            vi.mocked(streamPromises.pipeline).mockRejectedValueOnce(
                new TypeError('terminated'),
            );

            await expect(
                downloadReleaseAsset(mockAsset, downloadPath, {
                    integrity: emptyIntegrity,
                }),
            ).rejects.toThrow('localized download interrupted');
        });

        test('should report byte progress when content length is available', async () => {
            const onProgress = vi.fn();
            vi.mocked(global.fetch).mockResolvedValueOnce({
                ok: true,
                statusText: 'OK',
                headers: {
                    get: vi.fn((name: string) =>
                        name === 'content-length' ? '10' : null,
                    ),
                },
                body: {},
            } as unknown as Response);
            vi.mocked(streamPromises.pipeline).mockImplementationOnce(
                async (...streams: unknown[]) => {
                    const progressStream = streams[1] as NodeJS.WritableStream;
                    progressStream.write(Buffer.alloc(4));
                    progressStream.write(Buffer.alloc(6));
                },
            );

            await downloadReleaseAsset(mockAsset, downloadPath, {
                integrity: {
                    algorithm: 'sha256',
                    digest: createHash('sha256')
                        .update(Buffer.alloc(10))
                        .digest('hex'),
                },
                onProgress,
            });

            expect(onProgress).toHaveBeenLastCalledWith({
                receivedBytes: 10,
                totalBytes: 10,
            });
        });

        test('should report byte progress when content length is unknown', async () => {
            const onProgress = vi.fn();
            vi.mocked(streamPromises.pipeline).mockImplementationOnce(
                async (...streams: unknown[]) => {
                    const progressStream = streams[1] as NodeJS.WritableStream;
                    progressStream.write(Buffer.alloc(4));
                },
            );

            await downloadReleaseAsset(mockAsset, downloadPath, {
                integrity: {
                    algorithm: 'sha256',
                    digest: createHash('sha256')
                        .update(Buffer.alloc(4))
                        .digest('hex'),
                },
                onProgress,
            });

            expect(onProgress).toHaveBeenCalledWith({
                receivedBytes: 4,
                totalBytes: undefined,
            });
        });

        test('should remove and reject an archive with a mismatched digest', async () => {
            vi.mocked(streamPromises.pipeline).mockImplementationOnce(
                async (...streams: unknown[]) => {
                    const progressStream = streams[1] as NodeJS.WritableStream;
                    progressStream.write(Buffer.from('tampered'));
                },
            );

            await expect(
                downloadReleaseAsset(mockAsset, downloadPath, {
                    integrity: emptyIntegrity,
                }),
            ).rejects.toThrow('localized archive integrity mismatch');
            expect(fs.promises.rm).toHaveBeenCalledWith(downloadPath, {
                force: true,
            });
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
            expect(cached.integrityMetadataRefreshed).toBe(false);
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
            expect(result.integrityMetadataRefreshed).toBe(false);
        });

        test('should return empty releases when file does not exist', async () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);

            const result =
                await getStoredAvailableReleases('/tmp/releases.json');

            expect(result).toEqual({
                integrityMetadataRefreshed: false,
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
                integrityMetadataRefreshed: false,
                lastPublishDate: new Date(0),
                lastUpdated: 0,
                releases: [],
            });
            expect(logger.error).toHaveBeenCalled();
        });
    });
});
