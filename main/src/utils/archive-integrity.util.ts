import { timingSafeEqual } from 'node:crypto';
import * as path from 'node:path';
import type { AssetSummary } from '@shared/contracts';
import { t } from '../i18n/index.js';

const GITHUB_SHA256_PATTERN = /^sha256:([0-9a-f]{64})$/;
const SHA512_PATTERN = /^[0-9a-f]{128}$/;
const MAX_CHECKSUM_MANIFEST_BYTES = 1024 * 1024;

/** Describes the digest required for one archive download. */
export type ArchiveIntegrity = {
    algorithm: 'sha256' | 'sha512';
    digest: string;
};

/** Options required to resolve integrity for one selected release. */
export type ResolveArchiveIntegrityOptions = {
    expectedReleaseTag: string;
    timeoutMs?: number;
};

/**
 * Normalizes a supported GitHub asset digest.
 *
 * @param value - The digest returned by GitHub.
 * @returns A normalized SHA-256 digest, or undefined when it is not trusted.
 */
export function normalizeGithubAssetDigest(
    value: string | null | undefined,
): string | undefined {
    const normalized = value?.trim().toLowerCase();
    return normalized && GITHUB_SHA256_PATTERN.test(normalized)
        ? normalized
        : undefined;
}

/**
 * Checks whether a value is safe to use as one filesystem path component.
 *
 * @param value - The untrusted path component.
 * @returns Whether the value is non-empty and contains no path traversal.
 */
export function isSafePathSegment(value: string): boolean {
    return (
        Boolean(value.trim()) &&
        value !== '.' &&
        value !== '..' &&
        !value.includes('\0') &&
        path.posix.basename(value) === value &&
        path.win32.basename(value) === value
    );
}

/**
 * Resolves required integrity metadata for an editor archive.
 *
 * @param asset - The selected official editor asset.
 * @param options - Expected release identity and request timeout.
 * @returns The digest that must match the downloaded archive.
 */
export async function resolveArchiveIntegrity(
    asset: AssetSummary,
    options: ResolveArchiveIntegrityOptions,
): Promise<ArchiveIntegrity> {
    const assetSource = parseOfficialReleaseAssetUrl(
        asset.download_url,
        asset.name,
    );
    if (!assetSource || assetSource.tag !== options.expectedReleaseTag) {
        throw new Error(t('installEditor:errors.archiveIntegrityUnavailable'));
    }

    const githubDigest = normalizeGithubAssetDigest(asset.digest);
    if (githubDigest) {
        return {
            algorithm: 'sha256',
            digest: githubDigest.slice('sha256:'.length),
        };
    }

    if (!asset.checksum_manifest_url) {
        throw new Error(t('installEditor:errors.archiveIntegrityUnavailable'));
    }
    const manifestSource = parseOfficialReleaseAssetUrl(
        asset.checksum_manifest_url,
        'SHA512-SUMS.txt',
    );
    if (
        !manifestSource ||
        manifestSource.repository !== assetSource.repository ||
        manifestSource.tag !== assetSource.tag
    ) {
        throw new Error(t('installEditor:errors.archiveIntegrityUnavailable'));
    }

    const manifest = await fetchChecksumManifest(
        asset.checksum_manifest_url,
        options.timeoutMs ?? 120_000,
    );
    const digest = findSha512Digest(manifest, asset.name);
    if (!digest) {
        throw new Error(t('installEditor:errors.archiveIntegrityUnavailable'));
    }

    return { algorithm: 'sha512', digest };
}

/** Identifies one validated official GitHub release asset URL. */
type OfficialReleaseAssetSource = {
    repository: 'godot' | 'godot-builds';
    tag: string;
};

/**
 * Validates an exact release asset URL under an official Godot repository.
 *
 * @param value - The URL to validate.
 * @param expectedName - The exact final filename expected in the URL.
 * @returns The official source identity, or null when the URL is untrusted.
 */
