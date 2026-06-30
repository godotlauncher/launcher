import type {
    AvailableReleasesResult,
    InstalledRelease,
    InstallReleaseResult,
    ReleaseInstallProgress,
    ReleaseSummary,
    RemovedReleaseResult,
} from '@shared';
import React from 'react';

type ReleaseContext = {
    availableReleases: ReleaseSummary[];
    availablePrereleases: ReleaseSummary[];
    installedReleases: InstalledRelease[];
    downloadingReleases: ReleaseInstallProgress[];
    releaseInstallProgress: ReleaseInstallProgress[];
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
    getReleaseInstallProgress: (
        version: string,
        mono: boolean,
    ) => ReleaseInstallProgress | undefined;
    isInstalledRelease: (version: string, mono: boolean) => boolean;
    removeRelease: (release: InstalledRelease) => Promise<RemovedReleaseResult>;
    isDownloadingRelease: (version: string, mono: boolean) => boolean;

    checkAllReleasesValid: () => Promise<InstalledRelease[]>;
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
    const [releaseInstallProgress, setReleaseInstallProgress] = React.useState<
        ReleaseInstallProgress[]
    >([]);
    const [loading, setLoading] = React.useState<boolean>(true);

    const getRefreshError = (
        ...results: AvailableReleasesResult[]
    ): string | undefined => {
        return results.find((result) => result.refreshError)?.refreshError;
    };

    const updateAllReleases = () => {
        setLoading(true);
        setHasError(undefined);
        Promise.all([
            window.electron.getAvailableReleases(),
            window.electron.getAvailablePrereleases(),
            window.electron.getInstalledReleases(),
        ])
            .then(([releasesResult, prereleasesResult, installed]) => {
                setAvailableReleases(releasesResult.releases);
                setAvailablePrereleases(prereleasesResult.releases);
                setInstalledReleases(installed);
                setHasError(getRefreshError(releasesResult, prereleasesResult));
            })
            .catch((e) => setHasError(e.message))
            .finally(() => setLoading(false));
    };

    const upsertInstalledRelease = React.useCallback(
        (release: InstalledRelease) => {
            setInstalledReleases((prevReleases) => {
                const nextReleases = prevReleases.filter(
                    (storedRelease) =>
                        storedRelease.version !== release.version ||
                        storedRelease.mono !== release.mono,
                );
                nextReleases.push(release);
                return nextReleases;
            });
        },
        [],
    );

    // biome-ignore lint/correctness/useExhaustiveDependencies: Only want to run on mount
    React.useEffect(() => {
        const off = window.electron.subscribeReleases(setInstalledReleases);
        const offInstallProgress =
            window.electron.subscribeReleaseInstallProgress((progress) => {
                setReleaseInstallProgress((prevProgress) => {
                    const nextProgress = prevProgress.filter(
                        (candidate) =>
                            candidate.version !== progress.version ||
                            candidate.mono !== progress.mono,
                    );

                    if (
                        progress.stage === 'complete' ||
                        progress.stage === 'error'
                    ) {
                        return nextProgress;
                    }

                    return [...nextProgress, progress];
                });

                if (progress.stage === 'complete' && progress.release) {
                    upsertInstalledRelease(progress.release);
                }
            });
        updateAllReleases();

        return () => {
            off();
            offInstallProgress();
        };
    }, []);

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

    const downloadingReleases = React.useMemo(
        () =>
            releaseInstallProgress.filter(
                (progress) =>
                    progress.stage !== 'complete' && progress.stage !== 'error',
            ),
        [releaseInstallProgress],
    );

    const isDownloadingRelease = (version: string, mono: boolean): boolean => {
        return Boolean(getReleaseInstallProgress(version, mono));
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

    const getReleaseInstallProgress = (
        version: string,
        mono: boolean,
    ): ReleaseInstallProgress | undefined => {
        return releaseInstallProgress.find(
            (progress) =>
                progress.version === version && progress.mono === mono,
        );
    };

    const removeRelease = async (
        release: InstalledRelease,
    ): Promise<RemovedReleaseResult> => {
        const result = await window.electron.removeRelease(release);

        if (result.success) {
            updateAllReleases();
        }

        return result;
    };

    const installRelease = async (
        release: ReleaseSummary,
        mono: boolean,
    ): Promise<InstallReleaseResult> => {
        let result: InstallReleaseResult;
        try {
            result = await window.electron.installRelease(release, mono);
        } catch (error) {
            return {
                success: false,
                version: release.version,
                error: (error as Error).message,
            };
        }

        if (result.success) {
            setLoading(true);

            Promise.all([
                window.electron.getAvailableReleases().then((result) => {
                    setAvailableReleases(result.releases);
                    if (result.refreshError) {
                        setHasError(result.refreshError);
                    }
                }),
                window.electron
                    .getInstalledReleases()
                    .then(setInstalledReleases),
            ]).finally(() => setLoading(false));
        }

        return result;
    };

    const reinstallRelease = async (
        release: InstalledRelease,
    ): Promise<InstallReleaseResult> => {
        try {
            const result = await window.electron.reinstallRelease(release);

            if (result.success) {
                setLoading(true);

                Promise.all([
                    window.electron.getAvailableReleases().then((result) => {
                        setAvailableReleases(result.releases);
                        if (result.refreshError) {
                            setHasError(result.refreshError);
                        }
                    }),
                    window.electron
                        .getInstalledReleases()
                        .then(setInstalledReleases),
                ]).finally(() => setLoading(false));
            }

            return result;
        } catch (error) {
            return {
                success: false,
                version: release.version,
                error: (error as Error).message,
            };
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
                releaseInstallProgress,
                loading,
                hasError,
                refreshAvailableReleases,
                clearReleaseCache,
                installRelease,
                reinstallRelease,
                registerCustomEngine,
                getInstalledRelease,
                getReleaseInstallProgress,
                isInstalledRelease,
                removeRelease,
                isDownloadingRelease,
                checkAllReleasesValid,
            }}
        >
            {' '}
            {children}
        </releaseContext.Provider>
    );
};
