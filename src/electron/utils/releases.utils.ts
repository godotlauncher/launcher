import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { ReadableStream } from 'node:stream/web';
import * as fs from 'node:fs';
import * as path from 'node:path';
import logger from 'electron-log';

import { getStoredProjectsList } from './projects.utils.js';
import { getDefaultDirs } from './platform.utils.js';
import { PROJECTS_FILENAME } from '../constants.js';
import { removeProjectEditor } from './godot.utils.js';

export { parseReleaseName, sortReleases } from './releaseSorting.utils.js';


/**
 * Creates a summary of a release asset with relevant tags and download URL.
 *
 * @param asset - The release asset to summarize.
 * @returns An object containing the asset name, platform tags, download URL, and a flag indicating if it's a Mono version.
 *
 * @remarks
 * The function assigns tags based on the asset name. It identifies the platform (Windows, OSX, Linux) and architecture (x32, x64, arm64, arm32).
 * Additional tags can be added based on custom logic.
 *
 * @example
 * ```typescript
 * const asset = {
 *   name: 'Godot_v3.6-stable_win64.exe.zip',
 *   browser_download_url: 'https://example.com/download/Godot_v3.6-stable_win64.exe.zip'
 * };
 * const summary = createAssetSummery(asset);
 * // summary = {
 * //   name: 'Godot_v3.6-stable_win64.exe.zip',
 * //   platform_tags: ['windows', 'x64'],
 * //   download_url: 'https://example.com/download/Godot_v3.6-stable_win64.exe.zip',
 * //   mono: false
 * // }
 * ```
 */
export function createAssetSummary(asset: ReleaseAsset): AssetSummary {
    // Check if it's mono by name
    const name = asset.name.toLowerCase();
    const mono = name.includes('mono');

    // Default to empty tags
    let platform_tags: string[] = [];

    // Windows 64-bit
    if (name.includes('windows_arm64')) {
        platform_tags = ['win32', 'arm64'];
    }
    else if (name.includes('win64')) {
        platform_tags = ['win32', 'x64'];
    }
    // Windows 32-bit
    else if (name.includes('win32')) {
        platform_tags = ['win32', 'ia32'];
    }
    // macOS (darwin)
    else if (name.includes('osx') || name.includes('macos') || name.includes('universal')) {
        platform_tags = ['darwin', 'x64', 'arm64'];
    }
    // Linux
    else if (name.includes('linux')) {
        // arm32
        if (name.includes('arm32')) {
            platform_tags = ['linux', 'arm'];
        }
        // arm64
        else if (name.includes('arm64')) {
            platform_tags = ['linux', 'arm64'];
        }
        // x64
        else if (name.includes('64')) {
            platform_tags = ['linux', 'x64'];
        }
        // ia32
        else if (name.includes('32')) {
            platform_tags = ['linux', 'ia32'];
        }
    }
    // Linux 64-bit (headless/server/x11)
    else if (
        name.includes('x11')
    ) {
        if (name.includes('64')) {
            platform_tags = ['linux', 'x64'];
        }
        // Linux 32-bit (x11)
        else if (name.includes('32')) {
            platform_tags = ['linux', 'ia32'];
        }
    }
    // Fallback for other cases or unknown platforms/arches
    // platform_tags remains empty

    return {
        name: asset.name,
        download_url: asset.browser_download_url,
        platform_tags,
        mono
    };
}

/**
 * Retrieves the asset summary that matches the specified platform and architecture.
 *
 * @param platform - The platform to match (e.g., 'windows', 'linux', 'mac').
 * @param arch - The architecture to match (e.g., 'x64', 'arm64').
 * @param assets - An array of asset summaries to search through.
 * @returns The asset summary that matches the specified platform and architecture, or undefined if no match is found.
 */
export function getPlatformAsset(
    platform: string,
    arch: string,
    assets: AssetSummary[]
): AssetSummary[] | undefined {
    const platformAsset = assets.filter(asset =>
        asset.platform_tags.includes(platform) &&
        asset.platform_tags.includes(arch)
    );

    return platformAsset;
}

type ReleaseSummaryCache = {
    lastPublishDate: Date;
    lastUpdated: number;
    releases: ReleaseSummary[];
};


