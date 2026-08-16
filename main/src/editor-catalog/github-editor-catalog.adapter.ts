import { Injectable } from '@mariodebono/di';
import type { EditorCatalogProviderId } from '@shared/contracts';
import logger from 'electron-log';
import { z } from 'zod';
import {
    EDITOR_CATALOG_PAGE_LIMIT,
    EDITOR_CATALOG_PAGE_SIZE,
    EDITOR_CATALOG_PROVIDERS,
} from './editor-catalog.constants.js';
import type {
    FetchedEditorCatalogProvider,
    GithubEditorRelease,
} from './editor-catalog.types.js';
import { mapGithubEditorRelease } from './github-editor-release.mapper.js';

const GithubReleaseSchema = z.object({
    id: z.number().int(),
    name: z.string().nullable(),
    tag_name: z.string(),
    published_at: z.string().nullable(),
    draft: z.boolean(),
    prerelease: z.boolean(),
    assets: z.array(
        z.object({
            id: z.number().int(),
            name: z.string(),
            browser_download_url: z.url(),
            digest: z.string().nullable().optional(),
        }),
    ),
});

/** Fetches editor releases from the configured GitHub providers. */
@Injectable()
export class GithubEditorCatalogAdapter {
    /**
     * Fetches releases published after the cached provider data.
     *
     * @param providerId - The provider to fetch.
     * @param publishedAfter - The newest stored publication time.
     * @returns New releases and the latest publication time.
     */
    async fetchProvider(
        providerId: EditorCatalogProviderId,
        publishedAfter: string | null,
    ): Promise<FetchedEditorCatalogProvider> {
        const provider = EDITOR_CATALOG_PROVIDERS[providerId];
        const releases: FetchedEditorCatalogProvider['releases'] = [];
        const afterTime = publishedAfter
            ? new Date(publishedAfter).getTime()
            : 0;
        let latestPublishedAt = publishedAfter;

        for (let page = 1; page <= EDITOR_CATALOG_PAGE_LIMIT; page += 1) {
            const url = new URL(
                `https://api.github.com/repos/${provider.owner}/${provider.repository}/releases`,
            );
            url.searchParams.set('page', String(page));
            url.searchParams.set('per_page', String(EDITOR_CATALOG_PAGE_SIZE));
            logger.debug(`Fetching editor catalog from ${url.toString()}`);

            const response = await fetch(url);
            if (!response.ok) {
                const message = await response.text().catch(() => '');
                throw new Error(
                    `Failed to fetch editor catalog: ${response.status}${message ? `; ${message}` : ''}`,
                );
            }

            const pageReleases = z
                .array(GithubReleaseSchema)
                .parse(await response.json())
                .map(toGithubEditorRelease);
            const reachedBoundary =
                publishedAfter !== null &&
                pageReleases.some((release) => {
                    if (!release.publishedAt) {
                        return false;
                    }
                    return new Date(release.publishedAt).getTime() <= afterTime;
                });
            const mappedPage = pageReleases
                .filter((release) => {
                    if (!release.publishedAt) {
                        return false;
                    }
                    return new Date(release.publishedAt).getTime() > afterTime;
                })
                .map((release) =>
                    mapGithubEditorRelease(
                        providerId,
                        provider.prerelease,
                        release,
                    ),
                )
                .filter((release) => release !== null);
            releases.push(...mappedPage);
            latestPublishedAt = mappedPage.reduce<string | null>(
                (latest, release) => laterDate(latest, release.publishedAt),
                latestPublishedAt,
            );

            if (
                pageReleases.length < EDITOR_CATALOG_PAGE_SIZE ||
                reachedBoundary
            ) {
                break;
            }
        }

        return {
            providerId,
            lastPublishedAt: latestPublishedAt,
            releases,
        };
    }
}

/**
 * Converts a checked GitHub API release into the internal input shape.
 *
 * @param value - The checked GitHub API release.
 * @returns The release fields used by the catalog mapper.
 */
function toGithubEditorRelease(
    value: z.infer<typeof GithubReleaseSchema>,
): GithubEditorRelease {
    return {
        id: value.id,
        name: value.name,
        tagName: value.tag_name,
        publishedAt: value.published_at,
        draft: value.draft,
        prerelease: value.prerelease,
        assets: value.assets.map((asset) => ({
            id: asset.id,
            name: asset.name,
            browserDownloadUrl: asset.browser_download_url,
            digest: asset.digest ?? null,
        })),
    };
}

/**
 * Chooses the later of two publication times.
 *
 * @param current - The current latest publication time.
 * @param candidate - The publication time to compare.
 * @returns The later time in ISO format.
 */
function laterDate(
    current: string | null,
    candidate: string | null,
): string | null {
    if (!candidate) {
        return current;
    }
    if (
        !current ||
        new Date(candidate).getTime() > new Date(current).getTime()
    ) {
        return new Date(candidate).toISOString();
    }
    return current;
}
