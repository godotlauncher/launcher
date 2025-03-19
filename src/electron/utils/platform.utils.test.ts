import { expect, vi, describe, it } from "vitest";
import path, { posix, win32 } from "node:path";
import { APP_INTERNAL_NAME } from "../constants";
import { beforeEach } from "node:test";
import { getDefaultDirs } from "./platform.utils";

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
