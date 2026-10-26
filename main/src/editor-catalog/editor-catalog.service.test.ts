import type {
    EditorCatalogProviderId,
    EditorCatalogRelease,
} from '@shared/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyEditorCatalog } from './editor-catalog.schema.js';
import { EditorCatalogService } from './editor-catalog.service.js';
import type { EditorCatalogStore } from './editor-catalog.store.js';
import type {
    EditorCatalogFile,
    FetchedEditorCatalogProvider,
} from './editor-catalog.types.js';
import type { GithubEditorCatalogAdapter } from './github-editor-catalog.adapter.js';

vi.mock('@mariodebono/di', () => ({ Injectable: () => () => undefined }));
vi.mock('@mariodebono/di-config', () => ({ ConfigService: class {} }));
vi.mock('./editor-catalog.store.js', () => ({ EditorCatalogStore: class {} }));
vi.mock('./github-editor-catalog.adapter.js', () => ({
    GithubEditorCatalogAdapter: class {},
}));
vi.mock('./editor-catalog.schema.js', () => ({
    compareEditorReleases: vi.fn(() => 0),
    createEmptyEditorCatalog: () => ({
        schemaVersion: 1,
        providers: Object.fromEntries(
            ['official-stable', 'official-prerelease'].map((id) => [
                id,
                {
                    integrityMetadataRefreshed: false,
                    templateMetadataRefreshed: false,
                    lastFetchedAt: null,
                    lastPublishedAt: null,
                    releases: [],
                },
            ]),
        ),
    }),
}));

vi.mock('electron-log', () => ({
    default: {
        error: vi.fn(),
    },
}));

