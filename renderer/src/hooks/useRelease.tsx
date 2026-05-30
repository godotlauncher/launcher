import type {
    InstalledRelease,
    InstallReleaseResult,
    ReleaseSummary,
} from '@shared';
import React from 'react';

type ReleaseContext = {
    availableReleases: ReleaseSummary[];
    availablePrereleases: ReleaseSummary[];
    installedReleases: InstalledRelease[];
    downloadingReleases: Array<{
        version: string;
        mono: boolean;
        prerelease: boolean;
        published_at: string;
    }>;
    loading: boolean;
    hasError: string | undefined;
    refreshAvailableReleases: () => Promise<void>;
    clearReleaseCache: () => Promise<void>;
    installRelease: (
        release: ReleaseSummary,
        mono: boolean,
    ) => Promise<InstallReleaseResult>;
    reinstallRelease: (
        release: InstalledRelease,
    ) => Promise<InstallReleaseResult>;
    registerCustomEngine: (
        manifestPath: string,
        options?: { replaceExisting?: boolean },
    ) => Promise<{
        success: boolean;
        error?: string;
        release?: InstalledRelease;
        releases?: InstalledRelease[];
        duplicate?: InstalledRelease;
    }>;
    getInstalledRelease: (
        version: string,
        mono: boolean,
    ) => InstalledRelease | undefined;
    isInstalledRelease: (version: string, mono: boolean) => boolean;
    removeRelease: (release: InstalledRelease) => Promise<void>;
    isDownloadingRelease: (version: string, mono: boolean) => boolean;

    checkAllReleasesValid: () => Promise<InstalledRelease[]>;
    showReleaseMenu: (release: InstalledRelease) => Promise<void>;
};
const releaseContext = React.createContext<ReleaseContext>(
    {} as ReleaseContext,
);

export const useRelease = () => {
    const context = React.useContext(releaseContext);
    if (!context) {
        throw new Error('useRelease must be used within a ReleaseProvider');
    }
    return context;
};

type ReleaseProviderProps = React.PropsWithChildren;

type DownloadingRelease = {
    version: string;
    mono: boolean;
    prerelease: boolean;
    published_at: string;
};

export const ReleaseProvider: React.FC<ReleaseProviderProps> = ({
    children,
}) => {
    const [hasError, setHasError] = React.useState<string>();
    const [availableReleases, setAvailableReleases] = React.useState<
        ReleaseSummary[]
    >([]);
    const [availablePrereleases, setAvailablePrereleases] = React.useState<
        ReleaseSummary[]
    >([]);
    const [installedReleases, setInstalledReleases] = React.useState<
        InstalledRelease[]
    >([]);
    const [downloadingReleases, setDownloadingReleases] = React.useState<
        DownloadingRelease[]
    >([]);
    const [loading, setLoading] = React.useState<boolean>(true);

    const updateAllReleases = () => {
        setLoading(true);
        setHasError(undefined);
        Promise.all([
            window.electron.getAvailableReleases().then(setAvailableReleases),
            window.electron
                .getAvailablePrereleases()
                .then(setAvailablePrereleases),
            window.electron.getInstalledReleases().then(setInstalledReleases),
        ])
            .catch((e) => setHasError(e.message))
            .finally(() => setLoading(false));
    };

    // biome-ignore lint/correctness/useExhaustiveDependencies: Only want to run on mount
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

    const clearReleaseCache = async () => {
        setLoading(true);
        try {
            await window.electron.clearReleaseCache();
            updateAllReleases();
        } finally {
            setLoading(false);
        }
    };

    const isDownloadingRelease = (version: string, mono: boolean): boolean => {
        return downloadingReleases.some(
            (r) => r.version === version && r.mono === mono,
        );
    };

    const addDownloadingRelease = (release: DownloadingRelease) => {
        setDownloadingReleases((prevValue) => {
            if (
                prevValue.some(
                    (r) =>
                        r.version === release.version &&
                        r.mono === release.mono,
                )
            ) {
                return prevValue;
            }

            return [...prevValue, release];
        });
    };

    const removeDownloadingRelease = (version: string, mono: boolean) => {
        setDownloadingReleases((prevReleases) => {
            const index = prevReleases.findIndex(
                (r) => r.version === version && r.mono === mono,
            );

            if (index > -1) {
                const newDownloadingReleases = [...prevReleases];
                newDownloadingReleases.splice(index, 1);
                return newDownloadingReleases;
            }

            return prevReleases;
        });
    };

    const isInstalledRelease = (version: string, mono: boolean): boolean => {
        return installedReleases.some(
            (r) =>
                r.version === version && r.mono === mono && r.valid !== false,
        );
    };

    const getInstalledRelease = (
        version: string,
        mono: boolean,
    ): InstalledRelease | undefined => {
        return installedReleases.find(
            (r) => r.version === version && r.mono === mono,
        );
    };

    const removeRelease = async (release: InstalledRelease): Promise<void> => {
        const result = await window.electron.removeRelease(release);

        if (result.success) {
            updateAllReleases();
        }
    };

    const installRelease = async (
        release: ReleaseSummary,
        mono: boolean,
    ): Promise<InstallReleaseResult> => {
        addDownloadingRelease({
            version: release.version,
            mono,
            prerelease: release.prerelease,
            published_at: release.published_at ?? '',
        });

        const result = await window.electron.installRelease(release, mono);

        if (result.success) {
            setLoading(true);

            Promise.all([
                window.electron
                    .getAvailableReleases()
                    .then(setAvailableReleases),
                window.electron
                    .getInstalledReleases()
                    .then(setInstalledReleases),
            ]).finally(() => setLoading(false));
        }

        removeDownloadingRelease(release.version, mono);
        return result;
    };

    const reinstallRelease = async (
        release: InstalledRelease,
    ): Promise<InstallReleaseResult> => {
        addDownloadingRelease({
            version: release.version,
            mono: release.mono,
            prerelease: release.prerelease,
            published_at: release.published_at ?? '',
        });

        try {
            const result = await window.electron.reinstallRelease(release);

            if (result.success) {
                setLoading(true);

                Promise.all([
                    window.electron
                        .getAvailableReleases()
                        .then(setAvailableReleases),
                    window.electron
                        .getInstalledReleases()
                        .then(setInstalledReleases),
                ]).finally(() => setLoading(false));
            }

            return result;
        } finally {
            removeDownloadingRelease(release.version, release.mono);
        }
    };

    const registerCustomEngine = async (
        manifestPath: string,
        options?: { replaceExisting?: boolean },
    ) => {
        const result = await window.electron.registerCustomEngine(
            manifestPath,
            options,
        );

        if (result.success) {
            setInstalledReleases(
                result.releases ??
                    (await window.electron.getInstalledReleases()),
            );
        }

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

    return (
        <releaseContext.Provider
            value={{
                availableReleases,
                availablePrereleases,
                installedReleases,
                downloadingReleases,
                loading,
                hasError,
                refreshAvailableReleases,
                clearReleaseCache,
                installRelease,
                reinstallRelease,
                registerCustomEngine,
                getInstalledRelease,
                isInstalledRelease,
                removeRelease,
                isDownloadingRelease,
                checkAllReleasesValid,
                showReleaseMenu,
            }}
        >
            {' '}
            {children}
        </releaseContext.Provider>
    );
};
