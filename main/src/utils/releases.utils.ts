import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import type { AssetSummary, ReleaseSummary } from '@shared/contracts';
import logger from 'electron-log';
import { t } from '../i18n/index.js';
import type { ReleaseAsset } from '../types/github.js';
import {
    type ArchiveIntegrity,
    archiveDigestsMatch,
    normalizeGithubAssetDigest,
} from './archive-integrity.util.js';
import { __resetJsonStoreForTesting } from './jsonStore.js';
import {
    __resetJsonStoreFactoryForTesting,
    createTypedJsonStore,
    type TypedJsonStore,
} from './jsonStoreFactory.js';

export { parseReleaseName, sortReleases } from './releaseSorting.utils.js';

/**
 * Creates a summary of a release asset with relevant tags and download URL.
 *
 * @param asset - The release asset to summarize.
 * @param checksumManifestUrl - The same release's checksum manifest URL.
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
export function createAssetSummary(
    asset: ReleaseAsset,
    checksumManifestUrl?: string,
): AssetSummary {
    // Check if it's mono by name
    const name = asset.name.toLowerCase();
    const mono = name.includes('mono');
    const digest = normalizeGithubAssetDigest(asset.digest);

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
        ...(digest ? { digest } : {}),
        ...(checksumManifestUrl
            ? { checksum_manifest_url: checksumManifestUrl }
            : {}),
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
    integrity: ArchiveIntegrity;
    idleTimeoutMs?: number;
    signal?: AbortSignal;
    onProgress?: (progress: DownloadReleaseAssetProgress) => void;
};

function getDownloadErrorMessage(error: unknown): string {
    if (isInterruptedDownloadError(error)) {
        return t('installEditor:errors.downloadInterrupted');
    }

    if (error instanceof Error) {
        return t('installEditor:errors.downloadFailed', {
            error: error.message,
        });
    }

    return t('installEditor:errors.downloadFailedUnknown');
}

/**
 * Checks whether an error or one of its causes describes an interrupted
 * download connection.
 *
 * @param error - The error returned by fetch or the download stream.
 * @returns Whether the user can retry the download after an interruption.
 */
function isInterruptedDownloadError(error: unknown): boolean {
    const visited = new Set<unknown>();
    let current = error;

    while (current instanceof Error && !visited.has(current)) {
        visited.add(current);
        const message = current.message.toLowerCase();
        const code = getErrorCode(current);

        if (
            current.name === 'AbortError' ||
            message.includes('terminated') ||
            message.includes('other side closed') ||
            code === 'UND_ERR_SOCKET'
        ) {
            return true;
        }

        current = current.cause;
    }

    return false;
}

/**
 * Reads an optional error code without depending on an Undici-specific type.
 *
 * @param error - An error that may include a code property.
 * @returns The error code when it is a string.
 */
function getErrorCode(error: Error): string | undefined {
    const code = (error as Error & { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
}

/**
 * Returns a user-facing message for a failed release-asset response.
 *
 * @param status - The HTTP response status.
 * @param statusText - The HTTP response status text.
 * @returns A localized explanation suitable for the failed download.
 */
function getDownloadHttpErrorMessage(
    status: number,
    statusText: string,
): string {
    if (status === 404) {
        return t('installEditor:errors.downloadAssetNotFound');
    }

    if (status === 429) {
        return t('installEditor:errors.downloadRateLimited');
    }

    if (status >= 500 && status <= 599) {
        return t('installEditor:errors.downloadServiceUnavailable');
    }

    return t('installEditor:errors.downloadHttpError', {
        status: statusText || String(status),
    });
}

type ReleaseSummaryCache = {
    integrityMetadataRefreshed?: boolean;
    lastPublishDate: Date;
    lastUpdated: number;
    releases: ReleaseSummary[];
};

export async function downloadReleaseAsset(
    asset: AssetSummary,
    downloadPath: string,
    options: DownloadReleaseAssetOptions,
): Promise<void> {
    const idleTimeoutMs = options.idleTimeoutMs ?? 120_000;
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) {
        abortFromCaller();
    } else {
        options.signal?.addEventListener('abort', abortFromCaller, {
            once: true,
        });
    }
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
        options.signal?.removeEventListener('abort', abortFromCaller);
        if (options.signal?.aborted) {
            throw options.signal.reason ?? error;
        }
        throw new Error(getDownloadErrorMessage(error), { cause: error });
    }

    if (!res.ok) {
        clearIdleTimeout();
        options.signal?.removeEventListener('abort', abortFromCaller);
        throw new Error(
            getDownloadHttpErrorMessage(res.status, res.statusText),
        );
    }
    if (!res.body) {
        clearIdleTimeout();
        options.signal?.removeEventListener('abort', abortFromCaller);
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
    const hash = createHash(options.integrity.algorithm);
    const progressStream = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            resetIdleTimeout();
            receivedBytes += chunk.length;
            hash.update(chunk);
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
            { signal: controller.signal },
        );
    } catch (error) {
        await fs.promises.rm(downloadPath, { force: true }).catch(() => {});
        if (options.signal?.aborted) {
            throw options.signal.reason ?? error;
        }
        throw new Error(getDownloadErrorMessage(error), { cause: error });
    } finally {
        clearIdleTimeout();
        options.signal?.removeEventListener('abort', abortFromCaller);
    }

    const calculatedDigest = hash.digest('hex');
    if (!archiveDigestsMatch(calculatedDigest, options.integrity.digest)) {
        await fs.promises.rm(downloadPath, { force: true });
        throw new Error(t('installEditor:errors.archiveIntegrityMismatch'));
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
        integrityMetadataRefreshed: cache.integrityMetadataRefreshed === true,
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
            integrityMetadataRefreshed: false,
            lastPublishDate: new Date(0),
            lastUpdated: 0,
            releases: [],
        }),
        normalize: async (cache) => normalizeReleaseCache(cache),
        onParseError: () => {
            logger.error(`Failed to read ${logLabel}`);
            return {
                integrityMetadataRefreshed: false,
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

/**
 * Stores fetched release metadata.
 *
 * @param releasesCachePath - The cache file path.
 * @param lastPublishDate - The latest fetched release publication date.
 * @param releases - The releases to persist.
 * @param integrityMetadataRefreshed - Whether a complete integrity metadata refresh has completed.
 * @returns The normalized persisted cache.
 */
export async function storeAvailableReleases(
    releasesCachePath: string,
    lastPublishDate: Date,
    releases: ReleaseSummary[],
    integrityMetadataRefreshed = false,
): Promise<ReleaseSummaryCache> {
    const store = createReleaseStore(
        releasesCachePath,
        `available-releases:${releasesCachePath}`,
        'available releases cache',
    );
    const persisted = await store.write({
        integrityMetadataRefreshed,
        lastPublishDate,
        lastUpdated: Date.now(),
        releases,
    });
    return normalizeReleaseCache(persisted);
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
