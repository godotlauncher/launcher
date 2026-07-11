import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import type { AssetSummary, InstalledRelease, ReleaseSummary } from '@shared';
import logger from 'electron-log';
import { PROJECTS_FILENAME } from '../constants.js';
import { t } from '../i18n/index.js';
import type { ReleaseAsset } from '../types/github.js';
import { removeProjectEditor } from './godot.utils.js';
import { __resetJsonStoreForTesting } from './jsonStore.js';
import {
    __resetJsonStoreFactoryForTesting,
    createTypedJsonStore,
    type TypedJsonStore,
} from './jsonStoreFactory.js';
import { getDefaultDirs } from './platform.utils.js';
import { getReleaseBaseVersion } from './projectLauncherConfig.utils.js';
import { getStoredProjectsList } from './projects.utils.js';

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
    } else if (name.includes('win64')) {
        platform_tags = ['win32', 'x64'];
    }
    // Windows 32-bit
    else if (name.includes('win32')) {
        platform_tags = ['win32', 'ia32'];
    }
    // macOS (darwin)
    else if (
        name.includes('osx') ||
        name.includes('macos') ||
        name.includes('universal')
    ) {
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
    else if (name.includes('x11')) {
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
        mono,
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
    assets: AssetSummary[],
): AssetSummary[] | undefined {
    const platformAsset = assets.filter(
        (asset) =>
            asset.platform_tags.includes(platform) &&
            asset.platform_tags.includes(arch),
    );

    return platformAsset;
}

export type DownloadReleaseAssetProgress = {
    receivedBytes: number;
    totalBytes?: number;
};

export type DownloadReleaseAssetOptions = {
    idleTimeoutMs?: number;
    onProgress?: (progress: DownloadReleaseAssetProgress) => void;
};

function getDownloadErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        if (
            error.name === 'AbortError' ||
            error.message === 'terminated' ||
            error.message.includes('terminated')
        ) {
            return t('installEditor:errors.downloadInterrupted');
        }

        return t('installEditor:errors.downloadFailed', {
            error: error.message,
        });
    }

    return t('installEditor:errors.downloadFailedUnknown');
}

type ReleaseSummaryCache = {
    lastPublishDate: Date;
    lastUpdated: number;
    releases: ReleaseSummary[];
};

export async function downloadReleaseAsset(
    asset: AssetSummary,
    downloadPath: string,
    options: DownloadReleaseAssetOptions = {},
): Promise<void> {
    const idleTimeoutMs = options.idleTimeoutMs ?? 120_000;
    const controller = new AbortController();
    let idleTimeout: NodeJS.Timeout | undefined;
    const clearIdleTimeout = () => {
        if (idleTimeout) {
            clearTimeout(idleTimeout);
            idleTimeout = undefined;
        }
    };
    const resetIdleTimeout = () => {
        clearIdleTimeout();
        idleTimeout = setTimeout(() => {
            controller.abort();
        }, idleTimeoutMs);
    };

    let res: Response;
    try {
        resetIdleTimeout();
        res = await fetch(asset.download_url, {
            signal: controller.signal,
        });
    } catch (error) {
        clearIdleTimeout();
        throw new Error(getDownloadErrorMessage(error), { cause: error });
    }

    if (!res.ok) {
        clearIdleTimeout();
        throw new Error(
            t('installEditor:errors.downloadHttpError', {
                status: res.statusText || String(res.status),
            }),
        );
    }
    if (!res.body) {
        clearIdleTimeout();
        throw new Error(t('installEditor:errors.downloadEmptyResponse'));
    }

    const totalBytesHeader = res.headers.get('content-length');
    const parsedTotalBytes = totalBytesHeader
        ? Number.parseInt(totalBytesHeader, 10)
        : Number.NaN;
    const totalBytes = Number.isFinite(parsedTotalBytes)
        ? parsedTotalBytes
        : undefined;
    let receivedBytes = 0;
    const progressStream = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            resetIdleTimeout();
            receivedBytes += chunk.length;
            options.onProgress?.({
                receivedBytes,
                totalBytes,
            });
            callback(null, chunk);
        },
    });

    const fileStream = fs.createWriteStream(downloadPath, { flags: 'wx' });
    try {
        await pipeline(
            Readable.fromWeb(res.body as unknown as ReadableStream),
            progressStream,
            fileStream,
        );
    } catch (error) {
        throw new Error(getDownloadErrorMessage(error), { cause: error });
    } finally {
        clearIdleTimeout();
    }
}

