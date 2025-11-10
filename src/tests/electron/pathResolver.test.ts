import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { getAssetPath, getPreloadPath, getUIPath } from '../../electron/pathResolver';

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

describe('Path Resolver', () => {
    it('should get UI path', () => {
        const uiPath = getUIPath();

        expect(uiPath).toBe(path.join('/app/path', '/dist-react/index.html'));
    });

    it('should get asset path for dev', () => {
        vi.stubEnv('NODE_ENV', 'development');

        const assetPath = getAssetPath();
        expect(assetPath).toBe(path.join('/app/path', 'src/assets'));
    });

    it('should get asset path for prod', () => {
        vi.stubEnv('NODE_ENV', 'production');

        const assetPath = getAssetPath();
        expect(assetPath).toBe(path.join('/app', 'src/assets'));
    });

    it('should get preload path for dev', () => {
        vi.stubEnv('NODE_ENV', 'development');

        const preloadPath = getPreloadPath();
        expect(preloadPath).toBe(
            path.join('/app/path', 'dist-electron/preload.cjs'),
        );
    });

    it('should get preload path for prod', () => {
        vi.stubEnv('NODE_ENV', 'production');

        const preloadPath = getPreloadPath();
        expect(preloadPath).toBe(
            path.join('/app', 'dist-electron/preload.cjs'),
        );
    });
});
