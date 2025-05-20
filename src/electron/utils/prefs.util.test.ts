import * as path from 'node:path';

import { describe, expect, it, MockedObject, suite, vi } from 'vitest';
import { getConfigDir, getDefaultPrefs, getPrefsPath, readPrefsFromDisk, writePrefsToDisk } from './prefs.utils';

import { APP_INTERNAL_NAME } from '../constants';
import { getDefaultDirs } from "./platform.utils";

import * as fs from "fs";

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
    describe('should be able to get default data and config locations for platform ', async () => {

        it('should return correct data and config locations', async () => {

            const dirs = getDefaultDirs();
            expect(dirs).toEqual({
                configDir: path.win32.resolve(`/home/user/.${APP_INTERNAL_NAME}`),
                dataDir: path.win32.resolve(`/home/user/Godot/Editors`),
                prefsPath: path.win32.resolve(`/home/user/.${APP_INTERNAL_NAME}/prefs.json`),
                installedReleasesCachePath: path.win32.resolve(`/home/user/.${APP_INTERNAL_NAME}/installed-releases.json`),
                prereleaseCachePath: path.win32.resolve(`/home/user/.${APP_INTERNAL_NAME}/prereleases.json`),
                projectDir: path.win32.resolve(`/home/user/Godot/Projects`),
                releaseCachePath: path.win32.resolve(`/home/user/.${APP_INTERNAL_NAME}/releases.json`)
            });

        });





        it('should get default prefs path according to platform', async () => {

            const configPath = await getPrefsPath();
            expect(configPath).toBe(path.resolve(`/home/user/.${APP_INTERNAL_NAME}/prefs.json`));
        });

        it('should get default config path according to platform', async () => {

            const configPath = await getConfigDir();
            expect(configPath).toBe(path.resolve(`/home/user/.${APP_INTERNAL_NAME}`));
        });

        it('should get default prefs', async () => {

            const defaultPrefs = getDefaultDirs();
            const prefs = await getDefaultPrefs();
            expect(prefs).toEqual({
                prefs_version: 1,
                install_location: defaultPrefs.dataDir,
                config_location: defaultPrefs.configDir,
                projects_location: defaultPrefs.projectDir,
                auto_check_updates: true,
                auto_start: true,
                start_in_tray: true,
                confirm_project_remove: true,
                post_launch_action: "close_to_tray",
                first_run: true,
                vs_code_path: "",
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
            const prefs = writePrefsToDisk(prefsPath, { a: 1 });

            expect(fsPromisesMock.writeFile).toBeCalledWith(prefsPath, JSON.stringify({ a: 1 }, null, 4), "utf-8");
            expect(fsPromisesMock.writeFile).toHaveBeenCalledTimes(1);

        });
    });
});
