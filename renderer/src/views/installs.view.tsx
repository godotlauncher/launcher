import type { InstalledRelease, InstallReleaseResult } from '@shared';
import logger from 'electron-log';

import {
    BadgePlus,
    CheckCircle2,
    CircleX,
    EllipsisVertical,
    TriangleAlert,
    TriangleAlertIcon,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useAlerts } from '../hooks/useAlerts';
import { useRelease } from '../hooks/useRelease';
import { sortReleases } from '../releaseStoring.utils';
import { InstallEditorSubView } from './subViews/installEditor.subview';

type ReleaseActionDependencies = {
    checkAllReleasesValid: () => Promise<InstalledRelease[]>;
    reinstallRelease: (
        release: InstalledRelease,
    ) => Promise<InstallReleaseResult>;
    removeRelease: (release: InstalledRelease) => Promise<void>;
};

export const createReleaseActions = (
    dependencies: ReleaseActionDependencies,
) => ({
    retry: async () => dependencies.checkAllReleasesValid(),
    reinstall: async (release: InstalledRelease) => {
        return await dependencies.reinstallRelease(release);
    },
    remove: async (release: InstalledRelease) => {
        await dependencies.removeRelease(release);
    },
});

type ReleaseAction = 'retry' | 'reinstall' | 'remove';

function getReleaseActionKey(release: InstalledRelease): string {
    return `${release.version}_${release.mono ? 'mono' : 'standard'}`;
}

const SUPPORTED_CUSTOM_ENGINE_MANIFEST_NAMES = [
    'godotlauncher-editor-manifest.json',
];

function isSupportedCustomEngineManifestName(fileName: string): boolean {
    return SUPPORTED_CUSTOM_ENGINE_MANIFEST_NAMES.includes(fileName);
}

