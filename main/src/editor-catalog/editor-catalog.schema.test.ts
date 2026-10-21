import type {
    EditorCatalogAsset,
    EditorCatalogRelease,
} from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    createEmptyEditorCatalog,
    normalizeEditorCatalog,
} from './editor-catalog.schema.js';

describe('editor catalog schema', () => {
    it.each(['gdscript', 'dotnet'] as const)(
        'repairs cached macOS CPU labels offline for %s without removing universal or other platform assets',
        (flavor) => {
            const cache = createEmptyEditorCatalog();
            const release: EditorCatalogRelease = {
                id: 'official-prerelease:4.8-beta1',
                providerId: 'official-prerelease',
                sourceReleaseId: '48',
                tag: '4.8-beta1',
                version: '4.8-beta1',
                baseVersion: '4.8',
                name: '4.8 beta 1',
                publishedAt: null,
                prerelease: true,
                versionParts: {
                    major: 4,
                    minor: 8,
                    patch: 0,
                    channel: 'beta',
                    iteration: 1,
                },
                variants: [
                    {
                        id: `variant:${flavor}`,
                        flavor,
                        assets: ['arm64', 'x86_64', 'universal', 'legacy']
                            .flatMap<EditorCatalogAsset>((suffix) =>
                                (['x64', 'arm64'] as const).map(
                                    (architecture) => ({
                                        id: `${suffix}:${architecture}`,
                                        name:
                                            suffix === 'legacy'
                                                ? 'Godot_v3.6-stable_osx.zip'
                                                : `Godot_v4.8-beta1_macos.${suffix}.zip`,
                                        downloadUrl: `https://example.com/${suffix}.zip`,
                                        platform: 'darwin' as const,
                                        architecture,
                                    }),
                                ),
                            )
                            .concat([
                                {
                                    id: 'linux:x64',
                                    name: 'Godot_v4.8-beta1_linux.x86_64.zip',
                                    downloadUrl:
                                        'https://example.com/linux.zip',
                                    platform: 'linux',
                                    architecture: 'x64',
                                },
                            ]),
                    },
                ],
            };
            cache.providers['official-prerelease'].releases = [release];

            const normalized = normalizeEditorCatalog(cache);
            const assets =
                normalized.providers['official-prerelease'].releases[0]
                    .variants[0].assets;
            expect(assets.map(({ id }) => id)).toEqual([
                'arm64:arm64',
                'legacy:arm64',
                'legacy:x64',
                'linux:x64',
                'universal:arm64',
                'universal:x64',
                'x86_64:x64',
            ]);
            expect(normalizeEditorCatalog(normalized)).toEqual(normalized);
        },
    );

    it('creates both official provider states', () => {
        expect(createEmptyEditorCatalog()).toEqual({
            schemaVersion: 1,
            providers: {
                'official-stable': {
                    integrityMetadataRefreshed: false,
                    templateMetadataRefreshed: false,
                    lastFetchedAt: null,
                    lastPublishedAt: null,
                    releases: [],
                },
                'official-prerelease': {
                    integrityMetadataRefreshed: false,
                    templateMetadataRefreshed: false,
                    lastFetchedAt: null,
                    lastPublishedAt: null,
                    releases: [],
                },
            },
        });
    });

    it('rejects an unsupported schema version', () => {
        expect(() =>
            normalizeEditorCatalog({
                ...createEmptyEditorCatalog(),
                schemaVersion: 2,
            }),
        ).toThrow();
    });
});
