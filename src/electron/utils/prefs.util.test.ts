import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, MockedObject, suite, vi } from 'vitest';
import { __resetPrefsCacheForTesting, getConfigDir, getDefaultPrefs, getPrefsPath, readPrefsFromDisk, writePrefsToDisk } from './prefs.utils';

import { APP_INTERNAL_NAME } from '../constants';
import { getDefaultDirs } from "./platform.utils";

import * as fs from "fs";
import * as os from "os";

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
            currentVersion: '1.0.0'
        }
    },
    UpdateCheckResult: {}
}));

// Mock electron
vi.mock('electron', () => ({
    Menu: {
        setApplicationMenu: vi.fn()
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
            hide: vi.fn()
        }
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

vi.mock("os", () => ({
    homedir: vi.fn().mockReturnValue("/home/user"),
    platform: vi.fn().mockReturnValue("win32")
}));

vi.stubEnv("LOCALAPPDATA", "/local/app/data");
vi.stubEnv("APPDATA", "/app/data");

vi.mock("fs", () => ({
    existsSync: vi.fn(),
    promises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
    },
}));

const fsMock = fs as unknown as MockedObject<typeof fs>;
const fsPromisesMock = fs.promises as unknown as MockedObject<typeof fs.promises>;

suite('prefs.util', test => {
    afterEach(() => {
        __resetPrefsCacheForTesting();
    });
    describe('should be able to get default data and config locations for Windows', () => {
        beforeEach(() => {
            (os.platform as any).mockReturnValue('win32');
            (os.homedir as any).mockReturnValue('c:\\Users\\User');
        });
        it('should return correct data and config locations (Windows)', () => {
            const dirs = getDefaultDirs();
            const mockedHomeDir = 'c:\\\\Users\\\\User';
            expect(dirs).toEqual({
                configDir: path.win32.join(mockedHomeDir, `.${APP_INTERNAL_NAME}`),
                dataDir: path.win32.join(mockedHomeDir, 'Godot', 'Editors'),
                prefsPath: path.win32.join(mockedHomeDir, `.${APP_INTERNAL_NAME}`, 'prefs.json'),
                installedReleasesCachePath: path.win32.join(mockedHomeDir, `.${APP_INTERNAL_NAME}`, 'installed-releases.json'),
                prereleaseCachePath: path.win32.join(mockedHomeDir, `.${APP_INTERNAL_NAME}`, 'prereleases.json'),
                projectDir: path.win32.join(mockedHomeDir, 'Godot', 'Projects'),
                releaseCachePath: path.win32.join(mockedHomeDir, `.${APP_INTERNAL_NAME}`, 'releases.json')
            });
        });
    });

    describe('should be able to get default data and config locations for Linux', () => {
        beforeEach(() => {
            (os.platform as any).mockReturnValue('linux');
            (os.homedir as any).mockReturnValue('/home/user');
        });
        it('should return correct data and config locations (Linux)', () => {
            const dirs = getDefaultDirs();
            expect(dirs).toEqual({
                configDir: path.posix.resolve(`/home/user/.${APP_INTERNAL_NAME}`),
                dataDir: path.posix.resolve(`/home/user/Godot/Editors`),
                prefsPath: path.posix.resolve(`/home/user/.${APP_INTERNAL_NAME}/prefs.json`),
                installedReleasesCachePath: path.posix.resolve(`/home/user/.${APP_INTERNAL_NAME}/installed-releases.json`),
                prereleaseCachePath: path.posix.resolve(`/home/user/.${APP_INTERNAL_NAME}/prereleases.json`),
                projectDir: path.posix.resolve(`/home/user/Godot/Projects`),
                releaseCachePath: path.posix.resolve(`/home/user/.${APP_INTERNAL_NAME}/releases.json`)
            });
        });
    });

    describe('prefs.util Windows', () => {
        beforeEach(() => {
            (os.platform as any).mockReturnValue('win32');
            (os.homedir as any).mockReturnValue('c:\\Users\\User');
        });

        it('should get default prefs path (Windows)', async () => {
            const configPath = await getPrefsPath();
            expect(configPath).toBe(path.win32.resolve(`c:\\Users\\User/.${APP_INTERNAL_NAME}/prefs.json`));
        });

        it('should get default config path (Windows)', async () => {
            const configPath = await getConfigDir();
            expect(configPath).toBe(path.win32.resolve(`c:\\Users\\User/.${APP_INTERNAL_NAME}`));
        });

        it('should get default prefs (Windows)', async () => {
            const defaultDirs = getDefaultDirs();
            const prefs = await getDefaultPrefs();
            expect(prefs).toEqual({
                prefs_version: 3,
                install_location: defaultDirs.dataDir,
                config_location: defaultDirs.configDir,
                projects_location: defaultDirs.projectDir,
                auto_check_updates: true,
                auto_start: true,
                start_in_tray: true,
                confirm_project_remove: true,
                post_launch_action: "close_to_tray",
                first_run: true,
                windows_enable_symlinks: false,
                windows_symlink_win_notify: false,
                vs_code_path: "",
                language: "system",
            });
        });
    });

    describe('prefs.util Linux', () => {
        beforeEach(() => {
            (os.platform as any).mockReturnValue('linux');
            (os.homedir as any).mockReturnValue('/home/user');
        });

        it('should get default prefs path (Linux)', async () => {
            const configPath = await getPrefsPath();
            expect(configPath).toBe(path.posix.resolve(`/home/user/.${APP_INTERNAL_NAME}/prefs.json`));
        });

        it('should get default config path (Linux)', async () => {
            const configPath = await getConfigDir();
            expect(configPath).toBe(path.posix.resolve(`/home/user/.${APP_INTERNAL_NAME}`));
        });

        it('should get default prefs (Linux)', async () => {
            const defaultDirs = getDefaultDirs();
            const prefs = await getDefaultPrefs();
            expect(prefs).toEqual({
                prefs_version: 3,
                install_location: defaultDirs.dataDir,
                config_location: defaultDirs.configDir,
                projects_location: defaultDirs.projectDir,
                auto_check_updates: true,
                auto_start: true,
                start_in_tray: true,
                confirm_project_remove: true,
                post_launch_action: "close_to_tray",
                first_run: true,
                windows_enable_symlinks: false,
                windows_symlink_win_notify: true,
                vs_code_path: "",
                language: "system",
            });
        });
    });

    it('should read prefs from disk', async () => {

        fsMock.existsSync.mockReturnValueOnce(true);
        fsPromisesMock.readFile.mockResolvedValueOnce(JSON.stringify({ a: 1 }));

        const prefsPath = "/home/user/.godot/prefs.json";
        const prefs = await readPrefsFromDisk(prefsPath, { a: 1 });
        expect(prefs).toEqual({ a: 1 });

    });

    it('should read default prefs when prefs file does not exist', async () => {

        fsMock.existsSync.mockReturnValueOnce(false);

        const prefsPath = "/home/user/.godot/prefs.json";
        const prefs = await readPrefsFromDisk(prefsPath, { a: 1 });

        expect(fsMock.existsSync).toBeCalledWith(prefsPath);
        expect(prefs).toEqual({ a: 1 });

    });

    it('should write prefs to disk', async () => {


        const prefsPath = "/home/user/.godot/prefs.json";
        await writePrefsToDisk(prefsPath, { a: 1 });

        expect(fsPromisesMock.writeFile).toBeCalledWith(prefsPath, JSON.stringify({ a: 1 }, null, 4), "utf-8");
        expect(fsPromisesMock.writeFile).toHaveBeenCalledTimes(1);

    });
});
