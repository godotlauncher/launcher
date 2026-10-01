import { afterEach, describe, expect, it, vi } from 'vitest';
import { EDITOR_CATALOG_PROVIDER_IDS } from './editor-catalog.constants.js';
import { GithubEditorCatalogAdapter } from './github-editor-catalog.adapter.js';
import { githubReleasePageSchema } from './github-editor-catalog.schema.js';

vi.mock('@mariodebono/di', () => ({ Injectable: () => () => undefined }));
vi.mock('./github-editor-catalog.schema.js', () => ({
    githubReleasePageSchema: { parse: vi.fn((value) => value) },
}));

vi.mock('electron-log', () => ({
    default: {
        debug: vi.fn(),
    },
}));

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('GithubEditorCatalogAdapter', () => {
    it('stops fetching when response validation fails', async () => {
        const fetchMock = createPagedFetchMock([
            createGithubReleasePage(1, 100),
        ]);
        vi.stubGlobal('fetch', fetchMock);
        vi.mocked(githubReleasePageSchema.parse).mockImplementationOnce(() => {
            throw new Error('invalid release response');
        });

        await expect(
            new GithubEditorCatalogAdapter().fetchProvider(
                'official-stable',
                null,
            ),
        ).rejects.toThrow('invalid release response');
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('keeps template metadata from the GitHub response through catalogue mapping', async () => {
        const release = createGithubRelease(4);
        const digest = `sha256:${'a'.repeat(64)}`;
        const template = {
            id: 42,
            name: 'Godot_v4.4-stable_mono_export_templates.tpz',
            browser_download_url: 'https://example.com/templates.tpz',
            size: 123456,
            digest,
        };
        const response = { ...release, assets: [...release.assets, template] };
        vi.stubGlobal('fetch', createPagedFetchMock([[response]]));

        const result = await new GithubEditorCatalogAdapter().fetchProvider(
            'official-stable',
            null,
        );

        expect(result.releases[0].templateAssets).toEqual([
            expect.objectContaining({
                id: 'official-stable:4.4-stable:templates:42',
                name: template.name,
                flavor: 'dotnet',
                downloadUrl: template.browser_download_url,
                sizeBytes: template.size,
                digest,
            }),
        ]);
    });

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

        expect(result.releases).toHaveLength(100);
        expect(result.releases[0].tag).toBe('4.1-stable');
        expect(result.releases[99].tag).toBe('4.100-stable');
        expect(result.lastPublishedAt).toBe(publishedAfter);
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('remaps the complete boundary page, including equal and older publication dates', async () => {
        const publishedAfter = createPublishedAt(100);
        const page = [
            createGithubRelease(102),
            createGithubRelease(101),
            createGithubRelease(100),
            ...createGithubReleasePage(1, 97),
        ];
        const fetchMock = createPagedFetchMock([page, []]);
        vi.stubGlobal('fetch', fetchMock);

        const result = await new GithubEditorCatalogAdapter().fetchProvider(
            'official-stable',
            publishedAfter,
        );

        expect(result.releases.map(({ tag }) => tag)).toEqual(
            page.map(({ tag_name }) => tag_name),
        );
        expect(result.lastPublishedAt).toBe(createPublishedAt(102));
        expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('backfills 250 newer releases across three pages before stopping at the cached boundary', async () => {
        const publishedAfter = createPublishedAt(100);
        const firstPage = createGithubReleasePage(251, 100).reverse();
        const secondPage = createGithubReleasePage(151, 100).reverse();
        const boundaryPage = createGithubReleasePage(51, 100).reverse();
        const fetchMock = createPagedFetchMock([
            firstPage,
            secondPage,
            boundaryPage,
            [],
        ]);
        vi.stubGlobal('fetch', fetchMock);

        const result = await new GithubEditorCatalogAdapter().fetchProvider(
            'official-stable',
            publishedAfter,
        );

        expect(result.releases.map(({ tag }) => tag)).toEqual(
            [...firstPage, ...secondPage, ...boundaryPage].map(
                ({ tag_name }) => tag_name,
            ),
        );
        expect(result.lastPublishedAt).toBe(createPublishedAt(350));
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(
            fetchMock.mock.calls.map(([url]) => ({
                page: url.searchParams.get('page'),
                perPage: url.searchParams.get('per_page'),
            })),
        ).toEqual([
            { page: '1', perPage: '100' },
            { page: '2', perPage: '100' },
            { page: '3', perPage: '100' },
        ]);
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

        expect(result.releases).toHaveLength(100);
        expect(result.releases[0].publishedAt).toBeNull();
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

        expect(result.releases).toHaveLength(10000);
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

    it.each(EDITOR_CATALOG_PROVIDER_IDS)(
        'picks up later desktop uploads in %s after a newer release is cached',
        async (providerId) => {
            const newer = createGithubRelease(5);
            const delayed = createGithubRelease(4);
            const unsupported = {
                ...delayed,
                assets: [
                    {
                        id: 40,
                        name: 'Godot_v4.4-stable_export_templates.tpz',
                        browser_download_url:
                            'https://example.com/templates.tpz',
                    },
                    {
                        id: 41,
                        name: 'Godot_v4.4-stable_web_editor.zip',
                        browser_download_url: 'https://example.com/web.zip',
                    },
                ],
            };
            const fetchMock = createPagedFetchMock([
                [newer, unsupported],
                [
                    newer,
                    {
                        ...delayed,
                        assets: [...unsupported.assets, ...delayed.assets],
                    },
                ],
            ]);
            vi.stubGlobal('fetch', fetchMock);
            const adapter = new GithubEditorCatalogAdapter();

            const first = await adapter.fetchProvider(
                providerId,
                newer.published_at,
            );
            const second = await adapter.fetchProvider(
                providerId,
                first.lastPublishedAt,
            );

            expect(first.releases.map(({ tag }) => tag)).toEqual([
                newer.tag_name,
            ]);
            expect(second.releases.map(({ tag }) => tag)).toEqual([
                newer.tag_name,
                delayed.tag_name,
            ]);
            expect(second.releases[1].variants[0].assets).toHaveLength(1);
            expect(second.lastPublishedAt).toBe(newer.published_at);
            expect(fetchMock).toHaveBeenCalledTimes(2);
            const repository =
                providerId === 'official-stable' ? 'godot' : 'godot-builds';
            expect(String(fetchMock.mock.calls[0][0])).toContain(
                `/godotengine/${repository}/releases?page=1&per_page=100`,
            );
        },
    );

    it('remaps a partial release with later platform and .NET assets and integrity metadata', async () => {
        const release = createGithubRelease(4);
        const digest = `sha256:${'b'.repeat(64)}`;
        const checksumManifestUrl = 'https://example.com/SHA512-SUMS.txt';
        const uploadedAssets = [
            'Godot_v4.4-stable_macos.universal.zip',
            'Godot_v4.4-stable_linux.x86_64.zip',
            'Godot_v4.4-stable_mono_win64.zip',
            'Godot_v4.4-stable_mono_macos.universal.zip',
            'Godot_v4.4-stable_mono_linux.x86_64.zip',
        ].map((name, index) => ({
            id: 40 + index,
            name,
            browser_download_url: `https://example.com/${name}`,
            digest,
        }));
        const completed = {
            ...release,
            assets: [
                ...release.assets,
                ...uploadedAssets,
                {
                    id: 50,
                    name: 'SHA512-SUMS.txt',
                    browser_download_url: checksumManifestUrl,
                },
            ],
        };
        vi.stubGlobal('fetch', createPagedFetchMock([[release], [completed]]));
        const adapter = new GithubEditorCatalogAdapter();

        const first = await adapter.fetchProvider('official-stable', null);
        const second = await adapter.fetchProvider(
            'official-stable',
            first.lastPublishedAt,
        );

        expect(first.releases[0].variants).toHaveLength(1);
        expect(first.releases[0].variants[0].assets).toHaveLength(1);
        expect(second.releases).toHaveLength(1);
        expect(second.releases[0].id).toBe(first.releases[0].id);
        expect(second.releases[0].variants.map(({ flavor }) => flavor)).toEqual(
            ['gdscript', 'dotnet'],
        );
        for (const variant of second.releases[0].variants) {
            expect(variant.assets.map(({ platform }) => platform)).toEqual([
                'win32',
                'darwin',
                'darwin',
                'linux',
            ]);
            expect(variant.assets).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        platform: 'darwin',
                        digest,
                        checksumManifestUrl,
                    }),
                    expect.objectContaining({
                        platform: 'linux',
                        digest,
                        checksumManifestUrl,
                    }),
                ]),
            );
        }
        expect(second.lastPublishedAt).toBe(first.lastPublishedAt);
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
    return vi.fn(async (_url: URL) => Response.json(pages[pageIndex++] ?? []));
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
