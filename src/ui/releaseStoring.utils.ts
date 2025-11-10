// Map release type to a sort priority (lower is "higher" in final sort).
// stable -> 0 (highest), beta -> 1, dev -> 2 (lowest)
const RELEASE_TYPE_PRIORITY: Record<string, number> = {
    stable: 0,
    beta: 1,
    dev: 2,
};

interface SortableRelease {
    version: string;
    prerelease?: boolean;
}

/**
 * Parses a release name string and extracts version components (major, minor, patch, revision),
 * the release type, and an optional numeric suffix.
 *
 * The release name string can follow these formats:
 *   `major.minor[.patch][.revision][-type[suffix]]`
 *
 * - `major` (required): Major version number.
 * - `minor` (required): Minor version number.
 * - `patch` (optional): Patch version number, defaults to 0 if not present.
 * - `revision` (optional): Additional 4th version number, defaults to 0 if not present.
 * - `type` (optional): Release type (e.g. "stable", "beta", or "dev"). Defaults to "dev" if not present.
 * - `suffix` (optional): Numeric suffix for beta/dev types (e.g. "beta2", "dev3"), defaults to 0 if not present.
 *
 * Examples of valid release names:
 *   - "4.1.2-stable"    => { major: 4, minor: 1, patch: 2, revision: 0, type: "stable", suffixNumber: 0 }
 *   - "4.4-beta1"       => { major: 4, minor: 4, patch: 0, revision: 0, type: "beta",   suffixNumber: 1 }
 *   - "4.4-dev3"        => { major: 4, minor: 4, patch: 0, revision: 0, type: "dev",    suffixNumber: 3 }
 *   - "4.2-stable"      => { major: 4, minor: 2, patch: 0, revision: 0, type: "stable", suffixNumber: 0 }
 *   - "2.0.0.0-stable"  => { major: 2, minor: 0, patch: 0, revision: 0, type: "stable", suffixNumber: 0 }
 *
 * If the release name does not match the expected format, the function returns default values:
 *   {
 *     major: 0,
 *     minor: 0,
 *     patch: 0,
 *     revision: 0,
 *     type: "dev",
 *     typePriority: RELEASE_TYPE_PRIORITY["dev"],
 *     suffixNumber: 0
 *   }
 *
 * @param version - The release name string to parse.
 * @returns An object containing the parsed release information:
 *   - `major`:     The major version number.
 *   - `minor`:     The minor version number.
 *   - `patch`:     The patch version number.
 *   - `revision`:  The 4th version component, if present.
 *   - `type`:      The release type ("stable", "beta", or "dev").
 *   - `typePriority`: Priority number for the release type (stable < beta < dev).
 *   - `suffixNumber`: The numeric suffix for beta/dev types, if any.
 */
export function parseReleaseName(version: string) {
    // This regex captures:
    //   1) major     => group(1)
    //   2) minor     => group(2)
    //   3) patch?    => group(3)  (optional)
    //   4) revision? => group(4)  (optional)
    //   5) type?     => group(5)  (stable|beta|dev) (optional)
    //   6) suffix?   => group(6)  numeric after beta/dev, e.g. "2" in "beta2" (optional)
    //
    // Examples matched:
    //   "2.0.0.0-stable" => major=2, minor=0, patch=0, revision=0, type=stable
    //   "4.1.2-stable"   => major=4, minor=1, patch=2, revision=?, type=stable
    //   "4.4-beta1"      => major=4, minor=4, patch=?, revision=?, type=beta, suffix=1
    //   "4.4-dev3"       => major=4, minor=4, patch=?, revision=?, type=dev,  suffix=3
    //   "4.2-stable"     => major=4, minor=2, patch=?, revision=?, type=stable
    //
    // Note:
    // - If there's no patch part, default it to 0.
    // - If there's no revision part, default it to 0.
    // - If there's no suffix for beta/dev, default it to 0.
    const regex =
        /^(\d+)\.(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-(stable|beta|dev)(\d+)?)?$/;
    const match = version.match(regex);
    if (!match) {
        // Fallback if it doesn't match
        return {
            major: 0,
            minor: 0,
            patch: 0,
            revision: 0,
            type: 'dev' as const,
            typePriority: RELEASE_TYPE_PRIORITY.dev,
            suffixNumber: 0,
        };
    }

    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    const patch = match[3] ? parseInt(match[3], 10) : 0;
    const revision = match[4] ? parseInt(match[4], 10) : 0;
    const type = match[5] || 'dev';
    const suffixNumber = match[6] ? parseInt(match[6], 10) : 0;

    return {
        major,
        minor,
        patch,
        revision,
        type,
        typePriority: RELEASE_TYPE_PRIORITY[type],
        suffixNumber,
    };
}

/**
 * Sorts an array of release summaries based on:
 *   1. Version (major, minor, patch, revision) in descending order.
 *   2. Type priority (stable < beta < dev).
 *   3. Numeric suffix (e.g. beta2 vs beta1) in descending order.
 *
 * @param a - The first release summary to compare.
 * @param b - The second release summary to compare.
 * @returns A negative number if `a` should come before `b`,
 *          a positive number if `a` should come after `b`,
 *          or 0 if they are considered equal.
 */
export function sortReleases(a: SortableRelease, b: SortableRelease) {
    const A = parseReleaseName(a.version);
    const B = parseReleaseName(b.version);

    // 1) Compare version numbers in descending order
    //    (larger major → minor → patch → revision first).
    if (A.major !== B.major) {
        return B.major - A.major;
    }
    if (A.minor !== B.minor) {
        return B.minor - A.minor;
    }
    if (A.patch !== B.patch) {
        return B.patch - A.patch;
    }
    if (A.revision !== B.revision) {
        return B.revision - A.revision;
    }

    // 2) Among the same version, compare type priority:
    //    stable (0) < beta (1) < dev (2).
    if (A.typePriority !== B.typePriority) {
        return A.typePriority - B.typePriority;
    }

    // 3) Among the same version & type, compare suffixNumber
    //    in descending order (beta2 => 2 is newer than beta1 => 1).
    if (A.suffixNumber !== B.suffixNumber) {
        return B.suffixNumber - A.suffixNumber;
    }

    // 4) Otherwise, they're considered equal for sorting.
    return 0;
}

export function sortByPublishDate(a: ReleaseSummary, b: ReleaseSummary) {
    return (
        new Date(b.published_at || 0).getTime() -
        new Date(a.published_at || 0).getTime()
    );
}
