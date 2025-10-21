import React from 'react';

type ReleaseContext = {
    availableReleases: ReleaseSummary[];
    availablePrereleases: ReleaseSummary[];
    installedReleases: InstalledRelease[];
    downloadingReleases: Array<{ version: string, mono: boolean, prerelease: boolean; published_at: string; }>;
    loading: boolean;
    hasError: string | undefined;
    refreshAvailableReleases: () => Promise<void>;
    installRelease: (release: ReleaseSummary, mono: boolean) => Promise<InstallReleaseResult>;
    isInstalledRelease: (version: string, mono: boolean) => boolean;
    removeRelease: (release: InstalledRelease) => Promise<void>;
    isDownloadingRelease: (version: string, mono: boolean) => boolean;

    checkAllReleasesValid: () => Promise<InstalledRelease[]>;
    showReleaseMenu: (release: InstalledRelease) => Promise<void>;


};
const releaseContext = React.createContext<ReleaseContext>({} as ReleaseContext);

export const useRelease = () => {
    const context = React.useContext(releaseContext);
    if (!context) {
        throw new Error('useRelease must be used within a ReleaseProvider');
    }
    return context;
};

type ReleaseProviderProps = React.PropsWithChildren;

export const ReleaseProvider: React.FC<ReleaseProviderProps> = ({ children }) => {
    const [hasError, setHasError] = React.useState<string>();
    const [availableReleases, setAvailableReleases] = React.useState<ReleaseSummary[]>([]);
    const [availablePrereleases, setAvailablePrereleases] = React.useState<ReleaseSummary[]>([]);
    const [installedReleases, setInstalledReleases] = React.useState<InstalledRelease[]>([]);
    const [downloadingReleases, setDownloadingReleases] = React.useState<{ version: string, mono: boolean, prerelease: boolean; published_at: string; }[]>([]);
    const [loading, setLoading] = React.useState<boolean>(true);


    const updateAllReleases = () => {
        setLoading(true);
        setHasError(undefined);
        Promise.all([
            window.electron.getAvailableReleases().then(setAvailableReleases),
            window.electron.getAvailablePrereleases().then(setAvailablePrereleases),
            window.electron.getInstalledReleases().then(setInstalledReleases)
        ])
            .catch(e => setHasError(e.message))
            .finally(() => setLoading(false));
    };

    React.useEffect(() => {
        const off = window.electron.subscribeReleases(setInstalledReleases);
        updateAllReleases();

        return () => {
            off();
        };
    }, []);


    const showReleaseMenu = async (release: InstalledRelease) => {
        await window.electron.showReleaseMenu(release);
    };

    const refreshAvailableReleases = async () => {
        updateAllReleases();
    };

    const isDownloadingRelease = (version: string, mono: boolean): boolean => {
        return downloadingReleases.some(r => r.version === version && r.mono === mono);
    };

    const isInstalledRelease = (version: string, mono: boolean): boolean => {
        return installedReleases.some(r => r.version === version && r.mono === mono && r.valid !== false);
    };

    const removeRelease = async (release: InstalledRelease): Promise<void> => {

        const result = await window.electron.removeRelease(release);

        if (result.success) {
            updateAllReleases();
        }
    };

    const installRelease = async (release: ReleaseSummary, mono: boolean): Promise<InstallReleaseResult> => {

        setDownloadingReleases(prevValue => [...prevValue, { version: release.version, mono, prerelease: release.prerelease, published_at: release.published_at ?? '' }]);

        const result = await window.electron.installRelease(release, mono);

        if (result.success) {

            setLoading(true);

            Promise.all([
                window.electron.getAvailableReleases().then(setAvailableReleases),
                window.electron.getInstalledReleases().then(setInstalledReleases)
            ]).finally(() => setLoading(false));
        }

        setDownloadingReleases(prevReleases => {

            const index = prevReleases.findIndex(r => r.version === release.version && r.mono === mono);

            if (index > -1) {
                const newDownloadingReleases = [...prevReleases];
                newDownloadingReleases.splice(index, 1);
                return newDownloadingReleases;
            }

            return prevReleases;

        });
        return result;
    };

    const checkAllReleasesValid = async (): Promise<InstalledRelease[]> => {
        setLoading(true);
        try {
            const releases = await window.electron.checkAllReleasesValid();
            setInstalledReleases(releases);
            return releases;
        } finally {
            setLoading(false);
        }
    };

    return <releaseContext.Provider value={
        {
            availableReleases,
            availablePrereleases,
            installedReleases,
            downloadingReleases,
            loading,
            hasError,
            refreshAvailableReleases,
            installRelease,
            isInstalledRelease,
            removeRelease,
            isDownloadingRelease,
            checkAllReleasesValid,
            showReleaseMenu

        }
    } > {children}</ releaseContext.Provider>;
};
