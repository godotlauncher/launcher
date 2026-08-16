import type {
    EditorCatalogProviderId,
    EditorCatalogRelease,
} from '@shared/contracts';

/** Storage settings supplied by the application. */
export type EditorCatalogModuleOptions = {
    directory: string;
    fileName: string;
};

/** GitHub asset fields used by the catalog mapper. */
export type GithubEditorAsset = {
    id: number;
    name: string;
    browserDownloadUrl: string;
    digest: string | null;
};

/** GitHub release fields used by the catalog mapper. */
export type GithubEditorRelease = {
    id: number;
    name: string | null;
    tagName: string;
    publishedAt: string | null;
    draft: boolean;
    prerelease: boolean;
    assets: GithubEditorAsset[];
};

/** Cached data for one catalog provider. */
export type EditorCatalogProviderState = {
    integrityMetadataRefreshed?: boolean;
    lastFetchedAt: number | null;
    lastPublishedAt: string | null;
    releases: EditorCatalogRelease[];
};

/** Complete catalog data stored in the JSON file. */
export type EditorCatalogFile = {
    schemaVersion: 1;
    providers: Record<EditorCatalogProviderId, EditorCatalogProviderState>;
};

/** New provider data returned by a GitHub refresh. */
export type FetchedEditorCatalogProvider = {
    providerId: EditorCatalogProviderId;
    lastPublishedAt: string | null;
    releases: EditorCatalogRelease[];
};
