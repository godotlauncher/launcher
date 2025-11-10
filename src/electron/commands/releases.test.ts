import * as fs from 'node:fs';
import logger from 'electron-log';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearReleaseCaches } from './releases.js';
import { MIN_VERSION } from '../constants.js';
import * as githubUtils from '../utils/github.utils.js';
import * as platformUtils from '../utils/platform.utils.js';
import * as releasesUtils from '../utils/releases.utils.js';

const unlinkMock = vi.hoisted(() => vi.fn());
const electronMock = vi.hoisted(() => ({
    app: {
        isPackaged: false,
        getName: vi.fn(),
        getVersion: vi.fn(() => '1.0.0'),
        getLocale: vi.fn(),
        getPath: vi.fn(),
        on: vi.fn(),
        whenReady: vi.fn(),
        quit: vi.fn(),
        getAppPath: vi.fn(),
        requestSingleInstanceLock: vi.fn(() => true),
        dock: {
            show: vi.fn(),
            hide: vi.fn(),
        },
    },
    Menu: {
        setApplicationMenu: vi.fn(),
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
    nativeImage: {
        createFromPath: vi.fn(() => ({
            resize: vi.fn(() => ({})),
        })),
    },
}));

vi.mock('electron-log', () => ({
    default: {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
    },
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

vi.mock('node:fs', () => ({
    promises: {
        unlink: unlinkMock,
        readFile: vi.fn(),
        writeFile: vi.fn(),
    },
    // some code paths may import named existsSync directly
    existsSync: vi.fn(),
}));

vi.mock('electron', () => electronMock);

vi.mock('../utils/platform.utils.js', () => ({
    getDefaultDirs: vi.fn(),
}));

vi.mock('../utils/github.utils.js', () => ({
    getReleases: vi.fn(),
}));

vi.mock('../utils/releases.utils.js', async () => {
    const actual = await vi.importActual('../utils/releases.utils.js');
    return {
        ...actual,
        storeAvailableReleases: vi.fn(),
    };
});

const getDefaultDirs = vi.mocked(platformUtils.getDefaultDirs);
const getReleases = vi.mocked(githubUtils.getReleases);
const storeAvailableReleases = vi.mocked(releasesUtils.storeAvailableReleases);
const loggerInfo = vi.mocked(logger.info);
const loggerDebug = vi.mocked(logger.debug);
const loggerError = vi.mocked(logger.error);

const defaultDirs: {
    dataDir: string;
    configDir: string;
    projectDir: string;
    prefsPath: string;
    releaseCachePath: string;
    installedReleasesCachePath: string;
    prereleaseCachePath: string;
    migrationStatePath: string;
} = {
    dataDir: '/data',
    configDir: '/config',
    projectDir: '/projects',
    prefsPath: '/prefs.json',
    releaseCachePath: '/config/releases.json',
    prereleaseCachePath: '/config/prereleases.json',
    installedReleasesCachePath: '/config/installed-releases.json',
    migrationStatePath: '/config/migrations.json',
};

describe('clearReleaseCaches', () => {
    beforeEach(() => {
        unlinkMock.mockReset();
        getDefaultDirs.mockReset();
        getReleases.mockReset();
        storeAvailableReleases.mockReset();
        loggerInfo.mockReset();
        loggerDebug.mockReset();
        loggerError.mockReset();
        unlinkMock.mockResolvedValue(undefined);
        getDefaultDirs.mockReturnValue({ ...defaultDirs });
    });

    it('removes cache files and rebuilds them from GitHub', async () => {
        const stableOld: ReleaseSummary = {
            version: '4.3-stable',
            version_number: 4.3,
            name: '4.3-stable',
            published_at: '2024-04-01T00:00:00.000Z',
            draft: false,
            prerelease: false,
            assets: [],
        };
        const stableNew: ReleaseSummary = {
            version: '4.4-stable',
            version_number: 4.4,
            name: '4.4-stable',
            published_at: '2024-05-01T00:00:00.000Z',
            draft: false,
            prerelease: false,
            assets: [],
        };
        const buildOld: ReleaseSummary = {
            version: '4.5-beta1',
            version_number: 4.5,
            name: '4.5-beta1',
            published_at: '2024-06-01T00:00:00.000Z',
            draft: false,
            prerelease: true,
            assets: [],
        };
        const buildNew: ReleaseSummary = {
            version: '4.5-beta2',
            version_number: 4.5,
            name: '4.5-beta2',
            published_at: '2024-06-15T00:00:00.000Z',
            draft: false,
            prerelease: true,
            assets: [],
        };

        getReleases.mockImplementation(async (type) => {
            if (type === 'RELEASES') {
                return {
                    releases: [stableOld, stableNew],
                    lastPublishDate: new Date('2024-05-01T00:00:00.000Z'),
                };
            }
            return {
                releases: [buildOld, buildNew],
                lastPublishDate: new Date('2024-06-15T00:00:00.000Z'),
            };
        });
        storeAvailableReleases.mockResolvedValue({
            lastPublishDate: new Date(),
            lastUpdated: Date.now(),
            releases: [],
        });

        await clearReleaseCaches();

        expect(unlinkMock).toHaveBeenCalledTimes(2);
        expect(unlinkMock).toHaveBeenNthCalledWith(
            1,
            defaultDirs.releaseCachePath,
        );
        expect(unlinkMock).toHaveBeenNthCalledWith(
            2,
            defaultDirs.prereleaseCachePath,
        );

        expect(getReleases).toHaveBeenCalledWith(
            'RELEASES',
            expect.any(Date),
            MIN_VERSION,
            1,
            100,
        );
        expect(getReleases).toHaveBeenCalledWith(
            'BUILDS',
            expect.any(Date),
            MIN_VERSION,
            1,
            100,
        );

        // The module-level `storeAvailableReleases` may be the real function
        // which writes to fs.promises.writeFile; assert that writeFile was
        // called with the expected paths and content instead.
        const writeFileMock = vi.mocked(
            fs.promises.writeFile as unknown as (...args: any[]) => any,
        );
        expect(writeFileMock).toHaveBeenCalledTimes(2);
        const releaseWrite = writeFileMock.mock.calls.find(
            ([path]) => path === defaultDirs.releaseCachePath,
        );
        const prereleaseWrite = writeFileMock.mock.calls.find(
            ([path]) => path === defaultDirs.prereleaseCachePath,
        );

        expect(releaseWrite).toBeDefined();
        expect(prereleaseWrite).toBeDefined();

        // parse the JSON written to the cache and verify release ordering
        const releaseData = JSON.parse(releaseWrite?.[1] as string);
        const prereleaseData = JSON.parse(prereleaseWrite?.[1] as string);
        expect(releaseData.releases).toEqual([stableNew, stableOld]);
        expect(prereleaseData.releases).toEqual([buildNew, buildOld]);

        expect(loggerInfo).toHaveBeenCalledWith(
            'Clearing cached release manifests',
        );
        expect(loggerInfo).toHaveBeenCalledWith(
            'Release caches rebuilt successfully',
        );
        expect(loggerError).not.toHaveBeenCalled();
    });

    it('continues when cache files are missing', async () => {
        const enoentError = Object.assign(new Error('missing'), {
            code: 'ENOENT',
        });
        unlinkMock
            .mockRejectedValueOnce(enoentError)
            .mockResolvedValueOnce(undefined);

        getReleases.mockResolvedValue({
            releases: [],
            lastPublishDate: new Date(0),
        });
        storeAvailableReleases.mockResolvedValue({
            lastPublishDate: new Date(),
            lastUpdated: Date.now(),
            releases: [],
        });

        await expect(clearReleaseCaches()).resolves.toBeUndefined();

        expect(loggerDebug).toHaveBeenCalledWith(
            `Release cache file not found at ${defaultDirs.releaseCachePath}, skipping removal`,
        );
        expect(loggerError).not.toHaveBeenCalled();
    });

    it('propagates errors when cache removal fails', async () => {
        const removalError = Object.assign(new Error('permission denied'), {
            code: 'EACCES',
        });
        unlinkMock.mockRejectedValueOnce(removalError);

        await expect(clearReleaseCaches()).rejects.toBe(removalError);

        expect(storeAvailableReleases).not.toHaveBeenCalled();
        expect(loggerError).toHaveBeenCalledWith(
            `Failed to remove release cache file at ${defaultDirs.releaseCachePath}`,
            removalError,
        );
    });
});
