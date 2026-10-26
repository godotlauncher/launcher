import { sortReleases } from '../../../release-sorting.util';

type InstallEditorRelease = {
    version: string;
    name?: string;
    tag?: string;
    version_number?: number;
};

export type InstallEditorShow = 'latest' | 'all';
export type InstallEditorChannel = 'stable' | 'prerelease';

type GetInstallEditorRowsOptions<T extends InstallEditorRelease> = {
    show: InstallEditorShow;
    channel: InstallEditorChannel;
    availableReleases: T[];
    availablePrereleases: T[];
    search: string;
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
export function getInstallEditorRows<T extends InstallEditorRelease>({
    show,
    channel,
    availableReleases,
    availablePrereleases,
    search,
}: GetInstallEditorRowsOptions<T>): T[] {
    if (show === 'latest') {
        return getLatestInstallEditorRows(
            channel,
            availableReleases,
            availablePrereleases,
        );
    }

    const releases = [
        ...(channel === 'stable' ? availableReleases : availablePrereleases),
    ].sort(sortReleases);
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
 * Selects the curated releases used by the Latest view.
 *
 * @param channel - The selected stable or prerelease channel.
 * @param availableReleases - Stable releases in newest-first order.
 * @param availablePrereleases - Prereleases in newest-first order.
 * @returns Up to four stable releases or one eligible prerelease.
 */
export function getLatestInstallEditorRows<T extends InstallEditorRelease>(
    channel: InstallEditorChannel,
    availableReleases: T[],
    availablePrereleases: T[],
): T[] {
    if (channel === 'stable') {
        return [...availableReleases].sort(sortReleases).slice(0, 4);
    }

    const stableBaseVersions = new Set(
        availableReleases.map((release) => getReleaseBaseVersion(release)),
    );
    const latestPrerelease = [...availablePrereleases]
        .sort(sortReleases)
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
function getReleaseBaseVersion(release: InstallEditorRelease): string {
    const match = release.version.match(/^v?(\d+)\.(\d+)/i);
    return match ? `${match[1]}.${match[2]}` : release.version;
}