describe('EditorCatalogService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('rebuildCatalog', () => {
        it('fully fetches both providers and replaces obsolete cached releases once', async () => {
            const catalog = createCatalogWithRelease(
                createRelease('official-stable', '4.4-stable'),
            );
            const { service, githubAdapter, store } = createService(catalog);

            await service.rebuildCatalog();

            expect(githubAdapter.fetchProvider).toHaveBeenCalledTimes(2);
            expect(githubAdapter.fetchProvider).toHaveBeenCalledWith(
                'official-stable',
                null,
            );
            expect(githubAdapter.fetchProvider).toHaveBeenCalledWith(
                'official-prerelease',
                null,
            );
            expect(store.update).not.toHaveBeenCalled();
            expect(store.replace).toHaveBeenCalledOnce();
            const saved = await store.read();
            expect(
                saved.providers['official-stable'].releases.map(
                    ({ version }) => version,
                ),
            ).toEqual(['4.5-stable']);
            for (const provider of Object.values(saved.providers)) {
                expect(provider).toMatchObject({
                    lastFetchedAt: Date.now(),
                    integrityMetadataRefreshed: true,
                    templateMetadataRefreshed: true,
                });
            }
        });

        it.each([
            '403; rate limited',
            '429; too many requests',
            'network failure',
            'invalid release response',
        ])(
            'keeps the entire cache when one provider fails with %s',
            async (message) => {
                const catalog = createCatalogWithRelease(
                    createRelease('official-stable', '4.4-stable'),
                );
                const { service, githubAdapter, store } =
                    createService(catalog);
                githubAdapter.fetchProvider.mockRejectedValueOnce(
                    new Error(message),
                );

                await expect(service.rebuildCatalog()).rejects.toThrow(message);

                expect(store.replace).not.toHaveBeenCalled();
                expect(store.update).not.toHaveBeenCalled();
                expect(await store.read()).toEqual(catalog);
            },
        );

        it('rejects unexpectedly empty results without replacing the cache', async () => {
            const catalog = createCatalogWithRelease(
                createRelease('official-stable', '4.4-stable'),
            );
            const { service, githubAdapter, store } = createService(catalog);
            githubAdapter.fetchProvider.mockResolvedValueOnce({
                providerId: 'official-stable',
                lastPublishedAt: null,
                releases: [],
            });

            await expect(service.rebuildCatalog()).rejects.toThrow(
                'no supported releases',
            );

            expect(store.replace).not.toHaveBeenCalled();
            expect(await store.read()).toEqual(catalog);
        });

        it('keeps cached data after a failed write and allows a later retry', async () => {
            const catalog = createCatalogWithRelease(
                createRelease('official-stable', '4.4-stable'),
            );
            const { service, store } = createService(catalog);
            store.replace.mockRejectedValueOnce(new Error('write failed'));

            await expect(service.rebuildCatalog()).rejects.toThrow(
                'write failed',
            );
            expect(await store.read()).toEqual(catalog);
            await service.rebuildCatalog();
            expect(store.replace).toHaveBeenCalledTimes(2);
            expect(
                (await store.read()).providers['official-stable'].releases[0]
                    .version,
            ).toBe('4.5-stable');
        });

        it('shares an active rebuild with repeated rebuilds and normal refreshes', async () => {
            const catalog = createCatalogWithRelease(
                createRelease('official-stable', '4.4-stable'),
            );
            const { service, githubAdapter, store } = createService(catalog);
            let finish!: (value: FetchedEditorCatalogProvider) => void;
            githubAdapter.fetchProvider.mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        finish = resolve;
                    }),
            );
            const first = service.rebuildCatalog();
            const second = service.rebuildCatalog();
            const refresh = service.refreshCatalog();
            expect(githubAdapter.fetchProvider).toHaveBeenCalledTimes(2);
            expect(store.replace).not.toHaveBeenCalled();
            expect(await store.read()).toEqual(catalog);
            finish({
                providerId: 'official-stable',
                lastPublishedAt: null,
                releases: [createRelease('official-stable', '4.5-stable')],
            });

            const [, , result] = await Promise.all([first, second, refresh]);

            expect(githubAdapter.fetchProvider).toHaveBeenCalledTimes(2);
            expect(store.replace).toHaveBeenCalledOnce();
            expect(result.releases).toHaveLength(2);
        });

        it('returns cached data to a normal refresh joining a failed rebuild', async () => {
            const cached = createRelease('official-stable', '4.4-stable');
            const catalog = createCatalogWithRelease(cached);
            const { service, githubAdapter, store } = createService(catalog);
            let fail!: (error: Error) => void;
            githubAdapter.fetchProvider.mockImplementationOnce(
                () =>
                    new Promise((_resolve, reject) => {
                        fail = reject;
                    }),
            );
            const rebuild = expect(service.rebuildCatalog()).rejects.toThrow(
                '429; rate limited',
            );
            const refresh = service.refreshCatalog();
            fail(new Error('429; rate limited'));

            await rebuild;
            const result = await refresh;

            expect(result.releases).toEqual([cached]);
            expect(
                result.providers.every(
                    ({ refreshError }) => refreshError === '429; rate limited',
                ),
            ).toBe(true);
            expect(githubAdapter.fetchProvider).toHaveBeenCalledTimes(2);
            expect(store.replace).not.toHaveBeenCalled();
            expect(await store.read()).toEqual(catalog);
        });

        it('waits for an earlier incremental refresh before replacing its result', async () => {
            const { service, githubAdapter, store } = createService(
                createEmptyEditorCatalog(),
            );
            let finish!: (value: FetchedEditorCatalogProvider) => void;
            githubAdapter.fetchProvider.mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        finish = resolve;
                    }),
            );
            const refresh = service.refreshCatalog();
            await vi.waitFor(() =>
                expect(githubAdapter.fetchProvider).toHaveBeenCalledTimes(2),
            );
            const rebuild = service.rebuildCatalog();
            expect(githubAdapter.fetchProvider).toHaveBeenCalledTimes(2);
            finish({
                providerId: 'official-stable',
                lastPublishedAt: null,
                releases: [createRelease('official-stable', '4.4-stable')],
            });

            await Promise.all([refresh, rebuild]);

            expect(githubAdapter.fetchProvider).toHaveBeenCalledTimes(4);
            expect(store.replace).toHaveBeenCalledOnce();
            expect(
                (await store.read()).providers['official-stable'].releases.map(
                    ({ version }) => version,
                ),
            ).toEqual(['4.5-stable']);
        });
    });

    it('queries a fresh catalog without fetching', async () => {
        const catalog = createCatalogWithRelease(
            createRelease('official-stable', '4.5-stable'),
        );
        const { service, githubAdapter } = createService(catalog);

        const result = await service.getCatalog({
            query: { search: '4.5', platform: 'win32' },
        });

        expect(result.releases).toHaveLength(1);
        expect(githubAdapter.fetchProvider).not.toHaveBeenCalled();
        await expect(
            service.getReleaseById('official-stable:4.5-stable'),
        ).resolves.toMatchObject({ version: '4.5-stable' });
    });

    it('never fetches providers while E2E fixtures are active', async () => {
        const catalog = createEmptyEditorCatalog();
        const { service, githubAdapter } = createService(catalog, true);

        await service.getCatalog();
        await service.refreshCatalog();
        await service.rebuildCatalog();

        expect(githubAdapter.fetchProvider).not.toHaveBeenCalled();
    });

    it('fully refreshes a fresh legacy cache without integrity metadata', async () => {
        const cached = createRelease('official-stable', '4.5-stable');
        delete cached.variants[0].assets[0].digest;
        const catalog = createCatalogWithRelease(cached);
        catalog.providers['official-stable'].integrityMetadataRefreshed = false;
        const { service, githubAdapter } = createService(catalog);

        await service.getCatalog();

        expect(githubAdapter.fetchProvider).toHaveBeenCalledWith(
            'official-stable',
            null,
        );

        await service.getCatalog();

        expect(githubAdapter.fetchProvider).toHaveBeenCalledOnce();
    });

    it('refreshes a legacy cache missing only template metadata once', async () => {
        const catalog = createCatalogWithRelease(
            createRelease('official-stable', '4.5-stable'),
        );
        catalog.providers['official-stable'].templateMetadataRefreshed = false;
        const { service, githubAdapter, store } = createService(catalog);
        const updated = createRelease('official-stable', '4.5-stable');
        updated.templateAssets = [
            {
                id: 'templates',
                name: 'Godot_v4.5-stable_export_templates.tpz',
                flavor: 'gdscript',
                downloadUrl: 'https://example.test/templates.tpz',
                sizeBytes: 123456,
            },
        ];
        githubAdapter.fetchProvider.mockResolvedValueOnce({
            providerId: 'official-stable',
            lastPublishedAt: updated.publishedAt,
            releases: [updated],
        });

        const result = await service.getCatalog();

        expect(result.releases[0].templateAssets).toEqual(
            updated.templateAssets,
        );
        expect(githubAdapter.fetchProvider).toHaveBeenCalledExactlyOnceWith(
            'official-stable',
            null,
        );
        expect((await store.read()).providers['official-stable']).toMatchObject(
            {
                integrityMetadataRefreshed: true,
                templateMetadataRefreshed: true,
            },
        );
        await service.getCatalog();
        expect(githubAdapter.fetchProvider).toHaveBeenCalledOnce();
    });

    it('automatically refreshes only stale providers', async () => {
        const cached = createRelease('official-stable', '4.5-stable');
        const catalog = createCatalogWithRelease(cached);
        catalog.providers['official-stable'].lastFetchedAt = null;
        const { service, githubAdapter } = createService(catalog);

        await service.getCatalog();

        expect(githubAdapter.fetchProvider).toHaveBeenCalledOnce();
        expect(githubAdapter.fetchProvider).toHaveBeenCalledWith(
            'official-stable',
            cached.publishedAt,
        );
    });

    it('explicitly refreshes every provider', async () => {
        const catalog = createCatalogWithRelease(
            createRelease('official-stable', '4.5-stable'),
        );
        const { service, githubAdapter } = createService(catalog);

        await service.refreshCatalog();

        expect(githubAdapter.fetchProvider).toHaveBeenCalledTimes(2);
        expect(githubAdapter.fetchProvider).toHaveBeenCalledWith(
            'official-stable',
            catalog.providers['official-stable'].lastPublishedAt,
        );
        expect(githubAdapter.fetchProvider).toHaveBeenCalledWith(
            'official-prerelease',
            catalog.providers['official-prerelease'].lastPublishedAt,
        );
    });

    it('fetches providers missing from an active automatic refresh', async () => {
        const cached = createRelease('official-stable', '4.5-stable');
        const catalog = createCatalogWithRelease(cached);
        catalog.providers['official-stable'].lastFetchedAt = null;
        const { service, githubAdapter } = createService(catalog);
        let resolveStableRefresh: (
            value: FetchedEditorCatalogProvider,
        ) => void = () => undefined;
        const stableRefresh = new Promise<FetchedEditorCatalogProvider>(
            (resolve) => {
                resolveStableRefresh = resolve;
            },
        );
        githubAdapter.fetchProvider.mockImplementation(async (providerId) => {
            if (providerId === 'official-stable') {
                return stableRefresh;
            }
            return {
                providerId,
                lastPublishedAt: '2026-01-02T00:00:00.000Z',
                releases: [createRelease(providerId, '4.6-beta1')],
            };
        });

        const automaticRefresh = service.getCatalog();
        await vi.waitFor(() =>
            expect(githubAdapter.fetchProvider).toHaveBeenCalledOnce(),
        );
        const explicitRefresh = service.refreshCatalog();
        resolveStableRefresh({
            providerId: 'official-stable',
            lastPublishedAt: '2026-01-02T00:00:00.000Z',
            releases: [createRelease('official-stable', '4.5-stable')],
        });

        const [, explicitResult] = await Promise.all([
            automaticRefresh,
            explicitRefresh,
        ]);

        expect(githubAdapter.fetchProvider).toHaveBeenCalledTimes(2);
        expect(githubAdapter.fetchProvider).toHaveBeenNthCalledWith(
            2,
            'official-prerelease',
            null,
        );
        expect(explicitResult.releases).toHaveLength(2);
    });

    it('deduplicates concurrent stale refreshes', async () => {
        const catalog = createEmptyEditorCatalog();
        const { service, githubAdapter } = createService(catalog);

        const [first, second] = await Promise.all([
            service.getCatalog(),
            service.getCatalog({ query: { prerelease: false } }),
        ]);

        expect(githubAdapter.fetchProvider).toHaveBeenCalledTimes(2);
        expect(first.releases).toHaveLength(2);
        expect(second.releases).toHaveLength(1);
    });

    it('keeps cached data and reports a provider refresh error', async () => {
        const cached = createRelease('official-prerelease', '4.6-beta1');
        const catalog = createCatalogWithRelease(cached);
        catalog.providers['official-stable'].lastFetchedAt = null;
        catalog.providers['official-prerelease'].lastFetchedAt = null;
        const { service, githubAdapter } = createService(catalog);
        githubAdapter.fetchProvider.mockImplementation(async (providerId) => {
            if (providerId === 'official-prerelease') {
                throw new Error('builds unavailable');
            }
            return {
                providerId,
                lastPublishedAt: '2026-01-02T00:00:00.000Z',
                releases: [createRelease(providerId, '4.5-stable')],
            };
        });

        const result = await service.refreshCatalog();

        expect(result.releases).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: cached.id }),
                expect.objectContaining({
                    id: 'official-stable:4.5-stable',
                }),
            ]),
        );
        expect(
            result.providers.find(({ id }) => id === 'official-prerelease')
                ?.refreshError,
        ).toBe('builds unavailable');
    });

    it('updates the fetch time when no new releases are found', async () => {
        const cached = createRelease('official-stable', '4.5-stable');
        const catalog = createCatalogWithRelease(cached);
        catalog.providers['official-stable'].lastFetchedAt = 0;
        const { service, githubAdapter } = createService(catalog);
        githubAdapter.fetchProvider.mockResolvedValue({
            providerId: 'official-stable',
            lastPublishedAt: cached.publishedAt,
            releases: [],
        });

        const result = await service.getCatalog();

        expect(result.releases).toContainEqual(cached);
        expect(
            result.providers.find(({ id }) => id === 'official-stable')
                ?.lastFetchedAt,
        ).toBe(Date.now());
    });

    it('replaces a cached partial release once and retains releases outside the fetched pages', async () => {
        const cached = createRelease('official-stable', '4.5-stable');
        const older = createRelease('official-stable', '4.4-stable');
        const newer = createRelease('official-stable', '4.6-stable');
        newer.publishedAt = '2026-01-02T00:00:00.000Z';
        const catalog = createCatalogWithRelease(newer);
        catalog.providers['official-stable'].releases.push(cached, older);
        catalog.providers['official-stable'].lastFetchedAt = 0;
        const completed = structuredClone(cached);
        completed.variants.push({
            id: `${cached.id}:dotnet`,
            flavor: 'dotnet',
            assets: [
                {
                    ...cached.variants[0].assets[0],
                    id: `${cached.id}:dotnet:linux:x64`,
                    platform: 'linux',
                    digest: `sha256:${'b'.repeat(64)}`,
                    checksumManifestUrl: 'https://example.com/SHA512-SUMS.txt',
                },
            ],
        });
        const { service, githubAdapter, store } = createService(catalog);
        githubAdapter.fetchProvider.mockResolvedValue({
            providerId: 'official-stable',
            lastPublishedAt: newer.publishedAt,
            releases: [newer, completed],
        });

        const result = await service.getCatalog();

        expect(result.releases).toHaveLength(3);
        expect(result.releases.find(({ id }) => id === cached.id)).toEqual(
            completed,
        );
        expect(result.releases).toContainEqual(older);
        expect(result.releases).toContainEqual(newer);
        expect(
            (await store.read()).providers['official-stable'].lastPublishedAt,
        ).toBe(newer.publishedAt);
        expect(githubAdapter.fetchProvider).toHaveBeenCalledExactlyOnceWith(
            'official-stable',
            newer.publishedAt,
        );
    });

    it('rebuilds a malformed catalog during explicit refresh', async () => {
        const { service, store } = createService(createEmptyEditorCatalog());
        store.read.mockRejectedValue(new Error('invalid catalog'));

        const result = await service.refreshCatalog();

        expect(store.replace).toHaveBeenCalledOnce();
        expect(result.releases).toHaveLength(2);
    });
});

