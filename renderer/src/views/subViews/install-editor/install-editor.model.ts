import type { ReleaseSummary } from '@shared/contracts';

export type InstallEditorShow = 'latest' | 'all';
export type InstallEditorChannel = 'stable' | 'prerelease';
export type InstallEditorReleaseGroup = {
    baseVersion: string;
    releases: ReleaseSummary[];
};

type GetInstallEditorRowsOptions = {
    show: InstallEditorShow;
    channel: InstallEditorChannel;
    availableReleases: ReleaseSummary[];
    availablePrereleases: ReleaseSummary[];
    search: string;
};

type InstallEditorVersionParts = {
    major: number;
    minor: number;
    patch: number;
    channelRank: number;
    iteration: number;
};

const installEditorChannelRanks: Record<string, number> = {
    dev: 0,
    alpha: 1,
    beta: 2,
    rc: 3,
    stable: 4,
};

/**
 * Gets the whole seconds left in a catalog refresh cooldown.
 *
 * @param refreshAvailableAt - The time when refresh becomes available.
 * @param now - The current time.
 * @returns The remaining cooldown seconds.
 */
export function getInstallEditorRefreshCooldownSeconds(
    refreshAvailableAt: number,
    now: number,
): number {
    return Math.max(0, Math.ceil((refreshAvailableAt - now) / 1000));
}

/**
 * Selects releases for the current drawer view.
 *
 * @param options - The current filters and available releases.
 * @returns The releases to show in the drawer.
 */
export function getInstallEditorRows({
    show,
    channel,
    availableReleases,
    availablePrereleases,
    search,
}: GetInstallEditorRowsOptions): ReleaseSummary[] {
    if (show === 'latest') {
        return getLatestInstallEditorRows(
            channel,
            availableReleases,
            availablePrereleases,
        );
    }

    const releases = [
        ...(channel === 'stable' ? availableReleases : availablePrereleases),
    ].sort(compareInstallEditorReleases);
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
        return releases;
    }

    return releases.filter((release) =>
        [release.version, release.name, release.tag]
            .filter((value): value is string => Boolean(value))
            .some((value) => value.toLowerCase().includes(normalizedSearch)),
    );
}

/**
 * Groups releases by their major and minor version.
 *
 * @param releases - The sorted releases to group.
 * @returns Release groups in the same order as the input.
 */
export function groupInstallEditorReleases(
    releases: ReleaseSummary[],
): InstallEditorReleaseGroup[] {
    const groups = new Map<string, ReleaseSummary[]>();

    for (const release of releases) {
        const baseVersion = getReleaseBaseVersion(release);
        const group = groups.get(baseVersion) ?? [];
        group.push(release);
        groups.set(baseVersion, group);
    }

    return Array.from(groups, ([baseVersion, groupedReleases]) => ({
        baseVersion,
        releases: groupedReleases,
    }));
}

/**
 * Selects the curated releases used by the Latest view.
 *
 * @param channel - The selected stable or prerelease channel.
 * @param availableReleases - Stable releases in newest-first order.
 * @param availablePrereleases - Prereleases in newest-first order.
 * @returns Up to four stable releases or one eligible prerelease.
 */
export function getLatestInstallEditorRows(
    channel: InstallEditorChannel,
    availableReleases: ReleaseSummary[],
    availablePrereleases: ReleaseSummary[],
): ReleaseSummary[] {
    if (channel === 'stable') {
        return [...availableReleases]
            .sort(compareInstallEditorReleases)
            .slice(0, 4);
    }

    const stableBaseVersions = new Set(
        availableReleases.map((release) => getReleaseBaseVersion(release)),
    );
    const latestPrerelease = [...availablePrereleases]
        .sort(compareInstallEditorReleases)
        .find(
            (release) =>
                !stableBaseVersions.has(getReleaseBaseVersion(release)),
        );

    return latestPrerelease ? [latestPrerelease] : [];
}

/**
 * Gets the major and minor version used to compare release families.
 *
 * @param release - The release to read.
 * @returns The major and minor version, or the complete version as fallback.
 */
function getReleaseBaseVersion(release: ReleaseSummary): string {
    const match = release.version.match(/^v?(\d+)\.(\d+)/i);
    return match ? `${match[1]}.${match[2]}` : release.version;
}

/**
 * Sorts releases from newest version to oldest version.
 *
 * @param first - The first release to compare.
 * @param second - The second release to compare.
 * @returns A negative value when the first release should come first.
 */
function compareInstallEditorReleases(
    first: ReleaseSummary,
    second: ReleaseSummary,
): number {
    const firstParts = getInstallEditorVersionParts(first);
    const secondParts = getInstallEditorVersionParts(second);

    for (const key of [
        'major',
        'minor',
        'patch',
        'channelRank',
        'iteration',
    ] as const) {
        const difference = secondParts[key] - firstParts[key];
        if (difference !== 0) {
            return difference;
        }
    }

    return second.version.localeCompare(first.version);
}

/**
 * Reads sortable values from one editor version.
 *
 * @param release - The release version to read.
 * @returns Numeric values used to sort the release.
 */
function getInstallEditorVersionParts(
    release: ReleaseSummary,
): InstallEditorVersionParts {
    const match = release.version.match(
        /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:-([a-z]+)(\d+)?)?/i,
    );
    const channel = match?.[4]?.toLowerCase() ?? 'stable';

    return {
        major: Number(match?.[1] ?? release.version_number),
        minor: Number(match?.[2] ?? 0),
        patch: Number(match?.[3] ?? 0),
        channelRank: installEditorChannelRanks[channel] ?? 0,
        iteration: Number(match?.[5] ?? 0),
    };
}
