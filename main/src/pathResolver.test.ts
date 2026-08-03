import * as path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import {
    getAssetPath,
    getExternalResourceRoot,
    getLocalesPath,
    getUIPath,
} from './pathResolver';

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

    it('resolves source resources below the application path', () => {
        const input = {
            isPackaged: false,
            appPath: '/workspace/Godot Launcher',
        };

        expect(getExternalResourceRoot(input)).toBe(input.appPath);
        expect(getAssetPath(input)).toBe(
            path.join(input.appPath, 'main/assets'),
        );
        expect(getLocalesPath(input)).toBe(path.join(input.appPath, 'locales'));
    });

    it('resolves official package resources beside the application archive', () => {
        const input = {
            isPackaged: true,
            appPath: '/opt/Godot Launcher/resources/app.asar',
        };
        const resourceRoot = path.dirname(input.appPath);

        expect(getExternalResourceRoot(input)).toBe(resourceRoot);
        expect(getAssetPath(input)).toBe(path.join(resourceRoot, 'assets'));
        expect(getLocalesPath(input)).toBe(path.join(resourceRoot, 'locales'));
    });

    it('resolves system Electron resources from an ASAR application path', () => {
        const input = {
            isPackaged: false,
            appPath: '/usr/lib/godot-launcher/app.asar',
        };

        expect(getExternalResourceRoot(input)).toBe('/usr/lib/godot-launcher');
        expect(getAssetPath(input)).toBe('/usr/lib/godot-launcher/assets');
        expect(getLocalesPath(input)).toBe('/usr/lib/godot-launcher/locales');
    });
});