/**
 * Creates the catalogue service with in-memory collaborators.
 *
 * @param initialCatalog - Initial persisted catalogue state.
 * @param e2eFixtures - Whether development fixture isolation is active.
 * @returns The service and its inspectable collaborators.
 */
function createService(initialCatalog: EditorCatalogFile, e2eFixtures = false) {
    let catalog = structuredClone(initialCatalog);
    const store = {
        read: vi.fn(async () => structuredClone(catalog)),
        update: vi.fn(
            async (
                mutator: (value: EditorCatalogFile) => EditorCatalogFile,
            ) => {
                catalog = mutator(structuredClone(catalog));
                return structuredClone(catalog);
            },
        ),
        replace: vi.fn(async (value: EditorCatalogFile) => {
            catalog = structuredClone(value);
            return structuredClone(catalog);
        }),
    };
    const githubAdapter = {
        fetchProvider: vi.fn(
            async (
                providerId: EditorCatalogProviderId,
            ): Promise<FetchedEditorCatalogProvider> => ({
                providerId,
                lastPublishedAt: '2026-01-02T00:00:00.000Z',
                releases: [
                    createRelease(
                        providerId,
                        providerId === 'official-stable'
                            ? '4.5-stable'
                            : '4.6-beta1',
                    ),
                ],
            }),
        ),
    };
    const configService = {
        get: vi.fn(() => e2eFixtures),
    };

    return {
        service: new EditorCatalogService(
            store as unknown as EditorCatalogStore,
            githubAdapter as unknown as GithubEditorCatalogAdapter,
            configService as never,
        ),
        store,
        githubAdapter,
    };
}

