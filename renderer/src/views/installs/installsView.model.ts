import type { InstalledRelease, ProjectDetails } from '@shared/contracts';
import { sortReleases } from '../../releaseStoring.utils';

export type ReleaseAction = 'retry' | 'reinstall' | 'remove';

export type InstallsViewState = 'loading' | 'empty' | 'list';

type GetInstallsViewStateOptions = {
    installedReleaseCount: number;
    downloadingReleaseCount: number;
    loading: boolean;
    hasError: boolean;
};

export const SUPPORTED_CUSTOM_ENGINE_MANIFEST_NAMES = [
    'godotlauncher-editor-manifest.json',
];

/**
 * Selects the installs content without showing an empty state while loading or
 * after a release error.
 *
 * @param options - Current release counts and request state.
 * @returns The installs content state to render.
 */
export function getInstallsViewState({
    installedReleaseCount,
    downloadingReleaseCount,
    loading,
    hasError,
}: GetInstallsViewStateOptions): InstallsViewState {
    if (loading || hasError) {
        return 'loading';
    }

    return installedReleaseCount === 0 && downloadingReleaseCount === 0
        ? 'empty'
        : 'list';
}

export function getReleaseActionKey(release: InstalledRelease): string {
    return `${release.version}_${release.mono ? 'mono' : 'standard'}`;
}

/**
 * Counts projects assigned to one installed editor.
 *
 * @param release - Installed editor being inspected.
 * @param projects - Current renderer project records.
 * @returns The number of projects using the editor.
 */
export function getEditorProjectUsageCount(
    release: InstalledRelease,
    projects: ProjectDetails[],
): number {
    return projects.filter(
        (project) =>
            (Boolean(release.editor_path) &&
                project.release.editor_path === release.editor_path) ||
            (project.release.version === release.version &&
                project.release.mono === release.mono),
    ).length;
}

export function isSupportedCustomEngineManifestName(fileName: string): boolean {
    return SUPPORTED_CUSTOM_ENGINE_MANIFEST_NAMES.includes(fileName);
}

export function getFilteredInstalledReleaseRows(
    installedReleases: InstalledRelease[],
    downloadingReleases: Array<{
        version: string;
        mono: boolean;
        prerelease: boolean;
        published_at: string | null;
    }>,
    textSearch: string,
): InstalledRelease[] {
    const downloadingReleaseRows: InstalledRelease[] = downloadingReleases.map(
        (release) => ({
            version: release.version,
            version_number: -1,
            install_path: '',
            mono: release.mono,
            platform: '',
            arch: '',
            editor_path: '',
            prerelease: release.prerelease,
            config_version: 5,
            published_at: release.published_at,
            valid: true,
        }),
    );
    const all = installedReleases
        .map((release) => {
            const downloadingRelease = downloadingReleaseRows.find(
                (candidate) =>
                    candidate.version === release.version &&
                    candidate.mono === release.mono,
            );

            return downloadingRelease ?? release;
        })
        .concat(
            downloadingReleaseRows.filter(
                (release) =>
                    !installedReleases.some(
                        (installedRelease) =>
                            installedRelease.version === release.version &&
                            installedRelease.mono === release.mono,
                    ),
            ),
        );

    if (textSearch.trim().length === 0) {
        return all.sort(sortReleases);
    }

    return all
        .filter((row) =>
            row.version.toLowerCase().includes(textSearch.toLowerCase()),
        )
        .sort(sortReleases);
}
