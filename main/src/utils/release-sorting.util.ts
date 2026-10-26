import type { ReleaseSummary } from '@shared/contracts';

const RELEASE_TYPE_PRIORITY: Record<string, number> = {
    stable: 0,
    rc: 1,
    beta: 2,
    alpha: 3,
    dev: 4,
};

/**
 * Reads the numeric version, release channel and iteration from a Godot version.
 * Bare numeric versions are stable; unrecognised names sort below known versions.
 *
 * @param version - Godot release version, optionally prefixed with v.
 * @returns Sortable version parts, or zeroed development parts for unknown names.
 */
export function parseReleaseName(version: string) {
    const match = version
        .trim()
        .match(
            /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-(stable|rc|beta|alpha|dev)(\d+)?)?$/i,
        );
    const type = match ? (match[5]?.toLowerCase() ?? 'stable') : 'dev';

    return {
        major: Number(match?.[1] ?? 0),
        minor: Number(match?.[2] ?? 0),
        patch: Number(match?.[3] ?? 0),
        revision: Number(match?.[4] ?? 0),
        type,
        typePriority: RELEASE_TYPE_PRIORITY[type],
        suffixNumber: Number(match?.[6] ?? 0),
    };
}

/**
 * Orders Godot versions newest first, then stable, rc, beta, alpha and dev.
 * Versions in the same channel are ordered by their numeric iteration.
 *
 * @param first - First release to compare.
 * @param second - Second release to compare.
 * @returns A negative value when the first release should come first.
 */
export function sortReleases(
    first: { version: string },
    second: { version: string },
): number {
    const a = parseReleaseName(first.version);
    const b = parseReleaseName(second.version);
    return (
        b.major - a.major ||
        b.minor - a.minor ||
        b.patch - a.patch ||
        b.revision - a.revision ||
        a.typePriority - b.typePriority ||
        b.suffixNumber - a.suffixNumber
    );
}

/**
 * Orders releases by publication time, newest first.
 *
 * @param a - First release to compare.
 * @param b - Second release to compare.
 * @returns A negative value when the first release was published later.
 */
export function sortByPublishDate(a: ReleaseSummary, b: ReleaseSummary) {
    const dateB = new Date(b.published_at ?? 0).getTime();
    const dateA = new Date(a.published_at ?? 0).getTime();
    return dateB - dateA;
}
