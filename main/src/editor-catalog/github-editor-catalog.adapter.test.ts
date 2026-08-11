import { afterEach, describe, expect, it, vi } from 'vitest';
import { GithubEditorCatalogAdapter } from './github-editor-catalog.adapter.js';

vi.mock('electron-log', () => ({
    default: {
        debug: vi.fn(),
    },
}));

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('GithubEditorCatalogAdapter', () => {
    it('fetches every page during an empty-cache bootstrap', async () => {
        const fetchMock = createPagedFetchMock([
            createGithubReleasePage(1, 100),
            createGithubReleasePage(101, 1),
        ]);
        vi.stubGlobal('fetch', fetchMock);

        const result = await new GithubEditorCatalogAdapter().fetchProvider(
            'official-stable',
            null,
        );

        expect(result.releases).toHaveLength(101);
        expect(result.lastPublishedAt).toBe(createPublishedAt(101));
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(String(fetchMock.mock.calls[0][0])).toContain(
            '/godotengine/godot/releases',
        );
        expect(String(fetchMock.mock.calls[1][0])).toContain('page=2');
    });

    it('stops on the first page when it reaches the cached boundary', async () => {
        const publishedAfter = createPublishedAt(101);
        const fetchMock = createPagedFetchMock([
            createGithubReleasePage(1, 100),
            [],
        ]);
        vi.stubGlobal('fetch', fetchMock);

        const result = await new GithubEditorCatalogAdapter().fetchProvider(
            'official-stable',
            publishedAfter,
        );

        expect(result.releases).toEqual([]);
        expect(result.lastPublishedAt).toBe(publishedAfter);
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('keeps newer releases from the complete boundary page', async () => {
        const publishedAfter = createPublishedAt(100);
        const page = [
            createGithubRelease(102),
            createGithubRelease(101),
            createGithubRelease(100),
            ...createGithubReleasePage(1, 97, null),
        ];
        const fetchMock = createPagedFetchMock([page, []]);
        vi.stubGlobal('fetch', fetchMock);

        const result = await new GithubEditorCatalogAdapter().fetchProvider(
            'official-stable',
            publishedAfter,
        );

        expect(result.releases.map(({ tag }) => tag)).toEqual([
            '4.102-stable',
            '4.101-stable',
        ]);
        expect(result.lastPublishedAt).toBe(createPublishedAt(102));
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('continues until a later page reaches the cached boundary', async () => {
        const publishedAfter = createPublishedAt(100);
        const firstPage = createGithubReleasePage(103, 100);
        const secondPage = [
            createGithubRelease(102),
            createGithubRelease(101),
            createGithubRelease(100),
            ...createGithubReleasePage(1, 97, null),
        ];
        const fetchMock = createPagedFetchMock([firstPage, secondPage, []]);
        vi.stubGlobal('fetch', fetchMock);

        const result = await new GithubEditorCatalogAdapter().fetchProvider(
            'official-stable',
            publishedAfter,
        );

        expect(result.releases).toHaveLength(102);
        expect(result.lastPublishedAt).toBe(createPublishedAt(202));
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not use null publication dates as a boundary', async () => {
        const publishedAfter = createPublishedAt(100);
        const fetchMock = createPagedFetchMock([
            createGithubReleasePage(1, 100, null),
            [],
        ]);
        vi.stubGlobal('fetch', fetchMock);

        const result = await new GithubEditorCatalogAdapter().fetchProvider(
            'official-stable',
            publishedAfter,
        );

        expect(result.releases).toEqual([]);
        expect(result.lastPublishedAt).toBe(publishedAfter);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('keeps the page limit as the final pagination guard', async () => {
        const fullPage = createGithubReleasePage(1, 100, null);
        const fetchMock = vi.fn(async () => Response.json(fullPage));
        vi.stubGlobal('fetch', fetchMock);

        const result = await new GithubEditorCatalogAdapter().fetchProvider(
            'official-stable',
            null,
        );

        expect(result.releases).toEqual([]);
        expect(result.lastPublishedAt).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(100);
    });

    it('throws a useful response error', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('rate limited', { status: 403 })),
        );

        await expect(
            new GithubEditorCatalogAdapter().fetchProvider(
                'official-stable',
                null,
            ),
        ).rejects.toThrow('Failed to fetch editor catalog: 403; rate limited');
    });
});

/** Raw GitHub release response used by adapter tests. */
type GithubReleaseResponse = ReturnType<typeof createGithubRelease>;

/**
 * Creates a fetch mock that returns one GitHub response page per call.
 *
 * @param pages - The response pages to return in order.
 * @returns A fetch mock for the configured pages.
 */
function createPagedFetchMock(pages: GithubReleaseResponse[][]) {
    let pageIndex = 0;
    return vi.fn(async () => Response.json(pages[pageIndex++] ?? []));
}

/**
 * Creates a page of GitHub release responses.
 *
 * @param startId - The first release ID and version component.
 * @param length - The number of releases to create.
 * @param publishedAt - Fixed publication time, or undefined to derive it from each ID.
 * @returns A page of GitHub release responses.
 */
function createGithubReleasePage(
    startId: number,
    length: number,
    publishedAt?: string | null,
): GithubReleaseResponse[] {
    return Array.from({ length }, (_, index) =>
        createGithubRelease(
            startId + index,
            publishedAt === undefined
                ? createPublishedAt(startId + index)
                : publishedAt,
        ),
    );
}

/**
 * Creates one valid GitHub release response.
 *
 * @param id - The release ID and version component.
 * @param publishedAt - The release publication time.
 * @returns A valid GitHub release response.
 */
function createGithubRelease(
    id: number,
    publishedAt: string | null = createPublishedAt(id),
) {
    const tag = `4.${id}-stable`;
    return {
        id,
        name: `Godot ${tag}`,
        tag_name: tag,
        published_at: publishedAt,
        draft: false,
        prerelease: false,
        assets: [
            {
                id,
                name: `Godot_v${tag}_win64.exe.zip`,
                browser_download_url: `https://example.com/${tag}.zip`,
            },
        ],
    };
}

/**
 * Creates a stable ISO publication time from a numeric offset.
 *
 * @param offset - The number of days after the test epoch.
 * @returns The derived ISO publication time.
 */
function createPublishedAt(offset: number): string {
    return new Date(Date.UTC(2020, 0, 1 + offset)).toISOString();
}
