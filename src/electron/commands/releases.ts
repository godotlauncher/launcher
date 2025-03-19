import * as os from 'os';
import * as path from 'node:path';

import { getDefaultDirs } from '../utils/platform.utils.js';
import { getStoredAvailableReleases, getStoredInstalledReleases, storeAvailableReleases } from '../utils/releases.utils.js';
import { CACHE_LENGTH, MIN_VERSION } from '../constants.js';
import { getReleases } from '../utils/github.utils.js';
import { sortByPublishDate } from '../utils/releaseSorting.utils.js';
import { spawn } from 'child_process';

export async function getInstalledReleases(): Promise<InstalledRelease[]> {
    const { installedReleasesCachePath: installedReleasesPath } = getDefaultDirs();

    const installedReleases = await getStoredInstalledReleases(
        installedReleasesPath
    );
    return installedReleases;
}

export async function getAvailableReleases(): Promise<ReleaseSummary[]> {
    const { releaseCachePath } = getDefaultDirs();

    let releases = await getStoredAvailableReleases(releaseCachePath);

    if (releases.lastUpdated + CACHE_LENGTH < Date.now()) {
        const newReleases = await getReleases('RELEASES', releases.lastPublishDate, MIN_VERSION, 1, 100);

        const allReleases = newReleases.releases.concat(releases.releases).sort(sortByPublishDate);


        releases = await storeAvailableReleases(
            releaseCachePath,
            newReleases.lastPublishDate,
            allReleases
        );
    }

    return releases.releases;
}

export async function getAvailablePrereleases(): Promise<ReleaseSummary[]> {
    const { prereleaseCachePath } = getDefaultDirs();

    let releases = await getStoredAvailableReleases(prereleaseCachePath);

    if (releases.lastUpdated + CACHE_LENGTH < Date.now()) {
        const newReleases = await getReleases('BUILDS', releases.lastPublishDate, MIN_VERSION, 1, 100);

        const allReleases = newReleases.releases.concat(releases.releases).sort(sortByPublishDate);

        releases = await storeAvailableReleases(
            prereleaseCachePath,
            newReleases.lastPublishDate,
            allReleases
        );
    }

    return releases.releases;
}

export async function openProjectManager(release: InstalledRelease): Promise<void> {

    let launchPath = release.editor_path;
    if (os.platform() === 'darwin') {
        launchPath = path.resolve(release.editor_path, 'Contents', 'MacOS', 'Godot');
    }

    const editor = spawn(launchPath, ['-p'], { detached: true, stdio: 'ignore' });
    editor.unref();

}