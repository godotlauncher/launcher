import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    __resetInstalledReleasesStoreForTesting,
    getStoredInstalledReleases,
} from '../../../electron/utils/releases.utils';

const platformUtilsMock = vi.hoisted(() => ({
    getDefaultDirs: vi.fn(),
}));

vi.mock('./platform.utils.js', () => platformUtilsMock);

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

const tempDirs: string[] = [];

beforeEach(() => {
    platformUtilsMock.getDefaultDirs.mockReset();
});

afterEach(() => {
    while (tempDirs.length > 0) {
        const dir = tempDirs.pop();
        if (dir && fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }
    __resetInstalledReleasesStoreForTesting();
});

describe('getStoredInstalledReleases', () => {
    it('defaults missing valid flag to true for legacy entries', async () => {
        const tempDir = fs.mkdtempSync(
            path.join(os.tmpdir(), 'launcher-releases-utils-'),
        );
        tempDirs.push(tempDir);
        const releasesPath = path.join(tempDir, 'installed.json');
        platformUtilsMock.getDefaultDirs.mockReturnValue({
            installedReleasesCachePath: releasesPath,
        });

        const data = [
            {
                version: '4.2.0',
                version_number: 40200,
                install_path: '/some/install/path',
                editor_path: '/some/editor/path',
                platform: 'darwin',
                arch: 'arm64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: '2024-01-01T00:00:00Z',
            },
            {
                version: '4.1.0',
                version_number: 40100,
                install_path: '/another/install/path',
                editor_path: '/another/editor/path',
                platform: 'darwin',
                arch: 'arm64',
                mono: false,
                prerelease: false,
                config_version: 5,
                published_at: '2023-01-01T00:00:00Z',
                valid: false,
            },
        ];

        fs.writeFileSync(releasesPath, JSON.stringify(data), 'utf-8');

        const releases = await getStoredInstalledReleases();

        expect(releases).toHaveLength(2);
        expect(releases.find((r) => r.version === '4.2.0')?.valid).toBe(true);
        expect(releases.find((r) => r.version === '4.1.0')?.valid).toBe(false);
    });
});
