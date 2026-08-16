import { createHash } from 'node:crypto';
import type { AssetSummary } from '@shared/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    archiveDigestsMatch,
    normalizeGithubAssetDigest,
    resolveArchiveIntegrity,
} from './archive-integrity.util.js';

vi.mock('../i18n/index.js', () => ({
    t: (key: string) => key,
}));

const integrityOptions = { expectedReleaseTag: '4.5-stable' };

describe('archive integrity', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('normalizes only strict GitHub SHA-256 digests', () => {
        expect(normalizeGithubAssetDigest(` SHA256:${'A'.repeat(64)} `)).toBe(
            `sha256:${'a'.repeat(64)}`,
        );
        expect(normalizeGithubAssetDigest('sha512:abcd')).toBeUndefined();
        expect(normalizeGithubAssetDigest('sha256:../outside')).toBeUndefined();
    });

    it('prefers a valid GitHub SHA-256 digest without fetching a manifest', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            resolveArchiveIntegrity(
                createAsset({ digest: `sha256:${'b'.repeat(64)}` }),
                integrityOptions,
            ),
        ).resolves.toEqual({
            algorithm: 'sha256',
            digest: 'b'.repeat(64),
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('resolves one exact SHA-512 manifest entry', async () => {
        const digest = 'c'.repeat(128);
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValue(
                    new Response(
                        `${'d'.repeat(128)}  other.zip\n${digest}  editor.zip\n`,
                    ),
                ),
        );

        await expect(
            resolveArchiveIntegrity(
                createAsset({
                    checksum_manifest_url:
                        'https://github.com/godotengine/godot/releases/download/4.5-stable/SHA512-SUMS.txt',
                }),
                integrityOptions,
            ),
        ).resolves.toEqual({ algorithm: 'sha512', digest });
    });

    it.each([
        [`${'c'.repeat(128)}  editor.zip\n${'d'.repeat(128)}  editor.zip\n`],
        [`${'c'.repeat(128)}  nested/editor.zip\n`],
        [`${'c'.repeat(127)}  editor.zip\n`],
    ])('rejects ambiguous or non-exact SHA-512 metadata', async (manifest) => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response(manifest)),
        );

        await expect(
            resolveArchiveIntegrity(
                createAsset({
                    checksum_manifest_url:
                        'https://github.com/godotengine/godot/releases/download/4.5-stable/SHA512-SUMS.txt',
                }),
                integrityOptions,
            ),
        ).rejects.toThrow('installEditor:errors.archiveIntegrityUnavailable');
    });

    it('rejects oversized checksum manifests before reading them', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response('ignored', {
                    headers: { 'content-length': String(1024 * 1024 + 1) },
                }),
            ),
        );

        await expect(
            resolveArchiveIntegrity(
                createAsset({
                    checksum_manifest_url:
                        'https://github.com/godotengine/godot/releases/download/4.5-stable/SHA512-SUMS.txt',
                }),
                integrityOptions,
            ),
        ).rejects.toThrow('installEditor:errors.archiveIntegrityUnavailable');
    });

    it('compares a calculated digest with the trusted value', () => {
        const digest = createHash('sha256').update('archive').digest('hex');
        expect(archiveDigestsMatch(digest, digest)).toBe(true);
        expect(archiveDigestsMatch(digest, '0'.repeat(64))).toBe(false);
        expect(archiveDigestsMatch(digest, '0'.repeat(128))).toBe(false);
    });

    it('rejects a non-official asset URL even with a matching digest', async () => {
        await expect(
            resolveArchiveIntegrity(
                createAsset({
                    download_url: 'https://example.com/editor.zip',
                    digest: `sha256:${'a'.repeat(64)}`,
                }),
                integrityOptions,
            ),
        ).rejects.toThrow('installEditor:errors.archiveIntegrityUnavailable');
    });

    it('rejects a checksum manifest from a different release', async () => {
        await expect(
            resolveArchiveIntegrity(
                createAsset({
                    checksum_manifest_url:
                        'https://github.com/godotengine/godot/releases/download/4.4-stable/SHA512-SUMS.txt',
                }),
                integrityOptions,
            ),
        ).rejects.toThrow('installEditor:errors.archiveIntegrityUnavailable');
    });

    it('rejects an asset from a different release tag', async () => {
        await expect(
            resolveArchiveIntegrity(
                createAsset({ digest: `sha256:${'a'.repeat(64)}` }),
                { expectedReleaseTag: '4.6-stable' },
            ),
        ).rejects.toThrow('installEditor:errors.archiveIntegrityUnavailable');
    });

    it('rejects a path-bearing archive filename', async () => {
        await expect(
            resolveArchiveIntegrity(
                createAsset({
                    name: '../editor.zip',
                    download_url:
                        'https://github.com/godotengine/godot/releases/download/4.5-stable/..%2Feditor.zip',
                    digest: `sha256:${'a'.repeat(64)}`,
                }),
                integrityOptions,
            ),
        ).rejects.toThrow('installEditor:errors.archiveIntegrityUnavailable');
    });
});

/**
 * Creates the minimal official asset shape used by integrity tests.
 *
 * @param overrides - Integrity metadata to add to the asset.
 * @returns An editor asset fixture.
 */
function createAsset(overrides: Partial<AssetSummary>): AssetSummary {
    return {
        name: 'editor.zip',
        download_url:
            'https://github.com/godotengine/godot/releases/download/4.5-stable/editor.zip',
        platform_tags: ['linux', 'x64'],
        mono: false,
        ...overrides,
    };
}
