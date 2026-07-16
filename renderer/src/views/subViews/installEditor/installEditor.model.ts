import type { InstalledRelease, ReleaseSummary } from '@shared/contracts';

export type InstallEditorTab = 'RELEASE' | 'PRERELEASE' | 'INSTALLED';

export type DownloadingInstallEditorRelease = {
    version: string;
    mono: boolean;
    prerelease: boolean;
    published_at: string | null;
};

export type GetInstalledRelease = (
    version: string,
    mono: boolean,
) => InstalledRelease | undefined;

export function buildInstallEditorInstalledRows(
    installedReleases: InstalledRelease[],
    downloadingReleases: DownloadingInstallEditorRelease[],
): InstalledRelease[] {
    const downloadingRows: InstalledRelease[] = downloadingReleases.map(
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

    return installedReleases
        .map((release) => {
            const downloadingRelease = downloadingRows.find(
                (candidate) =>
                    candidate.version === release.version &&
                    candidate.mono === release.mono,
            );

            return downloadingRelease ?? release;
        })
        .concat(
            downloadingRows.filter(
                (release) =>
                    !installedReleases.some(
                        (installedRelease) =>
                            installedRelease.version === release.version &&
                            installedRelease.mono === release.mono,
                    ),
            ),
        );
}

export function filterInstallEditorInstalledRows(
    rows: InstalledRelease[],
    textSearch: string,
): InstalledRelease[] {
    if (textSearch.length === 0) {
        return rows;
    }

    return rows.filter((row) =>
        row.version.toLowerCase().includes(textSearch.toLowerCase()),
    );
}

export function filterAvailableEditorRows({
    tab,
    availableReleases,
    availablePrereleases,
    filterInstalled,
    textSearch,
    getInstalledRelease,
}: {
    tab: InstallEditorTab;
    availableReleases: ReleaseSummary[];
    availablePrereleases: ReleaseSummary[];
    filterInstalled: boolean;
    textSearch: string;
    getInstalledRelease: GetInstalledRelease;
}): ReleaseSummary[] {
    if (tab === 'RELEASE') {
        return filterBySearch(
            filterByInstalled(
                availableReleases,
                filterInstalled,
                getInstalledRelease,
            ),
            textSearch,
        );
    }

    if (tab === 'INSTALLED') {
        return [];
    }

    return filterBySearch(
        filterByInstalled(
            availablePrereleases,
            filterInstalled,
            getInstalledRelease,
        ).filter((row) => row.prerelease),
        textSearch,
    );
}

export function countInstalledReleasesByPrerelease(
    installedReleases: InstalledRelease[],
    prerelease: boolean,
): number {
    return installedReleases.reduce((count, release) => {
        if (release.prerelease === prerelease) {
            return count + 1;
        }

        return count;
    }, 0);
}

export function hasDownloadingReleasesByPrerelease(
    downloadingReleases: DownloadingInstallEditorRelease[],
    prerelease: boolean,
): boolean {
    return downloadingReleases.some(
        (release) => release.prerelease === prerelease,
    );
}

function filterByInstalled(
    rows: ReleaseSummary[],
    filterInstalled: boolean,
    getInstalledRelease: GetInstalledRelease,
): ReleaseSummary[] {
    if (!filterInstalled) {
        return rows;
    }

    return rows.filter(
        (row) =>
            getInstalledRelease(row.version, false) ||
            getInstalledRelease(row.version, true),
    );
}

function filterBySearch(
    rows: ReleaseSummary[],
    textSearch: string,
): ReleaseSummary[] {
    if (textSearch.length === 0) {
        return rows;
    }

    return rows.filter((row) =>
        row.name.toLowerCase().includes(textSearch.toLowerCase()),
    );
}
