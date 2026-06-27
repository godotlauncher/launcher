import type {
    InstalledRelease,
    InstallReleaseResult,
    RemovedReleaseResult,
} from '@shared';
import logger from 'electron-log';
import { TriangleAlertIcon } from 'lucide-react';
import type React from 'react';
import { useMemo, useState } from 'react';
import {
    type ActionMenuAnchorRect,
    getActionMenuAnchorRect,
} from '../../../components/ui/actionMenu.component';
import { getReleaseActionKey, type ReleaseAction } from '../installsView.model';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ReleaseActionDependencies = {
    checkAllReleasesValid: () => Promise<InstalledRelease[]>;
    reinstallRelease: (
        release: InstalledRelease,
    ) => Promise<InstallReleaseResult>;
    removeRelease: (release: InstalledRelease) => Promise<unknown>;
};

type UseReleaseActionsArgs = {
    t: Translate;
    addAlert: (
        title: string,
        message: React.ReactNode,
        icon?: React.ReactNode,
    ) => void;
    addConfirm: (
        title: string,
        content: React.ReactNode,
        onOk: () => boolean | Promise<boolean | undefined>,
        onCancel?: () => boolean | Promise<boolean | undefined>,
        icon?: React.ReactNode,
    ) => void;
    checkAllReleasesValid: () => Promise<InstalledRelease[]>;
    reinstallRelease: (
        release: InstalledRelease,
    ) => Promise<InstallReleaseResult>;
    removeRelease: (release: InstalledRelease) => Promise<RemovedReleaseResult>;
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

export function useReleaseActions({
    t,
    addAlert,
    addConfirm,
    checkAllReleasesValid,
    reinstallRelease,
    removeRelease,
}: UseReleaseActionsArgs) {
    const [releaseActionsMenu, setReleaseActionsMenu] = useState<{
        release: InstalledRelease;
        anchorRect: ActionMenuAnchorRect;
    } | null>(null);
    const [busyAction, setBusyAction] = useState<{
        releaseKey: string;
        action: ReleaseAction;
    } | null>(null);

    const releaseActions = useMemo(
        () =>
            createReleaseActions({
                checkAllReleasesValid,
                reinstallRelease,
                removeRelease,
            }),
        [checkAllReleasesValid, reinstallRelease, removeRelease],
    );

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

    return {
        releaseActionsMenu,
        setReleaseActionsMenu,
        isReleaseActionBusy,
        onOpenReleaseMoreOptions,
        runReleaseAction,
        handleRemoveReleaseFromMenu,
        handleRetry,
        handleReinstall,
        handleRemove,
    };
}
