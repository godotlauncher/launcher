import * as os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_INTERNAL_NAME } from '../constants';
import { getDefaultDirs } from './platform.utils';

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

vi.mock('node:os', () => ({
    // Provide default mocks, these will be overridden in beforeEach
    homedir: vi.fn(() => '/home/user'),
    platform: vi.fn(() => 'linux'),
}));

describe('platform.utils', () => {
    describe('Windows paths', () => {
        beforeEach(() => {
            (os.platform as any).mockReturnValue('win32');
            (os.homedir as any).mockReturnValue('c:\\Users\\User');
        });

        it('should get default paths for Windows', () => {
            const dirs = getDefaultDirs();
            const expectedHomeDir = 'c:\\Users\\User';
            expect(dirs).toEqual({
                configDir: path.win32.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                ),
                dataDir: path.win32.join(expectedHomeDir, 'Godot', 'Editors'),
                prefsPath: path.win32.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'prefs.json',
                ),
                installedReleasesCachePath: path.win32.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'installed-releases.json',
                ),
                prereleaseCachePath: path.win32.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'prereleases.json',
                ),
                migrationStatePath: path.win32.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'migrations.json',
                ),
                projectDir: path.win32.join(
                    expectedHomeDir,
                    'Godot',
                    'Projects',
                ),
                releaseCachePath: path.win32.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'releases.json',
                ),
            });
        });
    });

    describe('Linux paths', () => {
        beforeEach(() => {
            (os.platform as any).mockReturnValue('linux');
            (os.homedir as any).mockReturnValue('/home/user');
        });

        it('should get default paths for Linux', () => {
            const dirs = getDefaultDirs();
            const expectedHomeDir = '/home/user';
            expect(dirs).toEqual({
                configDir: path.posix.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                ),
                dataDir: path.posix.join(expectedHomeDir, 'Godot', 'Editors'),
                prefsPath: path.posix.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'prefs.json',
                ),
                installedReleasesCachePath: path.posix.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'installed-releases.json',
                ),
                prereleaseCachePath: path.posix.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'prereleases.json',
                ),
                migrationStatePath: path.posix.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'migrations.json',
                ),
                projectDir: path.posix.join(
                    expectedHomeDir,
                    'Godot',
                    'Projects',
                ),
                releaseCachePath: path.posix.join(
                    expectedHomeDir,
                    `.${APP_INTERNAL_NAME}`,
                    'releases.json',
                ),
            });
        });
    });
});