/**
 * Retrieves the path to the cached releases file.
 * @param releasesCachePath - The path to the cached releases file.
 * @returns The path to the cached releases file.
 */
type ReleaseCacheStore = TypedJsonStore<ReleaseSummaryCache>;

function normalizeReleaseCache(
    cache: ReleaseSummaryCache,
): ReleaseSummaryCache {
    return {
        ...cache,
        lastPublishDate:
            cache.lastPublishDate instanceof Date
                ? cache.lastPublishDate
                : new Date(cache.lastPublishDate ?? 0),
        lastUpdated: cache.lastUpdated ?? 0,
        releases: [...(cache.releases ?? [])],
    };
}

const availableReleaseStores = new Map<string, ReleaseCacheStore>();
const prereleaseStores = new Map<string, ReleaseCacheStore>();

function createReleaseStore(
    cachePath: string,
    id: string,
    logLabel: string,
): ReleaseCacheStore {
    const existing = id.startsWith('prereleases')
        ? prereleaseStores.get(cachePath)
        : availableReleaseStores.get(cachePath);
    if (existing) {
        return existing;
    }

    const store = createTypedJsonStore<ReleaseSummaryCache>({
        id,
        logLabel,
        pathProvider: () => cachePath,
        defaultValue: async () => ({
            lastPublishDate: new Date(0),
            lastUpdated: 0,
            releases: [],
        }),
        normalize: async (cache) => normalizeReleaseCache(cache),
        onParseError: () => {
            logger.error(`Failed to read ${logLabel}`);
            return {
                lastPublishDate: new Date(0),
                lastUpdated: 0,
                releases: [],
            };
        },
    });

    if (id.startsWith('prereleases')) {
        prereleaseStores.set(cachePath, store);
    } else {
        availableReleaseStores.set(cachePath, store);
    }

    return store;
}

export async function getStoredAvailableReleases(
    releasesCachePath: string,
): Promise<ReleaseSummaryCache> {
    const store = createReleaseStore(
        releasesCachePath,
        `available-releases:${releasesCachePath}`,
        'available releases cache',
    );
    const cache = await store.read();
    return normalizeReleaseCache(cache);
}

export async function storeAvailableReleases(
    releasesCachePath: string,
    lastPublishDate: Date,
    releases: ReleaseSummary[],
): Promise<ReleaseSummaryCache> {
    const store = createReleaseStore(
        releasesCachePath,
        `available-releases:${releasesCachePath}`,
        'available releases cache',
    );
    const persisted = await store.write({
        lastPublishDate,
        lastUpdated: Date.now(),
        releases,
    });
    return normalizeReleaseCache(persisted);
}

let installedReleasesStore: TypedJsonStore<InstalledRelease[]> | null = null;
let installedReleasesPath: string | null = null;

type InstalledReleaseIdentity = Pick<InstalledRelease, 'version' | 'mono'>;

export function getInstalledReleaseIdentity(
    release: InstalledReleaseIdentity,
): string {
    return `${release.version}:${release.mono ? 'mono' : 'standard'}`;
}

export function hasSameInstalledReleaseIdentity(
    a: InstalledReleaseIdentity,
    b: InstalledReleaseIdentity,
): boolean {
    return getInstalledReleaseIdentity(a) === getInstalledReleaseIdentity(b);
}

function preferInstalledRelease(
    current: InstalledRelease,
    candidate: InstalledRelease,
): InstalledRelease {
    if (current.valid === false && candidate.valid !== false) {
        return candidate;
    }

    if (current.valid !== false && candidate.valid === false) {
        return current;
    }

    return candidate;
}

