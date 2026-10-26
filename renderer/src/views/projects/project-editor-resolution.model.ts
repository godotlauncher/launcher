import type {
    AddProjectEditorResolution,
    ProjectDetails,
    ReleaseSummary,
} from '@shared/contracts';
import { sortReleases } from '../../release-sorting.util';

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
    if (resolution.choices !== undefined || !downloadable) {
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
        .sort(sortReleases)[0];
}

/**
 * Finds a downloadable editor for an exact or unresolved stored requirement.
 *
 * @param project - Project whose editor is missing.
 * @param availableReleases - Available stable releases.
 * @param availablePrereleases - Available prereleases.
 * @returns The exact release, or latest compatible stable/prerelease for a bare branch.
 */
export function findDownloadableMissingProjectEditor(
    project: ProjectDetails,
    availableReleases: ReleaseSummary[],
    availablePrereleases: ReleaseSummary[],
): ReleaseSummary | undefined {
    if (
        project.invalid_reason !== 'missing_editor' ||
        project.release.source === 'custom'
    ) {
        return undefined;
    }

    const baseVersion = getReleaseBaseVersion(project.release.version);
    if (project.release.version === baseVersion) {
        const compatible = [
            ...availableReleases,
            ...availablePrereleases,
        ].filter(
            (release) =>
                getReleaseBaseVersion(release.version) === baseVersion &&
                release.assets.some(
                    (asset) => asset.mono === project.release.mono,
                ),
        );
        const stable = compatible.filter((release) => !release.prerelease);
        return (stable.length ? stable : compatible).sort(sortReleases)[0];
    }

    return [...availableReleases, ...availablePrereleases].find(
        (release) =>
            release.version === project.release.version &&
            release.assets.some((asset) => asset.mono === project.release.mono),
    );
}