export async function downloadReleaseAsset(asset: AssetSummary, downloadPath: string): Promise<void> {

    const res = await fetch(asset.download_url);
    if (!res.ok) {
        throw new Error(`Failed to download asset: ${res.statusText}`);
    }

    const fileStream = fs.createWriteStream(downloadPath, { flags: 'wx' });
    if (res.body) {
        await finished(Readable.fromWeb(res.body as unknown as ReadableStream).pipe(fileStream));
        fileStream.close();
    }

}


/**
 * Retrieves the path to the cached releases file.
 * @param releasesCachePath - The path to the cached releases file.
 * @returns The path to the cached releases file.
 */
export async function getStoredAvailableReleases(releasesCachePath: string): Promise<ReleaseSummaryCache> {

    try {
        logger.debug(`Checking for cached releases at: ${releasesCachePath}`);

        if (fs.existsSync(releasesCachePath)) {

            const releasesData = await fs.promises.readFile(releasesCachePath, 'utf-8');

            const parsed = JSON.parse(releasesData) as ReleaseSummaryCache;

            parsed.lastPublishDate = new Date(parsed.lastPublishDate);

            return parsed;

        }


    } catch (error) {

        logger.error('Failed to read cached releases', error);
    }

    return { lastPublishDate: new Date(0), lastUpdated: 0, releases: [] };
}

/**
 * Saves the release summaries to a cache file.
 * @param releasesCachePath - The path to the cached releases file.
 * @param releases - The release summaries to cache.
 */
export async function storeAvailableReleases(releasesCachePath: string, lastPublishDate: Date, releases: ReleaseSummary[]): Promise<ReleaseSummaryCache> {

    const cache: ReleaseSummaryCache = {
        lastPublishDate,
        lastUpdated: Date.now(),
        releases,
    };

    const cacheData = JSON.stringify(cache, null, 4);
    await fs.promises.writeFile(releasesCachePath, cacheData, 'utf-8');
    return cache;
}

export async function getStoredInstalledReleases(installedReleasesPath: string): Promise<InstalledRelease[]> {

    try {
        if (fs.existsSync(installedReleasesPath)) {
            const releasesData = await fs.promises.readFile(installedReleasesPath, 'utf-8');
            const releases = JSON.parse(releasesData) as InstalledRelease[];
            const normalized = releases
                .map(release => ({
                    ...release,
                    valid: typeof release.valid === 'boolean' ? release.valid : true,
                }))
                .sort((a, b) => a.version_number - b.version_number);
            return normalized;
        }
    } catch (error) {
        logger.error('Failed to read installed releases', error);
    }

    return [];
}

export async function addStoredInstalledRelease(installedReleaseCachePath: string, releases: InstalledRelease): Promise<InstalledRelease[]> {

    const allInstalledReleases = await getStoredInstalledReleases(installedReleaseCachePath);
    allInstalledReleases.push(releases);

    const cacheData = JSON.stringify(allInstalledReleases, null, 4);

    await fs.promises.writeFile(installedReleaseCachePath, cacheData, 'utf-8');

    return allInstalledReleases;
}

export async function removeStoredInstalledRelease(installedReleaseCachePath: string, release: InstalledRelease): Promise<InstalledRelease[]> {

    const allInstalledReleases = await getStoredInstalledReleases(installedReleaseCachePath);

    const updatedInstalledReleases = allInstalledReleases.filter(r => !(r.version === release.version && r.mono === release.mono));

    const cacheData = JSON.stringify(updatedInstalledReleases, null, 4);

    await fs.promises.writeFile(installedReleaseCachePath, cacheData, 'utf-8');

    return updatedInstalledReleases;
}

export async function saveStoredInstalledReleases(installedReleaseCachePath: string, releases: InstalledRelease[]): Promise<InstalledRelease[]> {

    const cacheData = JSON.stringify(releases, null, 4);

    await fs.promises.writeFile(installedReleaseCachePath, cacheData, 'utf-8');
    return releases;
}

export async function removeProjectEditorUsingRelease(release: InstalledRelease): Promise<void> {

    const { configDir } = getDefaultDirs();
    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);
    const projects = await getStoredProjectsList(projectListPath);

    for (const project of projects) {
        if (project.release.editor_path === release.editor_path) {
            await removeProjectEditor(project);
        }
    }
}
