import { Injectable } from '@mariodebono/di';
import type {
    EditorCatalogProviderId,
    EditorCatalogProviderStatus,
    EditorCatalogQuery,
    EditorCatalogRelease,
    EditorCatalogResult,
    GetEditorCatalogOptions,
} from '@shared/contracts';
import logger from 'electron-log';
import {
    EDITOR_CATALOG_CACHE_TTL_MS,
    EDITOR_CATALOG_PROVIDER_IDS,
} from './editor-catalog.constants.js';
import {
    compareEditorReleases,
    createEmptyEditorCatalog,
} from './editor-catalog.schema.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { EditorCatalogStore } from './editor-catalog.store.js';
import type {
    EditorCatalogFile,
    FetchedEditorCatalogProvider,
} from './editor-catalog.types.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GithubEditorCatalogAdapter } from './github-editor-catalog.adapter.js';

/** Reads, refreshes, and filters the editor catalog. */
@Injectable()
export class EditorCatalogService {
    private activeRefresh: ActiveRefresh | null = null;

    /**
     * Creates the catalog service.
     *
     * @param store - The store used for cached catalog data.
     * @param githubAdapter - The adapter used to read GitHub releases.
     */
    constructor(
        private readonly store: EditorCatalogStore,
        private readonly githubAdapter: GithubEditorCatalogAdapter,
    ) {}

    /**
     * Gets releases from the cache and refreshes stale data by default.
     *
     * @param options - Optional refresh and filter settings.
     * @returns The matching releases and provider status.
     */
    async getCatalog(
        options: GetEditorCatalogOptions = {},
    ): Promise<EditorCatalogResult> {
        const catalog = await this.store.read();
        const staleProviders = EDITOR_CATALOG_PROVIDER_IDS.filter(
            (providerId) => this.isStale(catalog, providerId),
        );

        if (options.refreshIfStale !== false && staleProviders.length > 0) {
            return this.refresh(staleProviders, options.query);
        }

        return this.createResult(catalog, options.query);
    }

    /**
     * Finds one release by its exact catalog ID.
     *
     * @param id - The release ID to find.
     * @returns The release, or null when it does not exist.
     */
    async getReleaseById(id: string): Promise<EditorCatalogRelease | null> {
        const result = await this.getCatalog();
        return result.releases.find((release) => release.id === id) ?? null;
    }

    /**
     * Refreshes every provider and returns matching releases.
     *
     * @param query - Optional filters for the returned releases.
     * @returns The refreshed releases and provider status.
     */
    refreshCatalog(query?: EditorCatalogQuery): Promise<EditorCatalogResult> {
        return this.refresh([...EDITOR_CATALOG_PROVIDER_IDS], query);
    }

    /**
     * Shares one active refresh between callers.
     *
     * @param providerIds - The providers to refresh.
     * @param query - Optional filters for the returned releases.
     * @returns The refreshed releases and provider status.
     */
    private async refresh(
        providerIds: EditorCatalogProviderId[],
        query?: EditorCatalogQuery,
    ): Promise<EditorCatalogResult> {
        const outcome = await this.refreshProviders(providerIds);
        return this.createResult(outcome.catalog, query, outcome.errors);
    }

    /**
     * Shares the active refresh and queues provider IDs it does not cover.
     *
     * @param providerIds - The providers the caller needs refreshed.
     * @returns The updated catalog and relevant provider errors.
     */
    private async refreshProviders(
        providerIds: EditorCatalogProviderId[],
    ): Promise<RefreshOutcome> {
        if (!this.activeRefresh) {
            const activeRefresh: ActiveRefresh = {
                providerIds: new Set(providerIds),
                promise: this.runRefresh(providerIds),
            };
            activeRefresh.promise = activeRefresh.promise.finally(() => {
                if (this.activeRefresh === activeRefresh) {
                    this.activeRefresh = null;
                }
            });
            this.activeRefresh = activeRefresh;
        }

        const activeRefresh = this.activeRefresh;
        const missingProviderIds = providerIds.filter(
            (providerId) => !activeRefresh.providerIds.has(providerId),
        );
        const outcome = await activeRefresh.promise;
        const errors = new Map<EditorCatalogProviderId, string>();
        for (const providerId of providerIds) {
            const message = outcome.errors.get(providerId);
            if (message !== undefined) {
                errors.set(providerId, message);
            }
        }

        if (missingProviderIds.length > 0) {
            const missingOutcome =
                await this.refreshProviders(missingProviderIds);
            for (const [providerId, message] of missingOutcome.errors) {
                errors.set(providerId, message);
            }
            return {
                catalog: missingOutcome.catalog,
                errors,
            };
        }

        return { catalog: outcome.catalog, errors };
    }

