import type {
    EditorInstallOrigin,
    InstalledRelease,
    InstallReleaseResult,
    ReleaseInstallProgress,
    ReleaseSummary,
    RemovedReleaseResult,
} from '@shared/contracts';
import React from 'react';
import {
    appBridge,
    editorInstallsBridge,
    subscribeAppEvent,
} from '../bridge.ts';
import { useEditorCatalog } from './editor-catalog.hook.ts';
import { mapEditorCatalogResult } from './editor-catalog-release.mapper.ts';

type ReleaseContext = {
    availableReleases: ReleaseSummary[];
    availablePrereleases: ReleaseSummary[];
    installedReleases: InstalledRelease[];
    downloadingReleases: ReleaseInstallProgress[];
    releaseInstallProgress: ReleaseInstallProgress[];
    loading: boolean;
    initialized: boolean;
    hasError: string | undefined;
    refreshAvailableReleases: () => Promise<void>;
    clearReleaseCache: () => Promise<void>;
    installRelease: (
        release: ReleaseSummary,
        mono: boolean,
        origin: EditorInstallOrigin,
    ) => Promise<InstallReleaseResult>;
    cancelInstall: (jobId: string) => Promise<void>;
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

/** Provides catalog, installed editor, and install state to the renderer. */
export const ReleaseProvider: React.FC<ReleaseProviderProps> = ({
    children,
}) => {
    const { getCatalog, refreshCatalog } = useEditorCatalog();
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
    const [initialized, setInitialized] = React.useState<boolean>(false);

    /**
     * Loads the catalog and installed editors together.
     *
     * @param forceCatalogRefresh - Whether to fetch catalog updates now.
     * @returns A promise that ends when both requests finish.
     */
    const updateAllReleases = async (
        forceCatalogRefresh = false,
    ): Promise<void> => {
        setLoading(true);
        setHasError(undefined);
        try {
            const [catalogResult, installed] = await Promise.all([
                forceCatalogRefresh ? refreshCatalog() : getCatalog(),
                editorInstallsBridge.getInstalledEditors(),
            ]);
            const catalog = mapEditorCatalogResult(catalogResult);

            setAvailableReleases(catalog.availableReleases);
            setAvailablePrereleases(catalog.availablePrereleases);
            setHasError(catalog.refreshError);
            setInstalledReleases(installed);
        } catch (error) {
            setHasError(error instanceof Error ? error.message : String(error));
        } finally {
            setInitialized(true);
            setLoading(false);
        }
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
        const off = subscribeAppEvent('releases-updated', setInstalledReleases);
        const offInstallProgress = subscribeAppEvent(
            'release-install-progress',
            (progress) => {
                setReleaseInstallProgress((prevProgress) => {
                    const nextProgress = prevProgress.filter(
                        (candidate) => candidate.id !== progress.id,
                    );

                    if (
                        progress.stage === 'complete' ||
                        progress.stage === 'cancelled' ||
                        progress.stage === 'error'
                    ) {
                        return nextProgress;
                    }

                    return [...nextProgress, progress];
                });

                if (progress.stage === 'complete' && progress.release) {
                    upsertInstalledRelease(progress.release);
                }
            },
        );
        void updateAllReleases();

        return () => {
            off();
            offInstallProgress();
        };
    }, []);

    /**
     * Refreshes catalog data and installed editor state.
     *
     * @returns A promise that ends when the refresh finishes.
     */
    const refreshAvailableReleases = async (): Promise<void> => {
        await updateAllReleases(true);
    };

    /**
     * Clears the legacy cache and refreshes the active catalog.
     *
     * @returns A promise that ends when both cache paths are current.
     */
    const clearReleaseCache = async (): Promise<void> => {
        setLoading(true);
        try {
            await appBridge.clearReleaseCache();
            await updateAllReleases(true);
        } finally {
            setLoading(false);
        }
    };

    const downloadingReleases = React.useMemo(
        () =>
            releaseInstallProgress.filter(
                (progress) =>
                    progress.stage !== 'complete' &&
                    progress.stage !== 'error' &&
                    progress.stage !== 'cancelled',
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

    /**
     * Removes an installed editor and reloads release state after success.
     *
     * @param release - The installed editor to remove.
     * @returns The remove result from the main process.
     */
    const removeRelease = async (
        release: InstalledRelease,
    ): Promise<RemovedReleaseResult> => {
        const result = await editorInstallsBridge.removeEditor(release);

        if (result.success) {
            setInstalledReleases(result.releases);
        }

        return result;
    };

    /**
     * Installs an editor through the existing install bridge.
     *
     * @param release - The legacy release used by the current installer.
     * @param mono - Whether to install the .NET editor variant.
     * @param origin - Workflow requesting the install.
     * @returns The install result from the main process.
     */
    const installRelease = async (
        release: ReleaseSummary,
        mono: boolean,
        origin: EditorInstallOrigin,
    ): Promise<InstallReleaseResult> => {
        let result: InstallReleaseResult;
        try {
            result = await editorInstallsBridge.installEditor(
                release,
                mono,
                origin,
            );
        } catch (error) {
            return {
                success: false,
                version: release.version,
                error: (error as Error).message,
            };
        }

        if (result.success) {
            void updateAllReleases();
        }

        return result;
    };

    /**
     * Requests cancellation for one exact editor install job.
     *
     * @param jobId - Process-local install job ID.
     * @returns A promise that ends when the request is accepted or rejected.
     */
    const cancelInstall = async (jobId: string): Promise<void> => {
        await editorInstallsBridge.cancelInstall(jobId);
    };

    /**
     * Reinstalls an editor through the existing install bridge.
     *
     * @param release - The installed editor to reinstall.
     * @returns The reinstall result from the main process.
     */
    const reinstallRelease = async (
        release: InstalledRelease,
    ): Promise<InstallReleaseResult> => {
        try {
            const result = await editorInstallsBridge.reinstallEditor(release);

            if (result.success) {
                void updateAllReleases();
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
        const result = await editorInstallsBridge.registerCustomEditor(
            manifestPath,
            options,
        );

        if (result.success) {
            setInstalledReleases(
                result.releases ??
                    (await editorInstallsBridge.getInstalledEditors()),
            );
        }

        return result;
    };

    const checkAllReleasesValid = async (): Promise<InstalledRelease[]> => {
        setLoading(true);
        try {
            const releases =
                await editorInstallsBridge.revalidateInstalledEditors();
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
                initialized,
                hasError,
                refreshAvailableReleases,
                clearReleaseCache,
                installRelease,
                cancelInstall,
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
