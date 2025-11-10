import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import logger from 'electron-log';
import { CACHE_LENGTH, MIN_VERSION } from '../constants.js';
import { getReleases } from '../utils/github.utils.js';
import { getDefaultDirs } from '../utils/platform.utils.js';
import { sortByPublishDate } from '../utils/releaseSorting.utils.js';
import {
    getStoredAvailableReleases,
    getStoredInstalledReleases,
    storeAvailableReleases,
} from '../utils/releases.utils.js';

export async function getInstalledReleases(): Promise<InstalledRelease[]> {
    return getStoredInstalledReleases();
}

export async function getAvailableReleases(): Promise<ReleaseSummary[]> {
    const { releaseCachePath } = getDefaultDirs();

    let releases = await getStoredAvailableReleases(releaseCachePath);

    if (releases.lastUpdated + CACHE_LENGTH < Date.now()) {
        const newReleases = await getReleases(
            'RELEASES',
            releases.lastPublishDate,
            MIN_VERSION,
            1,
            100,
        );

        const allReleases = newReleases.releases
            .concat(releases.releases)
            .sort(sortByPublishDate);

        releases = await storeAvailableReleases(
            releaseCachePath,
            newReleases.lastPublishDate,
            allReleases,
        );
    }

    return releases.releases;
}

export async function getAvailablePrereleases(): Promise<ReleaseSummary[]> {
    const { prereleaseCachePath } = getDefaultDirs();

    let releases = await getStoredAvailableReleases(prereleaseCachePath);

    if (releases.lastUpdated + CACHE_LENGTH < Date.now()) {
        const newReleases = await getReleases(
            'BUILDS',
            releases.lastPublishDate,
            MIN_VERSION,
            1,
            100,
        );

        const allReleases = newReleases.releases
            .concat(releases.releases)
            .sort(sortByPublishDate);

        releases = await storeAvailableReleases(
            prereleaseCachePath,
            newReleases.lastPublishDate,
            allReleases,
        );
    }

    return releases.releases;
}

async function removeCacheIfExists(cachePath: string): Promise<void> {
    try {
        await fs.unlink(cachePath);
        logger.debug(`Removed release cache file at ${cachePath}`);
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err?.code === 'ENOENT') {
            logger.debug(
                `Release cache file not found at ${cachePath}, skipping removal`,
            );
            return;
        }

        logger.error(
            `Failed to remove release cache file at ${cachePath}`,
            err,
        );
        throw err;
    }
}

export async function clearReleaseCaches(): Promise<void> {
    const { releaseCachePath, prereleaseCachePath } = getDefaultDirs();

    logger.info('Clearing cached release manifests');
    await Promise.all([
        removeCacheIfExists(releaseCachePath),
        removeCacheIfExists(prereleaseCachePath),
    ]);

    try {
        const [latestReleases, latestPrereleases] = await Promise.all([
            getReleases('RELEASES', new Date(0), MIN_VERSION, 1, 100),
            getReleases('BUILDS', new Date(0), MIN_VERSION, 1, 100),
        ]);

        await Promise.all([
            storeAvailableReleases(
                releaseCachePath,
                latestReleases.lastPublishDate,
                [...latestReleases.releases].sort(sortByPublishDate),
            ),
            storeAvailableReleases(
                prereleaseCachePath,
                latestPrereleases.lastPublishDate,
                [...latestPrereleases.releases].sort(sortByPublishDate),
            ),
        ]);
        logger.info('Release caches rebuilt successfully');
    } catch (error) {
        logger.error('Failed to rebuild release caches', error);
        throw error;
    }
}

export async function openProjectManager(
    release: InstalledRelease,
): Promise<void> {
    let launchPath = release.editor_path;
    if (os.platform() === 'darwin') {
        launchPath = path.resolve(
            release.editor_path,
            'Contents',
            'MacOS',
            'Godot',
        );
    }

    const editor = spawn(launchPath, ['-p'], {
        detached: true,
        stdio: 'ignore',
    });
    editor.unref();
}
