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
                platform_tags: ['win32', 'x64'],
                mono: false,
            },
            {
                name: 'godot-dotnet-linux.zip',
                download_url: 'https://example.com/godot-dotnet-linux.zip',
                platform_tags: ['linux', 'arm64'],
                mono: true,
            },
        ]);
    });

    it('splits channels and keeps provider refresh errors', () => {
        const mapped = mapEditorCatalogResult({
            releases: [
                createRelease('official-stable', false),
                createRelease('official-prerelease', true),
            ],
            providers: [
                {
                    id: 'official-stable',
                    lastFetchedAt: 1,
                    isStale: false,
                },
                {
                    id: 'official-prerelease',
                    lastFetchedAt: 1,
                    isStale: true,
                    refreshError: 'Builds are unavailable',
                },
            ],
        });

        expect(mapped.availableReleases).toHaveLength(1);
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
                id: `${providerId}:${version}:gdscript`,
                flavor: 'gdscript',
                assets: [
                    {
                        id: 'windows-x64',
                        name: 'godot-windows.zip',
                        downloadUrl: 'https://example.com/godot-windows.zip',
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
                        platform: 'linux',
                        architecture: 'arm64',
                    },
                ],
            },
        ],
    };
}