function createCatalogWithRelease(
    release: EditorCatalogRelease,
): EditorCatalogFile {
    const catalog = createEmptyEditorCatalog();
    catalog.providers[release.providerId] = {
        integrityMetadataRefreshed: true,
        templateMetadataRefreshed: true,
        lastFetchedAt: Date.now(),
        lastPublishedAt: release.publishedAt,
        releases: [release],
    };
    for (const provider of Object.values(catalog.providers)) {
        provider.integrityMetadataRefreshed = true;
        provider.templateMetadataRefreshed = true;
        provider.lastFetchedAt ??= Date.now();
    }
    return catalog;
}

function createRelease(
    providerId: EditorCatalogProviderId,
    version: string,
): EditorCatalogRelease {
    const prerelease = providerId === 'official-prerelease';
    const flavor = prerelease ? 'dotnet' : 'gdscript';
    return {
        id: `${providerId}:${version}`,
        sourceReleaseId: version,
        providerId,
        tag: version,
        version,
        baseVersion: version.slice(0, 3),
        name: `Godot ${version}`,
        publishedAt: '2026-01-01T00:00:00.000Z',
        prerelease,
        versionParts: {
            major: 4,
            minor: prerelease ? 6 : 5,
            patch: 0,
            channel: prerelease ? 'beta' : 'stable',
            iteration: prerelease ? 1 : 0,
        },
        variants: [
            {
                id: `${providerId}:${version}:${flavor}`,
                flavor,
                assets: [
                    {
                        id: `${providerId}:${version}:${flavor}:win32:x64`,
                        name: `${version}.zip`,
                        downloadUrl: 'https://example.com/editor.zip',
                        digest: `sha256:${'a'.repeat(64)}`,
                        platform: 'win32',
                        architecture: 'x64',
                    },
                ],
            },
        ],
    };
}
