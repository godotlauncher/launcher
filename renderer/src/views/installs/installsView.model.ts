import type { InstalledRelease } from '@shared';
import { sortReleases } from '../../releaseStoring.utils';

export type ReleaseAction = 'retry' | 'reinstall' | 'remove';

export const SUPPORTED_CUSTOM_ENGINE_MANIFEST_NAMES = [
    'godotlauncher-editor-manifest.json',
];

export function getReleaseActionKey(release: InstalledRelease): string {
    return `${release.version}_${release.mono ? 'mono' : 'standard'}`;
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
