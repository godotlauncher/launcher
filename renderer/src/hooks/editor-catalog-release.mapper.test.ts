import type {
    EditorCatalogProviderId,
    EditorCatalogRelease,
} from '@shared/contracts';
import { describe, expect, it } from 'vitest';
import {
    mapEditorCatalogRelease,
    mapEditorCatalogResult,
} from './editor-catalog-release.mapper.ts';

describe('editor catalog release mapper', () => {
    it('maps GDScript and .NET assets into the legacy install shape', () => {
        const mapped = mapEditorCatalogRelease(
            createRelease('official-stable', false),
        );

        expect(mapped).toMatchObject({
            tag: '4.5-stable',
            version: '4.5-stable',
            version_number: 4.5,
            prerelease: false,
        });
        expect(mapped.assets).toEqual([
            {
                name: 'godot-windows.zip',
                download_url: 'https://example.com/godot-windows.zip',
                digest: `sha256:${'a'.repeat(64)}`,
                checksum_manifest_url: 'https://example.com/SHA512-SUMS.txt',
                platform_tags: ['win32', 'x64'],
                mono: false,
            },
            {
                name: 'godot-dotnet-linux.zip',
                download_url: 'https://example.com/godot-dotnet-linux.zip',
                checksum_manifest_url: 'https://example.com/SHA512-SUMS.txt',
                platform_tags: ['linux', 'arm64'],
                mono: true,
            },
        ]);
    });

    it('deduplicates stable versions using the stable provider release', () => {
        const mapped = mapEditorCatalogResult({
            releases: [
                {
                    ...createRelease('official-prerelease', false),
                    variants: createRelease(
                        'official-prerelease',
                        false,
                    ).variants.map((variant) => ({
                        ...variant,
                        assets: variant.assets.map((asset) => ({
                            ...asset,
                            downloadUrl: `https://fallback.example/${asset.name}`,
                        })),
                    })),
                },
                createRelease('official-stable', false),
            ],
            providers: [],
        });

        expect(mapped.availableReleases).toHaveLength(1);
        expect(mapped.availableReleases[0]?.assets[0]?.download_url).toBe(
            'https://example.com/godot-windows.zip',
        );
    });

    it('deduplicates prereleases using the prerelease provider release', () => {
        const mapped = mapEditorCatalogResult({
            releases: [
                createRelease('official-stable', true),
                createRelease('official-prerelease', true),
            ],
            providers: [],
        });

        expect(mapped.availablePrereleases).toHaveLength(1);
        expect(mapped.availablePrereleases[0]?.tag).toBe('4.6-beta1');
        expect(mapped.availablePrereleases[0]?.name).toBe(
            'official-prerelease 4.6-beta1',
        );
    });

    it('keeps fallback providers and distinct exact versions', () => {
        const fallbackStable = createRelease('official-prerelease', false);
        const patchRelease = {
            ...createRelease('official-stable', false),
            id: 'official-stable:4.5.1-stable',
            tag: '4.5.1-stable',
            version: '4.5.1-stable',
            versionParts: {
                ...createRelease('official-stable', false).versionParts,
                patch: 1,
            },
        };
        const mapped = mapEditorCatalogResult({
            releases: [
                fallbackStable,
                patchRelease,
                createRelease('official-stable', true),
            ],
            providers: [
                {
                    id: 'official-prerelease',
                    lastFetchedAt: 1,
                    isStale: true,
                    refreshError: 'Builds are unavailable',
                },
            ],
        });

        expect(
            mapped.availableReleases.map((release) => release.version),
        ).toEqual(['4.5-stable', '4.5.1-stable']);
        expect(mapped.availablePrereleases).toHaveLength(1);
        expect(mapped.refreshError).toBe('Builds are unavailable');
    });
});

/**
 * Creates a catalog release for mapper tests.
 *
 * @param providerId - The provider that owns the release.
 * @param prerelease - Whether the release is a prerelease.
 * @returns A catalog release with both editor flavors.
 */
function createRelease(
    providerId: EditorCatalogProviderId,
    prerelease: boolean,
): EditorCatalogRelease {
    const version = prerelease ? '4.6-beta1' : '4.5-stable';

    return {
        id: `${providerId}:${version}`,
        sourceReleaseId: '45',
        providerId,
        tag: version,
        version,
        baseVersion: prerelease ? '4.6' : '4.5',
        name: `${providerId} ${version}`,
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
                id: `${providerId}:${version}:gdscript`,
                flavor: 'gdscript',
                assets: [
                    {
                        id: 'windows-x64',
                        name: 'godot-windows.zip',
                        downloadUrl: 'https://example.com/godot-windows.zip',
                        digest: `sha256:${'a'.repeat(64)}`,
                        checksumManifestUrl:
                            'https://example.com/SHA512-SUMS.txt',
                        platform: 'win32',
                        architecture: 'x64',
                    },
                ],
            },
            {
                id: `${providerId}:${version}:dotnet`,
                flavor: 'dotnet',
                assets: [
                    {
                        id: 'linux-arm64',
                        name: 'godot-dotnet-linux.zip',
                        downloadUrl:
                            'https://example.com/godot-dotnet-linux.zip',
                        checksumManifestUrl:
                            'https://example.com/SHA512-SUMS.txt',
                        platform: 'linux',
                        architecture: 'arm64',
                    },
                ],
            },
        ],
    };
}
