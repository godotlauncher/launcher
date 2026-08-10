import type { EditorCatalogProviderId } from '@shared/contracts';

/** Token used to inject the catalog module options. */
export const EDITOR_CATALOG_MODULE_OPTIONS = Symbol(
    'EDITOR_CATALOG_MODULE_OPTIONS',
);
/** Current version of the stored catalog format. */
export const EDITOR_CATALOG_SCHEMA_VERSION = 1 as const;
/** Time before cached catalog data becomes stale. */
export const EDITOR_CATALOG_CACHE_TTL_MS = 1000 * 60 * 10;
/** Oldest supported Godot editor major version. */
export const EDITOR_CATALOG_MIN_VERSION = 4;
/** Number of GitHub releases requested on each page. */
export const EDITOR_CATALOG_PAGE_SIZE = 100;
/** Highest number of GitHub pages fetched in one refresh. */
export const EDITOR_CATALOG_PAGE_LIMIT = 100;

/** Provider IDs supported by the catalog. */
export const EDITOR_CATALOG_PROVIDER_IDS = [
    'official-stable',
    'official-prerelease',
] as const satisfies readonly EditorCatalogProviderId[];

/** Describes one GitHub source used by the catalog. */
export type EditorCatalogProviderDefinition = {
    id: EditorCatalogProviderId;
    owner: string;
    repository: string;
    prerelease: boolean;
};

/** GitHub settings for each catalog provider. */
export const EDITOR_CATALOG_PROVIDERS: Record<
    EditorCatalogProviderId,
    EditorCatalogProviderDefinition
> = {
    'official-stable': {
        id: 'official-stable',
        owner: 'godotengine',
        repository: 'godot',
        prerelease: false,
    },
    'official-prerelease': {
        id: 'official-prerelease',
        owner: 'godotengine',
        repository: 'godot-builds',
        prerelease: true,
    },
};
