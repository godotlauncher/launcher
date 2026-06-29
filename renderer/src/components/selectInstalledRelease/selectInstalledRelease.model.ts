import type { InstalledRelease } from '@shared';
import { sortReleases } from '../../releaseStoring.utils';

export type DownloadingSelectableRelease = {
    version: string;
    mono: boolean;
    prerelease: boolean;
    published_at: string | null;
};

export function getSelectableInstalledReleaseRows(
    installedReleases: InstalledRelease[],
    downloadingReleases: DownloadingSelectableRelease[],
    currentRelease: InstalledRelease,
): InstalledRelease[] {
    return installedReleases
        .filter(
            (release) =>
                parseInt(release.version_number.toString(), 10) >=
                parseInt(currentRelease.version_number.toString(), 10),
        )
        .concat(
            downloadingReleases.map((release) => ({
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
            })),
        )
        .sort(sortReleases);
}

export function getSelectableReleaseKey(release: InstalledRelease): string {
    return `${release.version}_${release.mono ? 'mono' : 'standard'}`;
}