export function dedupeInstalledReleases(
    releases: InstalledRelease[],
): InstalledRelease[] {
    const releasesByIdentity = new Map<string, InstalledRelease>();

    for (const release of releases) {
        const normalizedRelease = {
            ...release,
            valid: typeof release.valid === 'boolean' ? release.valid : true,
            base_version: getReleaseBaseVersion(release),
        };
        const identity = getInstalledReleaseIdentity(normalizedRelease);
        const existing = releasesByIdentity.get(identity);

        releasesByIdentity.set(
            identity,
            existing
                ? preferInstalledRelease(existing, normalizedRelease)
                : normalizedRelease,
        );
    }

    return [...releasesByIdentity.values()].sort(
        (a, b) => a.version_number - b.version_number,
    );
}

function normalizeInstalledReleases(
    releases: InstalledRelease[],
): InstalledRelease[] {
    return releases
        .map((release) => ({
            ...release,
            valid: typeof release.valid === 'boolean' ? release.valid : true,
            base_version: getReleaseBaseVersion(release),
        }))
        .sort((a, b) => a.version_number - b.version_number);
}

function ensureInstalledReleasesPath(): string {
    if (installedReleasesPath) {
        return installedReleasesPath;
    }

    const { installedReleasesCachePath } = getDefaultDirs();
    installedReleasesPath = installedReleasesCachePath;
    return installedReleasesPath;
}

function ensureInstalledReleasesStore(): TypedJsonStore<InstalledRelease[]> {
    if (installedReleasesStore) {
        return installedReleasesStore;
    }

    const path = ensureInstalledReleasesPath();
    installedReleasesStore = createTypedJsonStore<InstalledRelease[]>({
        id: 'installed-releases',
        logLabel: 'installed releases',
        pathProvider: () => path,
        defaultValue: () => [],
        normalize: async (releases) => normalizeInstalledReleases(releases),
        onParseError: (error) => {
            logger.error('Failed to read installed releases', error);
            return [];
        },
    });

    return installedReleasesStore;
}

export async function getStoredInstalledReleases(): Promise<
    InstalledRelease[]
> {
    return ensureInstalledReleasesStore().read();
}

export async function addStoredInstalledRelease(
    release: InstalledRelease,
): Promise<InstalledRelease[]> {
    return ensureInstalledReleasesStore().update((releases) => {
        const nextReleases = releases.filter(
            (storedRelease) =>
                !hasSameInstalledReleaseIdentity(storedRelease, release),
        );
        nextReleases.push(release);
        return nextReleases;
    });
}

function matchesReleaseLocation(
    storedRelease: InstalledRelease,
    releaseToRemove: InstalledRelease,
): boolean {
    if (releaseToRemove.editor_path) {
        return storedRelease.editor_path === releaseToRemove.editor_path;
    }

    if (releaseToRemove.install_path) {
        return storedRelease.install_path === releaseToRemove.install_path;
    }

    return true;
}

export async function removeStoredInstalledRelease(
    release: InstalledRelease,
): Promise<InstalledRelease[]> {
    return ensureInstalledReleasesStore().update((releases) =>
        releases.filter(
            (r) =>
                !(
                    hasSameInstalledReleaseIdentity(r, release) &&
                    matchesReleaseLocation(r, release)
                ),
        ),
    );
}

export async function saveStoredInstalledReleases(
    releases: InstalledRelease[],
): Promise<InstalledRelease[]> {
    return ensureInstalledReleasesStore().write(releases);
}

export function __resetInstalledReleasesStoreForTesting(): void {
    __resetJsonStoreFactoryForTesting();
    __resetJsonStoreForTesting();
    installedReleasesStore = null;
    installedReleasesPath = null;
    availableReleaseStores.clear();
    prereleaseStores.clear();
}

export function __resetReleaseCachesForTesting(): void {
    availableReleaseStores.forEach((store) => {
        void store.clear();
    });
    prereleaseStores.forEach((store) => {
        void store.clear();
    });
    availableReleaseStores.clear();
    prereleaseStores.clear();
    __resetJsonStoreFactoryForTesting();
    __resetJsonStoreForTesting();
}

export async function removeProjectEditorUsingRelease(
    release: InstalledRelease,
): Promise<void> {
    const { configDir } = getDefaultDirs();
    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);
    const projects = await getStoredProjectsList(projectListPath);

    for (const project of projects) {
        if (project.release.editor_path === release.editor_path) {
            await removeProjectEditor(project);
        }
    }
}