export const InstallsView: React.FC = () => {
    const { t } = useTranslation(['installs', 'common']);
    const [textSearch, setTextSearch] = useState<string>('');
    const [installOpen, setInstallOpen] = useState<boolean>(false);
    const [isDraggingManifest, setIsDraggingManifest] =
        useState<boolean>(false);
    const [isDraggingSupportedManifest, setIsDraggingSupportedManifest] =
        useState<boolean>(true);
    const dragCounterRef = useRef<number>(0);

    const { addAlert, addConfirm } = useAlerts();
    const {
        installedReleases,
        downloadingReleases,
        showReleaseMenu,
        checkAllReleasesValid,
        reinstallRelease,
        registerCustomEngine,
        removeRelease,
    } = useRelease();
    const [busyAction, setBusyAction] = useState<{
        releaseKey: string;
        action: ReleaseAction;
    } | null>(null);

    const isReleaseActionBusy = (
        release: InstalledRelease,
        action?: ReleaseAction,
    ) => {
        if (
            !busyAction ||
            busyAction.releaseKey !== getReleaseActionKey(release)
        ) {
            return false;
        }

        return action ? busyAction.action === action : true;
    };

    const onOpenReleaseMoreOptions = (
        e: React.MouseEvent,
        release: InstalledRelease,
    ) => {
        e.stopPropagation();
        showReleaseMenu(release);
    };

    const getFilteredRows = () => {
        const downloadingReleaseRows: InstalledRelease[] =
            downloadingReleases.map((r) => ({
                version: r.version,
                version_number: -1,
                install_path: '',
                mono: r.mono,
                platform: '',
                arch: '',
                editor_path: '',
                prerelease: r.prerelease,
                config_version: 5,
                published_at: r.published_at,
                valid: true,
            }));
        const all = installedReleases
            .map((release) => {
                const downloadingRelease = downloadingReleaseRows.find(
                    (r) =>
                        r.version === release.version &&
                        r.mono === release.mono,
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

        if (textSearch === '') return all.sort(sortReleases);
        const selection = all.filter((row) =>
            row.version.toLowerCase().includes(textSearch.toLowerCase()),
        );
        return selection.sort(sortReleases);
    };

    const releaseActions = useMemo(
        () =>
            createReleaseActions({
                checkAllReleasesValid,
                reinstallRelease,
                removeRelease,
            }),
        [checkAllReleasesValid, reinstallRelease, removeRelease],
    );

    const registerManifest = async (
        manifestPath: string,
        replaceExisting = false,
    ) => {
        try {
            const result = await registerCustomEngine(manifestPath, {
                replaceExisting,
            });

            if (result.success) {
                addAlert(
                    t('common:success'),
                    t('messages.registeredCustomEditor', {
                        name:
                            result.release?.name ??
                            result.release?.version ??
                            '',
                    }),
                    <CheckCircle2 className="w-5 h-5 text-success" />,
                );
                return;
            }

            if (result.duplicate && !replaceExisting) {
                addConfirm(
                    t('customEditor.replace.title'),
                    <div className="flex flex-col gap-3">
                        <p>{t('customEditor.replace.message')}</p>
                        <div className="bg-base-200 rounded-md p-3 flex flex-col gap-1">
                            <span className="text-xs uppercase tracking-wide text-base-content/50">
                                {t('customEditor.replace.versionLabel')}
                            </span>
                            <code className="font-mono text-warning">
                                {result.duplicate.version}
                            </code>
                        </div>
                        <p>{t('customEditor.replace.detail')}</p>
                    </div>,
                    () => {
                        void registerManifest(manifestPath, true);
                        return true;
                    },
                    undefined,
                    <TriangleAlertIcon className="inline w-4 h-4 text-warning" />,
                );
                return;
            }

            addAlert(
                t('common:error'),
                result.error ?? t('messages.registerCustomEditorFailed'),
                <TriangleAlertIcon className="inline w-4 h-4 text-error" />,
            );
        } catch (error) {
            addAlert(
                t('common:error'),
                (error as Error).message,
                <TriangleAlertIcon className="inline w-4 h-4 text-error" />,
            );
        }
    };

    const handleAddCustomEngine = async () => {
        const result = await window.electron.openFileDialog(
            '',
            t('customEditor.selectManifestTitle'),
            [
                {
                    name: t('customEditor.manifestFilterName'),
                    extensions: ['json'],
                },
            ],
        );

        if (result.canceled || result.filePaths.length === 0) {
            return;
        }

        await registerManifest(result.filePaths[0]);
    };

    const dragEventHasSupportedManifest = (
        event: React.DragEvent<HTMLElement>,
    ) => {
        const files = Array.from(event.dataTransfer.items)
            .filter((item) => item.kind === 'file')
            .map((item) => item.getAsFile())
            .filter((file): file is File => Boolean(file));

        if (files.length === 0) {
            return true;
        }

        return files.some((file) =>
            isSupportedCustomEngineManifestName(file.name),
        );
    };

    const handleDragEnter = (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragCounterRef.current++;
        setIsDraggingSupportedManifest(dragEventHasSupportedManifest(event));
        setIsDraggingManifest(true);
    };

    const handleDragOver = (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDraggingSupportedManifest(dragEventHasSupportedManifest(event));
    };

    const handleDragLeave = (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current <= 0) {
            dragCounterRef.current = 0;
            setIsDraggingManifest(false);
            setIsDraggingSupportedManifest(true);
        }
    };

    const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragCounterRef.current = 0;
        setIsDraggingManifest(false);
        setIsDraggingSupportedManifest(true);
        const manifestFile = Array.from(event.dataTransfer.files).find((file) =>
            isSupportedCustomEngineManifestName(file.name),
        );

        if (!manifestFile) {
            return;
        }

        await registerManifest(window.electron.getPathForFile(manifestFile));
    };

    const handleRetry = async (release: InstalledRelease) => {
        setBusyAction({
            releaseKey: getReleaseActionKey(release),
            action: 'retry',
        });
        addAlert(t('common:info'), t('messages.revalidating'));
        try {
            const releases = await releaseActions.retry();
            const refreshedRelease = releases.find(
                (candidate) =>
                    candidate.version === release.version &&
                    candidate.mono === release.mono,
            );

            if (refreshedRelease?.valid) {
                addAlert(
                    t('common:success'),
                    t('messages.revalidatedRelease', {
                        version: release.version,
                    }),
                );
                return;
            }

            const rawPath =
                refreshedRelease?.editor_path ||
                refreshedRelease?.install_path ||
                release.editor_path ||
                release.install_path;

            const candidatePath = rawPath
                ? (rawPath.endsWith('/')
                      ? rawPath
                      : rawPath.substring(0, rawPath.lastIndexOf('/') + 1)) ||
                  rawPath
                : undefined;

            if (candidatePath) {
                addAlert(
                    t('common:warning'),
                    <span className="flex flex-col gap-2">
                        <span>
                            {t('messages.revalidationStillMissing', {
                                version: release.version,
                                path: rawPath,
                            })}
                        </span>
                        <span className="flex flex-row gap-2">
                            <button
                                type="button"
                                className="btn btn-xs btn-outline"
                                onClick={async () => {
                                    await navigator.clipboard.writeText(
                                        candidatePath,
                                    );
                                }}
                            >
                                {t('buttons.copyPath', { ns: 'common' })}
                            </button>
                            <button
                                type="button"
                                className="btn btn-xs btn-outline"
                                onClick={() =>
                                    window.electron.openShellFolder(
                                        candidatePath,
                                    )
                                }
                            >
                                {t('buttons.openPath', { ns: 'common' })}
                            </button>
                        </span>
                    </span>,
                    <TriangleAlertIcon className="inline w-4 h-4 text-warning" />,
                );
            } else {
                addAlert(
                    t('common:warning'),
                    t('messages.revalidationStillMissingNoPath', {
                        version: release.version,
                    }),
                    <TriangleAlertIcon className="inline w-4 h-4 text-warning" />,
                );
            }
        } catch (error) {
            addAlert(
                t('common:error'),
                t('messages.revalidationFailed'),
                <TriangleAlertIcon className="inline w-4 h-4 text-error" />,
            );
            logger.error(error);
        } finally {
            setBusyAction(null);
        }
    };

    const handleReinstall = async (release: InstalledRelease) => {
        setBusyAction({
            releaseKey: getReleaseActionKey(release),
            action: 'reinstall',
        });
        try {
            const result = await releaseActions.reinstall(release);

            if (result.success) {
                return;
            }

            addAlert(
                t('common:error'),
                result.error || t('messages.reinstallFailed'),
                <TriangleAlertIcon className="inline w-4 h-4 text-error" />,
            );
        } catch (error) {
            addAlert(
                t('common:error'),
                t('messages.reinstallFailed'),
                <TriangleAlertIcon className="inline w-4 h-4 text-error" />,
            );
            logger.error(error);
        } finally {
            setBusyAction(null);
        }
    };

    const handleRemove = async (release: InstalledRelease) => {
        if (isReleaseActionBusy(release)) {
            return;
        }
        setBusyAction({
            releaseKey: getReleaseActionKey(release),
            action: 'remove',
        });
        try {
            await releaseActions.remove(release);
        } finally {
            setBusyAction(null);
        }
    };

    return (
        <>
            <section
                className="flex flex-col h-full w-full overflow-auto p-1"
                aria-label={t('title')}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {isDraggingManifest && (
                    <div
                        className={`absolute inset-0 z-30 border-4 border-dashed flex items-center justify-center pointer-events-none ${
                            isDraggingSupportedManifest
                                ? 'bg-primary/20 border-primary'
                                : 'bg-error/20 border-error'
                        }`}
                    >
                        <div className="bg-base-100 p-8 rounded-lg shadow-xl max-w-lg text-center flex flex-col gap-3">
                            <BadgePlus
                                className={`w-10 h-10 mx-auto ${
                                    isDraggingSupportedManifest
                                        ? 'text-primary'
                                        : 'text-error'
                                }`}
                            />
                            <p
                                className={`text-2xl font-bold ${
                                    isDraggingSupportedManifest
                                        ? 'text-primary'
                                        : 'text-error'
                                }`}
                            >
                                {isDraggingSupportedManifest
                                    ? t('customEditor.drop.title')
                                    : t('customEditor.drop.unsupportedTitle')}
                            </p>
                            <p className="text-sm text-base-content/70">
                                {t('customEditor.drop.helperPrefix')}{' '}
                                <code className="font-mono bg-base-300 px-2 rounded text-warning">
                                    godotlauncher-editor-manifest.json
                                </code>{' '}
                                {t('customEditor.drop.helperSuffix')}
                            </p>
                        </div>
                    </div>
                )}
                <div className="flex flex-col gap-2 w-full">
                    <div className="flex flex-row justify-between">
                        <h1 data-testid="installsTitle" className="text-2xl">
                            {t('title')}
                        </h1>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                data-testid="btnAddCustomEngine"
                                className="btn btn-neutral"
                                onClick={handleAddCustomEngine}
                            >
                                {t('buttons.addCustomEditor')}
                            </button>
                            <button
                                type="button"
                                data-testid="btnInstallEditor"
                                className="btn btn-primary"
                                onClick={() => setInstallOpen(true)}
                            >
                                {t('buttons.install')}
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-row justify-end my-2 items-center">
                        <input
                            type="text"
                            placeholder={t('search.placeholder')}
                            className="input input-bordered w-full max-w-xs"
                            onChange={(e) => setTextSearch(e.target.value)}
                            value={textSearch}
                        />
                        {textSearch.length > 0 && (
                            <button
                                type="button"
                                tabIndex={-1}
                                onClick={() => setTextSearch('')}
                                className="absolute right-4 w-6 h-6"
                            >
                                <CircleX />
                            </button>
                        )}
                    </div>
                </div>
                <div className="divider m-0"></div>

                {installedReleases.length < 1 &&
                downloadingReleases.length < 1 ? (
                    <div className="text-warning flex gap-2">
                        <TriangleAlert className="stroke-warning" />
                        <Trans
                            ns="installs"
                            i18nKey="messages.noReleasesCta"
                            components={{
                                Link: (
                                    <button
                                        type="button"
                                        onClick={() => setInstallOpen(true)}
                                        className="underline cursor-pointer"
                                    />
                                ),
                            }}
                        />
                    </div>
                ) : (
                    <div className="overflow-auto h-full">
                        <table className="table table-md">
                            <thead className="sticky top-0 bg-base-200 text-xs">
                                <tr>
                                    <th>{t('table.name')}</th>
                                    <th></th>
                                </tr>
                            </thead>

                            <tbody className="overflow-y-auto">
                                {getFilteredRows().map((row) => (
                                    <tr
                                        key={`installedReleaseRow_${row.version}_${row.mono ? 'mono' : 'standard'}`}
                                        className="even:bg-base-100 hover:bg-base-content/10"
                                    >
                                        <td>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex flex-row gap-2 flex-wrap items-center">
                                                    {row.valid === false && (
                                                        <TriangleAlert className="w-4 h-4 text-warning" />
                                                    )}
                                                    <span>
                                                        {row.name ??
                                                            row.version}
                                                    </span>
                                                    {row.source ===
                                                        'custom' && (
                                                        <span className="badge badge-info">
                                                            {t('badges.custom')}
                                                        </span>
                                                    )}
                                                    {row.mono && (
                                                        <span className="badge">
                                                            {t('badges.dotNet')}
                                                        </span>
                                                    )}
                                                    {row.prerelease && (
                                                        <span className="badge badge-secondary">
                                                            {t(
                                                                'badges.prerelease',
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                                {row.name && (
                                                    <div className="text-xs text-base-content/50">
                                                        {row.version}
                                                    </div>
                                                )}
                                                <div className="text-xs text-base-content/50 flex flex-col gap-1">
                                                    {row.valid === false ? (
                                                        <>
                                                            <span>
                                                                {row.source ===
                                                                'custom'
                                                                    ? t(
                                                                          'messages.unavailableCustomEditorHint',
                                                                      )
                                                                    : t(
                                                                          'messages.unavailableHintWithReinstall',
                                                                      )}
                                                            </span>
                                                            <div className="flex flex-row flex-wrap gap-2">
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-xs flex items-center gap-2"
                                                                    onClick={() =>
                                                                        handleRetry(
                                                                            row,
                                                                        )
                                                                    }
                                                                    disabled={isReleaseActionBusy(
                                                                        row,
                                                                    )}
                                                                >
                                                                    {isReleaseActionBusy(
                                                                        row,
                                                                        'retry',
                                                                    ) && (
                                                                        <span className="loading loading-spinner loading-xs"></span>
                                                                    )}
                                                                    {t(
                                                                        'buttons.retry',
                                                                        {
                                                                            ns: 'common',
                                                                        },
                                                                    )}
                                                                </button>
                                                                {row.source !==
                                                                    'custom' && (
                                                                    <button
                                                                        type="button"
                                                                        data-testid={`btnReinstallRelease_${row.version}_${row.mono ? 'mono' : 'standard'}`}
                                                                        className="btn btn-primary btn-xs flex items-center gap-2"
                                                                        onClick={() =>
                                                                            handleReinstall(
                                                                                row,
                                                                            )
                                                                        }
                                                                        disabled={isReleaseActionBusy(
                                                                            row,
                                                                        )}
                                                                        aria-label={t(
                                                                            'buttons.reinstall',
                                                                            {
                                                                                ns: 'common',
                                                                            },
                                                                        )}
                                                                    >
                                                                        {isReleaseActionBusy(
                                                                            row,
                                                                            'reinstall',
                                                                        ) && (
                                                                            <span className="loading loading-spinner loading-xs"></span>
                                                                        )}
                                                                        {t(
                                                                            'buttons.reinstall',
                                                                            {
                                                                                ns: 'common',
                                                                            },
                                                                        )}
                                                                    </button>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    data-testid={`btnRemoveRelease_${row.version}_${row.mono ? 'mono' : 'standard'}`}
                                                                    className="btn btn-error btn-xs"
                                                                    onClick={() =>
                                                                        handleRemove(
                                                                            row,
                                                                        )
                                                                    }
                                                                    disabled={isReleaseActionBusy(
                                                                        row,
                                                                    )}
                                                                >
                                                                    {isReleaseActionBusy(
                                                                        row,
                                                                        'remove',
                                                                    ) && (
                                                                        <span className="loading loading-spinner loading-xs"></span>
                                                                    )}
                                                                    {t(
                                                                        'buttons.remove',
                                                                        {
                                                                            ns: 'common',
                                                                        },
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        row.install_path || (
                                                            <div className="flex flex-row gap-2 items-center">
                                                                <div className="loading loading-ring loading-sm"></div>
                                                                {t(
                                                                    'status.installing',
                                                                )}
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="flex flex-row justify-end">
                                            {row.install_path &&
                                                row.valid !== false && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) =>
                                                            onOpenReleaseMoreOptions(
                                                                e,
                                                                row,
                                                            )
                                                        }
                                                        className="select-none outline-none relative flex items-center justify-center w-10 h-10 hover:bg-base-content/20 rounded-lg"
                                                    >
                                                        <EllipsisVertical />
                                                    </button>
                                                )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
            {installOpen && (
                <InstallEditorSubView onClose={() => setInstallOpen(false)} />
            )}
        </>
    );
};
