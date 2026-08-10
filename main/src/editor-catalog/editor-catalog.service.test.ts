import type {
    EditorCatalogProviderId,
    EditorCatalogRelease,
} from '@shared/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyEditorCatalog } from './editor-catalog.schema.js';
import { EditorCatalogService } from './editor-catalog.service.js';
import type { EditorCatalogStore } from './editor-catalog.store.js';
import type { EditorCatalogFile } from './editor-catalog.types.js';
import type { GithubEditorCatalogAdapter } from './github-editor-catalog.adapter.js';

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

    it('rebuilds a malformed catalog during explicit refresh', async () => {
        const { service, store } = createService(createEmptyEditorCatalog());
        store.read.mockRejectedValue(new Error('invalid catalog'));

        const result = await service.refreshCatalog();

        expect(store.replace).toHaveBeenCalledOnce();
        expect(result.releases).toHaveLength(2);
    });
});

function createService(initialCatalog: EditorCatalogFile) {
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
        fetchProvider: vi.fn(async (providerId: EditorCatalogProviderId) => ({
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
        })),
    };

    return {
        service: new EditorCatalogService(
            store as unknown as EditorCatalogStore,
            githubAdapter as unknown as GithubEditorCatalogAdapter,
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
        lastFetchedAt: Date.now(),
        lastPublishedAt: release.publishedAt,
        releases: [release],
    };
    for (const provider of Object.values(catalog.providers)) {
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
                        platform: 'win32',
                        architecture: 'x64',
                    },
                ],
            },
        ],
    };
}
