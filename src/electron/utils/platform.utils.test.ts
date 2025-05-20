import { expect, vi, describe, it } from "vitest";
import path, { posix, win32 } from "node:path";
import { APP_INTERNAL_NAME } from "../constants";
import { beforeEach } from "node:test";
import { getDefaultDirs } from "./platform.utils";

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

vi.mock("node:os", () => ({
    homedir: vi.fn().mockReturnValue("/home/user"),
    platform: vi.fn().mockReturnValue("win32")
}));


describe("platform.utils", () => {

    it("should get default paths", async () => {

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

});
