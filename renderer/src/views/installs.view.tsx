import type { InstalledRelease, InstallReleaseResult } from '@shared';
import logger from 'electron-log';

import { CheckCircle2, TriangleAlert, TriangleAlertIcon } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
    type ActionMenuAnchorRect,
    getActionMenuAnchorRect,
} from '../components/ui/actionMenu.component';
import { WaitingForDialogOverlay } from '../components/waitingForDialogOverlay.component';
import { useAlerts } from '../hooks/useAlerts';
import { usePreferences } from '../hooks/usePreferences';
import { useRelease } from '../hooks/useRelease';
import { CustomEditorManifestDropOverlay } from './installs/components/customEditorManifestDropOverlay.component';
import { InstalledReleaseList } from './installs/components/installedReleaseList.component';
import { InstallsHeader } from './installs/components/installsHeader.component';
import { ReleaseActionsMenu } from './installs/components/releaseActionsMenu.component';
import {
    getFilteredInstalledReleaseRows,
    getReleaseActionKey,
    isSupportedCustomEngineManifestName,
    type ReleaseAction,
} from './installs/installsView.model';
import { CustomEditorManifestDrawer } from './subViews/customEditorManifestDrawer.subview';
import { InstallEditorSubView } from './subViews/installEditor.subview';

type ReleaseActionDependencies = {
    checkAllReleasesValid: () => Promise<InstalledRelease[]>;
    reinstallRelease: (
        release: InstalledRelease,
    ) => Promise<InstallReleaseResult>;
    removeRelease: (release: InstalledRelease) => Promise<unknown>;
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

type InstallsViewProps = {
    installOpen?: boolean;
    onInstallOpenChange?: (open: boolean) => void;
};

export const InstallsView: React.FC<InstallsViewProps> = ({
    installOpen: controlledInstallOpen,
    onInstallOpenChange,
}) => {
    const { t } = useTranslation(['installs', 'common', 'menus', 'dialogs']);
    const [textSearch, setTextSearch] = useState<string>('');
    const [localInstallOpen, setLocalInstallOpen] = useState<boolean>(false);
    const installOpen = controlledInstallOpen ?? localInstallOpen;
    const setInstallOpen = (open: boolean) => {
        if (onInstallOpenChange) {
            onInstallOpenChange(open);
            return;
        }

        setLocalInstallOpen(open);
    };
    const [isDraggingManifest, setIsDraggingManifest] =
        useState<boolean>(false);
    const [isDraggingSupportedManifest, setIsDraggingSupportedManifest] =
        useState<boolean>(true);
    const [selectingCustomEditorManifest, setSelectingCustomEditorManifest] =
        useState<boolean>(false);
    const [customEditorManifestDrawerOpen, setCustomEditorManifestDrawerOpen] =
        useState<boolean>(false);
    const [releaseActionsMenu, setReleaseActionsMenu] = useState<{
        release: InstalledRelease;
        anchorRect: ActionMenuAnchorRect;
    } | null>(null);
    const dragCounterRef = useRef<number>(0);

    const { addAlert, addConfirm } = useAlerts();
    const { preferences } = usePreferences();
    const {
        installedReleases,
        downloadingReleases,
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
        setReleaseActionsMenu({
            release,
            anchorRect: getActionMenuAnchorRect(e.currentTarget),
        });
    };

    const showReleaseActionError = (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        addAlert(
            t('common:error'),
            message,
            <TriangleAlertIcon className="inline w-4 h-4 text-error" />,
        );
    };

    const runReleaseAction = (action: () => Promise<void>) => {
        void action().catch(showReleaseActionError);
    };

    const handleRemoveReleaseFromMenu = (release: InstalledRelease) => {
        addConfirm(
            release.source === 'custom'
                ? t('dialogs:removeCustomEditor.title')
                : t('dialogs:removeRelease.title'),
            <div className="flex flex-col gap-2">
                <p>
                    {release.source === 'custom'
                        ? t('dialogs:removeCustomEditor.message', {
                              name: release.name ?? release.version,
                          })
                        : t('dialogs:removeRelease.message', {
                              version: release.version,
                          })}
                </p>
                <p>
                    {release.source === 'custom'
                        ? t('dialogs:removeCustomEditor.detail')
                        : t('dialogs:removeRelease.detail')}
                </p>
            </div>,
            async () => {
                try {
                    const result = await removeRelease(release);
                    if (!result.success) {
                        addAlert(
                            t('dialogs:removeRelease.error'),
                            result.error ??
                                t('dialogs:removeRelease.errorMessage'),
                            <TriangleAlertIcon className="inline w-4 h-4 text-error" />,
                        );
                    }
                } catch (error) {
                    showReleaseActionError(error);
                }
                return true;
            },
            undefined,
            <TriangleAlertIcon className="inline w-4 h-4 text-warning" />,
        );
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
        options: { onSuccess?: () => void } = {},
    ): Promise<boolean> => {
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
                options.onSuccess?.();
                return true;
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
                        void registerManifest(manifestPath, true, options);
                        return true;
                    },
                    undefined,
                    <TriangleAlertIcon className="inline w-4 h-4 text-warning" />,
                );
                return false;
            }

            addAlert(
                t('common:error'),
                result.error ?? t('messages.registerCustomEditorFailed'),
                <TriangleAlertIcon className="inline w-4 h-4 text-error" />,
            );
            return false;
        } catch (error) {
            addAlert(
                t('common:error'),
                (error as Error).message,
                <TriangleAlertIcon className="inline w-4 h-4 text-error" />,
            );
            return false;
        }
    };

    const handleAddCustomEngine = async () => {
        setSelectingCustomEditorManifest(true);
        try {
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
        } finally {
            setSelectingCustomEditorManifest(false);
        }
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

    const filteredRows = getFilteredInstalledReleaseRows(
        installedReleases,
        downloadingReleases,
        textSearch,
    );

    return (
        <>
            {selectingCustomEditorManifest && (
                <WaitingForDialogOverlay
                    className="z-20"
                    message={t('customEditor.waitingForDialog')}
                />
            )}
            <section
                className="flex flex-col h-full w-full overflow-auto p-1"
                aria-label={t('title')}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {isDraggingManifest && (
                    <CustomEditorManifestDropOverlay
                        supported={isDraggingSupportedManifest}
                        t={t}
                    />
                )}
                <InstallsHeader
                    title={t('title')}
                    installLocation={preferences?.install_location}
                    searchPlaceholder={t('search.placeholder')}
                    searchValue={textSearch}
                    onSearchChange={setTextSearch}
                    addCustomEditorLabel={t('buttons.addCustomEditor')}
                    selectManifestLabel={t(
                        'buttons.selectCustomEditorManifest',
                    )}
                    createManifestLabel={t(
                        'buttons.createCustomEditorManifest',
                    )}
                    installLabel={t('buttons.install')}
                    copyPathLabel={t('common:buttons.copyPath')}
                    copiedLabel={t('common:success')}
                    onSelectManifest={() => void handleAddCustomEngine()}
                    onCreateManifest={() =>
                        setCustomEditorManifestDrawerOpen(true)
                    }
                    onInstall={() => setInstallOpen(true)}
                />
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
                    <InstalledReleaseList
                        rows={filteredRows}
                        t={t}
                        isReleaseActionBusy={isReleaseActionBusy}
                        onRetry={(release) => void handleRetry(release)}
                        onReinstall={(release) => void handleReinstall(release)}
                        onRemove={(release) => void handleRemove(release)}
                        onOpenReleaseMoreOptions={onOpenReleaseMoreOptions}
                    />
                )}
            </section>
            <ReleaseActionsMenu
                release={releaseActionsMenu?.release ?? null}
                anchorRect={releaseActionsMenu?.anchorRect ?? null}
                t={t}
                onClose={() => setReleaseActionsMenu(null)}
                onOpenInstalledFolder={(release) =>
                    runReleaseAction(() =>
                        window.electron.openShellFolder(release.install_path),
                    )
                }
                onStartProjectManager={(release) =>
                    runReleaseAction(() =>
                        window.electron.openEditorProjectManager(release),
                    )
                }
                onRemoveRelease={handleRemoveReleaseFromMenu}
            />
            {installOpen && (
                <InstallEditorSubView onClose={() => setInstallOpen(false)} />
            )}
            <CustomEditorManifestDrawer
                open={customEditorManifestDrawerOpen}
                onOpenChange={setCustomEditorManifestDrawerOpen}
                onManifestCreated={(manifestPath) =>
                    registerManifest(manifestPath, false, {
                        onSuccess: () =>
                            setCustomEditorManifestDrawerOpen(false),
                    })
                }
            />
        </>
    );
};
