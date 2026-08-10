import type {
    EditorCatalogRelease,
    EditorCatalogResult,
    ReleaseSummary,
} from '@shared/contracts';

/** Catalog data in the shape still used by the release provider. */
export type LegacyEditorCatalog = {
    availableReleases: ReleaseSummary[];
    availablePrereleases: ReleaseSummary[];
    refreshError?: string;
};

/**
 * Converts one catalog release into the legacy install shape.
 *
 * @param release - The catalog release to convert.
 * @returns A release that the current installer can use.
 */
export function mapEditorCatalogRelease(
    release: EditorCatalogRelease,
): ReleaseSummary {
    return {
        tag: release.tag,
        version: release.version,
        version_number: Number.parseFloat(release.baseVersion),
        name: release.name,
        published_at: release.publishedAt,
        draft: false,
        prerelease: release.prerelease,
        assets: release.variants.flatMap((variant) =>
            variant.assets.map((asset) => ({
                name: asset.name,
                download_url: asset.downloadUrl,
                platform_tags: [asset.platform, asset.architecture],
                mono: variant.flavor === 'dotnet',
            })),
        ),
    };
}

/**
 * Splits catalog releases into the lists used by the current UI.
 *
 * @param result - The catalog result to convert.
 * @returns Legacy stable and prerelease lists with any refresh error.
 */
export function mapEditorCatalogResult(
    result: EditorCatalogResult,
): LegacyEditorCatalog {
    const releases = result.releases.map(mapEditorCatalogRelease);

    return {
        availableReleases: releases.filter((release) => !release.prerelease),
        availablePrereleases: releases.filter((release) => release.prerelease),
        refreshError: result.providers.find((provider) => provider.refreshError)
            ?.refreshError,
    };
}
