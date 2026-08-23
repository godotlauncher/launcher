import type {
    AddProjectEditorResolution,
    ReleaseSummary,
} from '@shared/contracts';

/**
 * Returns the Godot major/minor branch represented by a release version.
 *
 * @param version - Release version or tag-like version text.
 * @returns The major/minor branch, or null when it cannot be parsed.
 */
function getReleaseBaseVersion(version: string): string | null {
    const match = version.match(/^v?(\d+)\.(\d+)/i);
    return match ? `${match[1]}.${match[2]}` : null;
}

/**
 * Parses the numeric version parts used to order stable releases.
 *
 * @param version - Release version or tag-like version text.
 * @returns Major, minor, patch, and revision numbers.
 */
function getReleaseVersionParts(version: string): number[] {
    const match = version.match(/^v?(\d+)\.(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
    return match
        ? [
              Number.parseInt(match[1], 10),
              Number.parseInt(match[2], 10),
              Number.parseInt(match[3] ?? '0', 10),
              Number.parseInt(match[4] ?? '0', 10),
          ]
        : [0, 0, 0, 0];
}

/**
 * Compares stable releases from newest patch to oldest patch.
 *
 * @param first - First release to compare.
 * @param second - Second release to compare.
 * @returns A negative value when the first release is newer.
 */
function compareStableReleases(
    first: ReleaseSummary,
    second: ReleaseSummary,
): number {
    const firstParts = getReleaseVersionParts(first.version);
    const secondParts = getReleaseVersionParts(second.version);

    for (let index = 0; index < firstParts.length; index++) {
        if (firstParts[index] !== secondParts[index]) {
            return secondParts[index] - firstParts[index];
        }
    }

    return 0;
}

/**
 * Reports whether a catalogue release contains the requested editor flavour.
 *
 * @param release - Catalogue release to inspect.
 * @param flavor - Requested standard or .NET flavour.
 * @returns Whether the release has a matching downloadable asset.
 */
function hasEditorFlavor(
    release: ReleaseSummary,
    flavor: 'gdscript' | 'dotnet',
): boolean {
    const mono = flavor === 'dotnet';
    return release.assets.some((asset) => asset.mono === mono);
}

/**
 * Resolves a project editor request against the renderer's release catalogue.
 *
 * @param resolution - Missing-editor resolution returned by the main process.
 * @param availableReleases - Available stable releases.
 * @param availablePrereleases - Available prereleases.
 * @returns The exact or newest matching stable release, when downloadable.
 */
export function findDownloadableProjectEditor(
    resolution: AddProjectEditorResolution,
    availableReleases: ReleaseSummary[],
    availablePrereleases: ReleaseSummary[],
): ReleaseSummary | undefined {
    const downloadable = resolution.downloadable;
    if (!downloadable) {
        return undefined;
    }

    if (downloadable.match === 'exact') {
        return [...availableReleases, ...availablePrereleases].find(
            (release) => release.version === downloadable.version,
        );
    }

    return availableReleases
        .filter(
            (release) =>
                !release.prerelease &&
                getReleaseBaseVersion(release.version) ===
                    downloadable.base_version &&
                hasEditorFlavor(release, downloadable.flavor),
        )
        .sort(compareStableReleases)[0];
}
