import type {
    EditorCatalogArchitecture,
    EditorCatalogAsset,
    EditorCatalogFlavor,
    EditorCatalogPlatform,
    EditorCatalogProviderId,
    EditorCatalogRelease,
} from '@shared/contracts';
import { normalizeGithubAssetDigest } from '../utils/archive-integrity.util.js';
import { EDITOR_CATALOG_MIN_VERSION } from './editor-catalog.constants.js';
import type {
    GithubEditorAsset,
    GithubEditorRelease,
} from './editor-catalog.types.js';

/** Platform and architectures found in an asset name. */
type AssetTarget = {
    platform: EditorCatalogPlatform;
    architectures: EditorCatalogArchitecture[];
};

/**
 * Converts one GitHub release into a catalog release.
 *
 * @param providerId - The provider that supplied the release.
 * @param providerPrerelease - Whether the provider contains prereleases.
 * @param release - The GitHub release to convert.
 * @returns A catalog release, or null when the release is unsupported.
 */
export function mapGithubEditorRelease(
    providerId: EditorCatalogProviderId,
    providerPrerelease: boolean,
    release: GithubEditorRelease,
): EditorCatalogRelease | null {
    if (release.draft || !release.tagName.trim()) {
        return null;
    }

    const versionParts = parseEditorVersion(release.tagName);
    if (!versionParts || versionParts.major < EDITOR_CATALOG_MIN_VERSION) {
        return null;
    }

    const releaseId = `${providerId}:${release.tagName}`;
    const checksumManifestUrl = release.assets.find(
        (asset) => asset.name === 'SHA512-SUMS.txt',
    )?.browserDownloadUrl;
    const assetsByFlavor = Map.groupBy(
        release.assets.flatMap((asset) =>
            mapGithubAsset(releaseId, asset, checksumManifestUrl),
        ),
        ({ flavor }) => flavor,
    );
    const variants = (
        [...assetsByFlavor.entries()] as Array<
            [
                EditorCatalogFlavor,
                Array<{
                    flavor: EditorCatalogFlavor;
                    asset: EditorCatalogAsset;
                }>,
            ]
        >
    ).map(([flavor, entries]) => ({
        id: `${releaseId}:${flavor}`,
        flavor,
        assets: entries.map(({ asset }) => asset),
    }));

    if (variants.length === 0) {
        return null;
    }

    return {
        id: releaseId,
        sourceReleaseId: String(release.id),
        providerId,
        tag: release.tagName,
        version: release.tagName,
        baseVersion: `${versionParts.major}.${versionParts.minor}`,
        name: release.name?.trim() || release.tagName,
        publishedAt: normalizePublishedAt(release.publishedAt),
        prerelease: providerPrerelease || release.prerelease,
        versionParts,
        variants,
    };
}

/**
 * Reads version parts from a Godot editor tag.
 *
 * @param version - The editor version or tag to read.
 * @returns Parsed version parts, or null when the value is invalid.
 */
export function parseEditorVersion(
    version: string,
): EditorCatalogRelease['versionParts'] | null {
    const match = version
        .trim()
        .replace(/^v/i, '')
        .match(
            /^(\d+)\.(\d+)(?:\.(\d+))?(?:-(stable|rc|beta|alpha|dev)(\d+)?)?$/i,
        );
    if (!match) {
        return null;
    }

    return {
        major: Number.parseInt(match[1], 10),
        minor: Number.parseInt(match[2], 10),
        patch: match[3] ? Number.parseInt(match[3], 10) : 0,
        channel: match[4]?.toLowerCase() ?? 'stable',
        iteration: match[5] ? Number.parseInt(match[5], 10) : 0,
    };
}

/**
 * Converts one GitHub asset into catalog assets.
 *
 * @param releaseId - The catalog ID of the parent release.
 * @param source - The GitHub asset to convert.
 * @param checksumManifestUrl - The release checksum manifest URL, when present.
 * @returns Catalog assets for each supported architecture.
 */
function mapGithubAsset(
    releaseId: string,
    source: GithubEditorAsset,
    checksumManifestUrl?: string,
): Array<{ flavor: EditorCatalogFlavor; asset: EditorCatalogAsset }> {
    const target = getAssetTarget(source.name);
    if (!target) {
        return [];
    }

    const flavor: EditorCatalogFlavor = source.name
        .toLowerCase()
        .includes('mono')
        ? 'dotnet'
        : 'gdscript';

    const digest = normalizeGithubAssetDigest(source.digest);
    return target.architectures.map((architecture) => ({
        flavor,
        asset: {
            id: `${releaseId}:${flavor}:${source.id}:${target.platform}:${architecture}`,
            name: source.name,
            downloadUrl: source.browserDownloadUrl,
            ...(digest ? { digest } : {}),
            ...(checksumManifestUrl ? { checksumManifestUrl } : {}),
            platform: target.platform,
            architecture,
        },
    }));
}

/**
 * Finds the platform and architectures in an asset name.
 *
 * @param name - The GitHub asset file name.
 * @returns The supported target, or null when none is found.
 */
function getAssetTarget(name: string): AssetTarget | null {
    const normalized = name.toLowerCase();
    if (normalized.includes('windows_arm64')) {
        return { platform: 'win32', architectures: ['arm64'] };
    }
    if (normalized.includes('win64')) {
        return { platform: 'win32', architectures: ['x64'] };
    }
    if (normalized.includes('win32')) {
        return { platform: 'win32', architectures: ['ia32'] };
    }
    if (
        normalized.includes('osx') ||
        normalized.includes('macos') ||
        normalized.includes('universal')
    ) {
        return { platform: 'darwin', architectures: ['x64', 'arm64'] };
    }
    if (normalized.includes('linux') || normalized.includes('x11')) {
        if (normalized.includes('arm32')) {
            return { platform: 'linux', architectures: ['arm'] };
        }
        if (normalized.includes('arm64')) {
            return { platform: 'linux', architectures: ['arm64'] };
        }
        if (normalized.includes('x86_32') || normalized.includes('32')) {
            return { platform: 'linux', architectures: ['ia32'] };
        }
        if (
            normalized.includes('x86_64') ||
            normalized.includes('x86-64') ||
            normalized.includes('64')
        ) {
            return { platform: 'linux', architectures: ['x64'] };
        }
    }

    return null;
}

/**
 * Converts a publication time into a valid ISO value.
 *
 * @param value - The publication time to normalize.
 * @returns The ISO time, or null when the value is missing or invalid.
 */
function normalizePublishedAt(value: string | null): string | null {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