function parseOfficialReleaseAssetUrl(
    value: string,
    expectedName: string,
): OfficialReleaseAssetSource | null {
    try {
        if (!isSafePathSegment(expectedName)) {
            return null;
        }
        const url = new URL(value);
        const segments = url.pathname.split('/').filter(Boolean);
        const repository = segments[1];
        if (
            url.protocol !== 'https:' ||
            url.hostname !== 'github.com' ||
            url.port ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            segments.length !== 6 ||
            segments[0] !== 'godotengine' ||
            (repository !== 'godot' && repository !== 'godot-builds') ||
            segments[2] !== 'releases' ||
            segments[3] !== 'download' ||
            !segments[4] ||
            decodeURIComponent(segments[5]) !== expectedName
        ) {
            return null;
        }

        return { repository, tag: decodeURIComponent(segments[4]) };
    } catch {
        return null;
    }
}

/**
 * Compares two hexadecimal digests without data-dependent early exit.
 *
 * @param calculated - The digest calculated from the downloaded bytes.
 * @param expected - The trusted expected digest.
 * @returns Whether the digests match.
 */
export function archiveDigestsMatch(
    calculated: string,
    expected: string,
): boolean {
    if (calculated.length !== expected.length) {
        return false;
    }

    const calculatedBytes = Buffer.from(calculated, 'hex');
    const expectedBytes = Buffer.from(expected, 'hex');
    return (
        calculatedBytes.length === expectedBytes.length &&
        timingSafeEqual(calculatedBytes, expectedBytes)
    );
}

/**
 * Downloads a checksum manifest with a strict response-size limit.
 *
 * @param url - The official checksum manifest URL.
 * @param timeoutMs - Maximum request duration.
 * @returns The manifest text.
 */
async function fetchChecksumManifest(
    url: string,
    timeoutMs: number,
): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok || !response.body) {
            throw new Error(
                t('installEditor:errors.archiveIntegrityUnavailable'),
            );
        }

        const contentLength = Number.parseInt(
            response.headers.get('content-length') ?? '',
            10,
        );
        if (
            Number.isFinite(contentLength) &&
            contentLength > MAX_CHECKSUM_MANIFEST_BYTES
        ) {
            throw new Error(
                t('installEditor:errors.archiveIntegrityUnavailable'),
            );
        }

        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        while (true) {
            const result = await reader.read();
            if (result.done) {
                break;
            }

            totalBytes += result.value.byteLength;
            if (totalBytes > MAX_CHECKSUM_MANIFEST_BYTES) {
                controller.abort();
                throw new Error(
                    t('installEditor:errors.archiveIntegrityUnavailable'),
                );
            }
            chunks.push(result.value);
        }

        return Buffer.concat(chunks).toString('utf8');
    } catch (error) {
        if (
            error instanceof Error &&
            error.message ===
                t('installEditor:errors.archiveIntegrityUnavailable')
        ) {
            throw error;
        }
        throw new Error(t('installEditor:errors.archiveIntegrityUnavailable'), {
            cause: error,
        });
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Finds one exact archive entry in an official SHA-512 manifest.
 *
 * @param manifest - The checksum manifest contents.
 * @param expectedName - The exact archive filename to match.
 * @returns The normalized digest, or null for missing or ambiguous data.
 */
function findSha512Digest(
    manifest: string,
    expectedName: string,
): string | null {
    if (
        path.posix.basename(expectedName) !== expectedName ||
        path.win32.basename(expectedName) !== expectedName
    ) {
        return null;
    }

    const matches: string[] = [];
    for (const line of manifest.split(/\r?\n/)) {
        const match = line.match(/^([0-9a-fA-F]{128})[ \t]+\*?(.+)$/);
        if (!match || match[2] !== expectedName) {
            continue;
        }

        const digest = match[1].toLowerCase();
        if (!SHA512_PATTERN.test(digest)) {
            return null;
        }
        matches.push(digest);
    }

    return matches.length === 1 ? matches[0] : null;
}