    /**
     * Fetches provider updates and stores successful results.
     *
     * @param providerIds - The providers to fetch.
     * @returns The updated catalog and any provider errors.
     */
    private async runRefresh(
        providerIds: EditorCatalogProviderId[],
    ): Promise<RefreshOutcome> {
        let catalog: EditorCatalogFile;
        let catalogReadable = true;
        try {
            catalog = await this.store.read();
        } catch (error) {
            catalogReadable = false;
            catalog = createEmptyEditorCatalog();
            logger.error('Failed to read editor catalog before refresh', error);
        }

        const refreshResults = await Promise.allSettled(
            providerIds.map((providerId) =>
                this.githubAdapter.fetchProvider(
                    providerId,
                    catalog.providers[providerId].lastPublishedAt,
                ),
            ),
        );
        const updates: FetchedEditorCatalogProvider[] = [];
        const errors = new Map<EditorCatalogProviderId, string>();

        refreshResults.forEach((result, index) => {
            const providerId = providerIds[index];
            if (result.status === 'fulfilled') {
                updates.push(result.value);
                return;
            }

            const message = getErrorMessage(result.reason);
            errors.set(providerId, message);
            logger.error(
                `Failed to refresh editor catalog provider ${providerId}`,
                result.reason,
            );
        });

        if (updates.length > 0) {
            const applyUpdates = (current: EditorCatalogFile) =>
                mergeProviderUpdates(current, updates, Date.now());
            catalog = catalogReadable
                ? await this.store.update(applyUpdates)
                : await this.store.replace(applyUpdates(catalog));
        }

        return { catalog, errors };
    }

    /**
     * Builds the catalog result returned to callers.
     *
     * @param catalog - The stored catalog data.
     * @param query - Optional release filters.
     * @param refreshErrors - Errors from the latest provider refresh.
     * @returns Matching releases and provider status.
     */
    private createResult(
        catalog: EditorCatalogFile,
        query?: EditorCatalogQuery,
        refreshErrors: Map<EditorCatalogProviderId, string> = new Map(),
    ): EditorCatalogResult {
        const releases = EDITOR_CATALOG_PROVIDER_IDS.flatMap(
            (providerId) => catalog.providers[providerId].releases,
        )
            .filter((release) => matchesQuery(release, query))
            .sort(compareEditorReleases);
        const providers: EditorCatalogProviderStatus[] =
            EDITOR_CATALOG_PROVIDER_IDS.map((providerId) => ({
                id: providerId,
                lastFetchedAt: catalog.providers[providerId].lastFetchedAt,
                isStale: this.isStale(catalog, providerId),
                ...(refreshErrors.has(providerId)
                    ? { refreshError: refreshErrors.get(providerId) }
                    : {}),
            }));

        return { releases, providers };
    }

    /**
     * Checks whether one provider should be refreshed.
     *
     * @param catalog - The stored catalog data.
     * @param providerId - The provider to check.
     * @returns True when the provider data is stale.
     */
    private isStale(
        catalog: EditorCatalogFile,
        providerId: EditorCatalogProviderId,
    ): boolean {
        const lastFetchedAt = catalog.providers[providerId].lastFetchedAt;
        return (
            lastFetchedAt === null ||
            lastFetchedAt + EDITOR_CATALOG_CACHE_TTL_MS < Date.now()
        );
    }
}

/**
 * Merges fetched provider data into the stored catalog.
 *
 * @param catalog - The current catalog.
 * @param updates - The provider updates to merge.
 * @param fetchedAt - The time when the updates were fetched.
 * @returns A catalog containing the provider updates.
 */
function mergeProviderUpdates(
    catalog: EditorCatalogFile,
    updates: FetchedEditorCatalogProvider[],
    fetchedAt: number,
): EditorCatalogFile {
    const providers = { ...catalog.providers };
    for (const update of updates) {
        const current = providers[update.providerId];
        const releasesById = new Map(
            [...current.releases, ...update.releases].map((release) => [
                release.id,
                release,
            ]),
        );
        providers[update.providerId] = {
            lastFetchedAt: fetchedAt,
            lastPublishedAt: update.lastPublishedAt,
            releases: [...releasesById.values()],
        };
    }

    return { ...catalog, providers };
}

/** Result of refreshing one or more catalog providers. */
type RefreshOutcome = {
    catalog: EditorCatalogFile;
    errors: Map<EditorCatalogProviderId, string>;
};

/** One active provider refresh shared by concurrent callers. */
type ActiveRefresh = {
    providerIds: Set<EditorCatalogProviderId>;
    promise: Promise<RefreshOutcome>;
};

/**
 * Checks whether a release matches all requested filters.
 *
 * @param release - The release to check.
 * @param query - The filters to apply.
 * @returns True when the release matches the query.
 */
function matchesQuery(
    release: EditorCatalogRelease,
    query?: EditorCatalogQuery,
): boolean {
    if (!query) {
        return true;
    }
    if (
        query.prerelease !== undefined &&
        release.prerelease !== query.prerelease
    ) {
        return false;
    }

    const search = query.search?.trim().toLowerCase();
    if (
        search &&
        ![release.version, release.tag, release.name].some((value) =>
            value.toLowerCase().includes(search),
        )
    ) {
        return false;
    }

    return release.variants.some(
        (variant) =>
            (!query.flavor || variant.flavor === query.flavor) &&
            variant.assets.some(
                (asset) =>
                    (!query.platform || asset.platform === query.platform) &&
                    (!query.architecture ||
                        asset.architecture === query.architecture),
            ),
    );
}

/**
 * Converts an unknown error value into a message.
 *
 * @param error - The error value to convert.
 * @returns A readable error message.
 */
function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
