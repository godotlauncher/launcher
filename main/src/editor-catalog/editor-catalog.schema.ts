import { z } from 'zod';
import { getMacosAssetArchitectures } from '../utils/macos-asset.util.js';
import { sortReleases as compareEditorReleases } from '../utils/release-sorting.util.js';
import {
    EDITOR_CATALOG_PROVIDER_IDS,
    EDITOR_CATALOG_SCHEMA_VERSION,
} from './editor-catalog.constants.js';
import type {
    EditorCatalogFile,
    EditorCatalogProviderState,
} from './editor-catalog.types.js';

export { compareEditorReleases };

const EditorCatalogProviderIdSchema = z.enum(EDITOR_CATALOG_PROVIDER_IDS);
const EditorCatalogFlavorSchema = z.enum(['gdscript', 'dotnet']);
const EditorCatalogPlatformSchema = z.enum(['win32', 'darwin', 'linux']);
const EditorCatalogArchitectureSchema = z.enum(['x64', 'arm64', 'ia32', 'arm']);

const EditorCatalogAssetSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    downloadUrl: z.url(),
    digest: z
        .string()
        .regex(/^sha256:[0-9a-f]{64}$/)
        .optional(),
    checksumManifestUrl: z.url().optional(),
    platform: EditorCatalogPlatformSchema,
    architecture: EditorCatalogArchitectureSchema,
});

const EditorCatalogVariantSchema = z.object({
    id: z.string().min(1),
    flavor: EditorCatalogFlavorSchema,
    assets: z.array(EditorCatalogAssetSchema).min(1),
});

/** Checks the stored shape of one catalog release. */
export const EditorCatalogReleaseSchema = z.object({
    id: z.string().min(1),
    sourceReleaseId: z.string().min(1),
    providerId: EditorCatalogProviderIdSchema,
    tag: z.string().min(1),
    version: z.string().min(1),
    baseVersion: z.string().min(1),
    name: z.string().min(1),
    publishedAt: z.iso.datetime().nullable(),
    prerelease: z.boolean(),
    versionParts: z.object({
        major: z.number().int().nonnegative(),
        minor: z.number().int().nonnegative(),
        patch: z.number().int().nonnegative(),
        channel: z.string().min(1),
        iteration: z.number().int().nonnegative(),
    }),
    variants: z.array(EditorCatalogVariantSchema).min(1),
    templateAssets: z
        .array(
            z.object({
                id: z.string().min(1),
                name: z.string().min(1),
                flavor: EditorCatalogFlavorSchema,
                downloadUrl: z.url(),
                sizeBytes: z.number().nonnegative(),
                digest: z.string().optional(),
                checksumManifestUrl: z.url().optional(),
            }),
        )
        .optional(),
});

const EditorCatalogProviderStateSchema = z.object({
    integrityMetadataRefreshed: z.boolean().optional().default(false),
    templateMetadataRefreshed: z.boolean().optional().default(false),
    lastFetchedAt: z.number().int().nonnegative().nullable(),
    lastPublishedAt: z.iso.datetime().nullable(),
    releases: z.array(EditorCatalogReleaseSchema),
});

/** Checks the full stored catalog file. */
export const EditorCatalogFileSchema = z.object({
    schemaVersion: z.literal(EDITOR_CATALOG_SCHEMA_VERSION),
    providers: z.record(
        EditorCatalogProviderIdSchema,
        EditorCatalogProviderStateSchema,
    ),
});

/**
 * Creates a catalog with empty provider data.
 *
 * @returns A valid empty catalog.
 */
export function createEmptyEditorCatalog(): EditorCatalogFile {
    return {
        schemaVersion: EDITOR_CATALOG_SCHEMA_VERSION,
        providers: {
            'official-stable': createEmptyProviderState(),
            'official-prerelease': createEmptyProviderState(),
        },
    };
}

/**
 * Checks and sorts catalog data before it is stored or returned.
 *
 * @param value - The catalog data to check.
 * @returns Valid catalog data in a stable order.
 */
export function normalizeEditorCatalog(value: unknown): EditorCatalogFile {
    const catalog = EditorCatalogFileSchema.parse(value);

    return EditorCatalogFileSchema.parse({
        ...catalog,
        providers: Object.fromEntries(
            EDITOR_CATALOG_PROVIDER_IDS.map((providerId) => [
                providerId,
                normalizeProviderState(
                    providerId,
                    catalog.providers[providerId],
                ),
            ]),
        ),
    });
}

/**
 * Creates empty cached data for one provider.
 *
 * @returns Empty provider data.
 */
function createEmptyProviderState(): EditorCatalogProviderState {
    return {
        integrityMetadataRefreshed: false,
        templateMetadataRefreshed: false,
        lastFetchedAt: null,
        lastPublishedAt: null,
        releases: [],
    };
}

/**
 * Removes invalid provider releases and sorts the remaining releases.
 *
 * @param providerId - The provider that owns the releases.
 * @param state - The provider data to normalize.
 * @returns Normalized provider data.
 */
function normalizeProviderState(
    providerId: (typeof EDITOR_CATALOG_PROVIDER_IDS)[number],
    state: EditorCatalogProviderState,
): EditorCatalogProviderState {
    const releasesById = new Map(
        state.releases
            .filter((release) => release.providerId === providerId)
            .map((release) => [release.id, normalizeRelease(release)]),
    );

    return {
        integrityMetadataRefreshed: state.integrityMetadataRefreshed ?? false,
        templateMetadataRefreshed: state.templateMetadataRefreshed ?? false,
        lastFetchedAt: state.lastFetchedAt,
        lastPublishedAt: state.lastPublishedAt,
        releases: [...releasesById.values()].sort(compareEditorReleases),
    };
}

/**
 * Repairs cached macOS CPU labels and sorts the assets inside one release.
 *
 * @param release - The release to normalize.
 * @returns A copy of the release in a stable order.
 */
function normalizeRelease(
    release: EditorCatalogProviderState['releases'][number],
): EditorCatalogProviderState['releases'][number] {
    return {
        ...release,
        variants: [...release.variants]
            .map((variant) => ({
                ...variant,
                assets: variant.assets
                    .filter(
                        (asset) =>
                            asset.platform !== 'darwin' ||
                            getMacosAssetArchitectures(asset.name)?.some(
                                (architecture) =>
                                    architecture === asset.architecture,
                            ) !== false,
                    )
                    .sort((a, b) => a.id.localeCompare(b.id)),
            }))
            .sort((a, b) => a.flavor.localeCompare(b.flavor)),
    };
}
