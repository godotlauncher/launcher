import { test, suite, expect, describe, vi, afterAll, beforeAll, afterEach, beforeEach, MockedObject } from "vitest";
import {
    getStoredAvailableReleases,
    parseReleaseName,
    storeAvailableReleases,

    sortReleases,
    getStoredInstalledReleases,
    addStoredInstalledRelease,
    removeStoredInstalledRelease,
} from './releases.utils';

import * as fs from "fs";

const fsMock = fs as unknown as MockedObject<typeof fs>;
const fsPromisesMock = fs.promises as unknown as MockedObject<typeof fs.promises>;

vi.mock('fs', () => ({
    existsSync: vi.fn(),
    promises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
    },
}));

const versions = [
    { version: "4.3-stable" },
    { version: "4.4-beta1" },
    { version: "4.4-dev3" },
    { version: "4.2-stable" },
    { version: "2.0.0.1-stable" },
    { version: "3.6-beta10" },
    { version: "4.4-stable" },
];

suite("Releases Utils", () => {


    describe("Parse release names", () => {
        test("Should parse stable release name", () => {
            const parsed = parseReleaseName("4.3-stable");

            expect(parsed).toMatchObject({
                major: 4,
                minor: 3,
                patch: 0,
                type: "stable",
                suffixNumber: 0,
            });
        });

        test("Should parse release name with suffix", () => {
            const parsed = parseReleaseName("4.4-beta1");

            expect(parsed).toMatchObject({
                major: 4,
                minor: 4,
                patch: 0,
                type: "beta",
                suffixNumber: 1,
            });
        });

        // parse with 3 components

        test("Should parse release name with 3 components", () => {
            const parsed = parseReleaseName("4.4.4-dev3");
            expect(parsed).toMatchObject({
                major: 4,
                minor: 4,
                patch: 4,
                type: "dev",
                suffixNumber: 3,
            });
        });

        // parse with 4 components

        test("Should parse release name with 4 components", () => {
            const parsed = parseReleaseName("2.1.2.3-dev69");

            expect(parsed).toMatchObject({
                major: 2,
                minor: 1,
                patch: 2,
                revision: 3,
                type: "dev",
                suffixNumber: 69,
            });

        });
    });



    describe("Sort releases", () => {
        test("Should sort releases", () => {
            const sorted = versions.sort(sortReleases);

            expect(sorted).toEqual([
                { version: "4.4-stable" },
                { version: "4.4-beta1" },
                { version: "4.4-dev3" },
                { version: "4.3-stable" },
                { version: "4.2-stable" },
                { version: "3.6-beta10" },
                { version: "2.0.0.1-stable" },
            ]);
        });


    });


    describe("Available releases", () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        test("should store available releases if release file exists", async () => {

            const cached = await storeAvailableReleases("/tmp/releases.json", new Date(2024, 12, 31), [{ version: "4.4-stable" }]);

            expect(fs.promises.writeFile).toHaveBeenCalledOnce();

            expect(cached.lastUpdated).toBeGreaterThan(0);
            expect(cached.releases).toContainEqual({ version: "4.4-stable" });
            expect(cached.lastPublishDate).toEqual(new Date(2024, 12, 31));
        });

        test("should return valid available release list if a file exists", async () => {

            fsMock.existsSync.mockReturnValueOnce(true);
            fsPromisesMock.readFile.mockResolvedValueOnce(JSON.stringify({
                lastUpdated: 123456,
                releases: [{ version: "4.4-stable" }],
                lastPublishDate: new Date(2024, 11, 31),
            }));

            const cached = await getStoredAvailableReleases("/tmp/releases.json");

            expect(fs.existsSync).toBeCalledWith("/tmp/releases.json");
            expect(fs.existsSync).toHaveReturnedWith(true);
            expect(fs.promises.readFile).toBeCalledWith("/tmp/releases.json", "utf-8");

            expect(cached.lastUpdated).toBeDefined();
            expect(cached.lastUpdated).toEqual(123456);
            expect(cached.releases).toEqual([{ version: "4.4-stable" }]);
            expect(cached.lastPublishDate).toEqual(new Date(2024, 11, 31));

        });

        test("should return empty available release list when file does not exist", async () => {

            fsMock.existsSync.mockReturnValueOnce(false);

            const cached = await getStoredAvailableReleases("/tmp/releases.json");

            expect(fs.existsSync).toBeCalledWith("/tmp/releases.json");
            expect(fs.existsSync).toHaveLastReturnedWith(false);

            expect(cached.lastUpdated).toBeDefined();
            expect(cached.lastUpdated).toEqual(0);
            expect(cached.releases).toEqual([]);
            expect(cached.lastPublishDate).toEqual(new Date(0));

        });
    });
    describe("Installed releases", () => {

        beforeEach(() => {
            vi.clearAllMocks();
        });

        test("should return empty when installed releases file dose not exist", async () => {

            fsMock.existsSync.mockReturnValueOnce(false);

            const installed = await getStoredInstalledReleases("/tmp/installed.json");

            expect(fs.existsSync).toBeCalledWith("/tmp/installed.json");
            expect(installed).toEqual([]);

        });

        test("should return installed releases when file exists", async () => {


            fsMock.existsSync.mockReturnValueOnce(true);

            fsPromisesMock.readFile.mockResolvedValueOnce(JSON.stringify([{ version: "4.4-stable", mono: false }]));



            const installed = await getStoredInstalledReleases("/tmp/installed.json");

            expect(fs.existsSync).toBeCalledWith("/tmp/installed.json");
            expect(fs.existsSync).toHaveReturnedWith(true);

            expect(fs.promises.readFile).toBeCalledWith("/tmp/installed.json", "utf-8");


            expect(installed).toEqual([{ version: "4.4-stable", mono: false }]);

        });

        test('Should add installed release to existing', async () => {


            fsMock.existsSync.mockReturnValueOnce(true);

            fsPromisesMock.readFile.mockResolvedValueOnce(JSON.stringify([{ version: "4.4-stable", mono: true }]));


            const result = await addStoredInstalledRelease("/tmp/installed2.json", { version: "4.4-stable", mono: false });

            expect(fs.existsSync).toBeCalledWith("/tmp/installed2.json");
            expect(fs.existsSync).toHaveReturnedWith(true);

            expect(fs.promises.readFile).toBeCalledWith("/tmp/installed2.json", "utf-8");

            expect(fs.promises.writeFile).toHaveBeenCalledWith("/tmp/installed2.json", JSON.stringify([
                { version: "4.4-stable", mono: true },
                { version: "4.4-stable", mono: false } // added
            ], null, 4), "utf-8");

            expect(result).toEqual([{ version: "4.4-stable", mono: true }, { version: "4.4-stable", mono: false }]);
        });

        test('should add installed release when file does not exist', async () => {


            fsMock.existsSync.mockReturnValueOnce(false);

            const result = await addStoredInstalledRelease("/tmp/installed2.json", { version: "4.4-stable", mono: false });

            expect(fs.existsSync).toBeCalledWith("/tmp/installed2.json");
            expect(fs.existsSync).toHaveReturnedWith(false);

            expect(fs.promises.writeFile).toHaveBeenCalledWith("/tmp/installed2.json", JSON.stringify([{ version: "4.4-stable", mono: false }], null, 4), "utf-8");

            expect(result).toEqual([{ version: "4.4-stable", mono: false }]);
        });


        test("should remove installed release", async () => {


            fsMock.existsSync.mockReturnValueOnce(true);

            fsPromisesMock.readFile.mockResolvedValueOnce(JSON.stringify([
                { version: "4.4-stable", mono: false },
                { version: "4.4-stable", mono: true }
            ]));


            const result = await removeStoredInstalledRelease("/tmp/installed2.json", { version: "4.4-stable", mono: false });

            expect(fs.existsSync).toBeCalledWith("/tmp/installed2.json");
            expect(fs.existsSync).toHaveReturnedWith(true);

            expect(fs.promises.readFile).toBeCalledWith("/tmp/installed2.json", "utf-8");
            expect(fs.promises.writeFile).toHaveBeenCalledTimes(1);
            expect(fs.promises.writeFile).toBeCalledWith("/tmp/installed2.json", JSON.stringify([{ version: "4.4-stable", mono: true }], null, 4), "utf-8");

            expect(result).toEqual([{ version: "4.4-stable", mono: true }]);

        });

    });

});
