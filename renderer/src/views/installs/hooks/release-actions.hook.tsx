import type {
    InstalledRelease,
    InstallReleaseResult,
    RemovedReleaseResult,
} from '@shared/contracts';
import logger from 'electron-log';
import { TriangleAlertIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CopyButton } from '../../../components/ui/copy-button.component';
import type { useAlerts } from '../../../hooks/alerts.hook';
import { RemoveEditorConfirm } from '../components/remove-editor-confirm.component';
import {
    getReleaseActionKey,
    type ReleaseAction,
} from '../installs-view.model';

type Translate = (key: string, options?: Record<string, unknown>) => string;

type ReleaseActionDependencies = {
    checkAllReleasesValid: () => Promise<InstalledRelease[]>;
    reinstallRelease: (
        release: InstalledRelease,
    ) => Promise<InstallReleaseResult>;
    removeRelease: (release: InstalledRelease) => Promise<RemovedReleaseResult>;
};

type UseReleaseActionsArgs = {
    t: Translate;
    addAlert: ReturnType<typeof useAlerts>['addAlert'];
    addCustomConfirm: ReturnType<typeof useAlerts>['addCustomConfirm'];
    checkAllReleasesValid: () => Promise<InstalledRelease[]>;
    reinstallRelease: (
        release: InstalledRelease,
    ) => Promise<InstallReleaseResult>;
    removeRelease: (release: InstalledRelease) => Promise<RemovedReleaseResult>;
    getProjectUsageCount: (release: InstalledRelease) => number;
};

export const createReleaseActions = (
    dependencies: ReleaseActionDependencies,
) => ({
    retry: async () => dependencies.checkAllReleasesValid(),
    reinstall: async (release: InstalledRelease) => {
        return await dependencies.reinstallRelease(release);
    },
    remove: async (release: InstalledRelease) => {
        return await dependencies.removeRelease(release);
    },
});

export function useReleaseActions({
    t,
    addAlert,
    addCustomConfirm,
    checkAllReleasesValid,
    reinstallRelease,
    removeRelease,
    getProjectUsageCount,
}: UseReleaseActionsArgs) {
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

    const showReleaseActionError = (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        addAlert(
            t('common:error'),
            message,
            <TriangleAlertIcon className="inline" />,
        );
    };

    const runReleaseAction = (action: () => Promise<void>) => {
        void action().catch(showReleaseActionError);
    };

    /**
     * Removes one editor while exposing its busy state to the list.
     *
     * @param release - Editor to remove.
     * @returns The removal result, or undefined when already busy.
     */
    const handleRemove = async (
        release: InstalledRelease,
    ): Promise<RemovedReleaseResult | undefined> => {
        if (isReleaseActionBusy(release)) {
            return undefined;
        }
        setBusyAction({
            releaseKey: getReleaseActionKey(release),
            action: 'remove',
        });
        try {
            return await releaseActions.remove(release);
        } finally {
            setBusyAction(null);
        }
    };

    /**
     * Opens the stateful removal confirmation for an installed editor.
     * @param release - Editor whose removal must be confirmed.
     */
    const handleRemoveReleaseFromMenu = (release: InstalledRelease) => {
        const projectUsageCount = getProjectUsageCount(release);
        const custom = release.source === 'custom';
        addCustomConfirm(
            t(
                custom
                    ? 'dialogs:removeCustomEditor.title'
                    : 'dialogs:removeRelease.title',
            ),
            (renderLayout, close) => (
                <RemoveEditorConfirm
                    renderLayout={renderLayout}
                    close={close}
                    message={
                        custom
                            ? t('dialogs:removeCustomEditor.message', {
                                  name: release.name ?? release.version,
                              })
                            : t('dialogs:removeRelease.message', {
                                  version: release.version,
                              })
                    }
                    detail={t(
                        custom
                            ? 'dialogs:removeCustomEditor.detail'
                            : 'dialogs:removeRelease.detail',
                    )}
                    usage={t('dialogs:removeRelease.usage', {
                        count: projectUsageCount,
                    })}
                    usageCount={projectUsageCount}
                    cancelLabel={t('common:buttons.cancel')}
                    removeLabel={t('common:buttons.remove')}
                    failureMessage={t('dialogs:removeRelease.errorMessage')}
                    onRemove={() => handleRemove(release)}
                />
            ),
            [],
            undefined,
            'warning',
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

            addAlert(
                t('common:warning'),
                <div className="flex flex-col gap-4 text-base">
                    <p className="break-words text-base-content/75">
                        {t('messages.revalidationStillMissingNoPath', {
                            version: release.version,
                        })}
                    </p>
                    {rawPath && (
                        <div className="flex items-center gap-2 rounded-box bg-base-200/60 p-3">
                            <p className="min-w-0 flex-1 select-none break-all font-mono text-sm text-base-content/75">
                                {rawPath}
                            </p>
                            <div className="shrink-0">
                                <CopyButton value={rawPath} />
                            </div>
                        </div>
                    )}
                </div>,
                undefined,
                'warning',
            );
        } catch (error) {
            addAlert(
                t('common:error'),
                t('messages.revalidationFailed'),
                <TriangleAlertIcon className="inline" />,
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

            if (result.success || result.cancelled) {
                return;
            }

            addAlert(
                t('common:error'),
                result.error || t('messages.reinstallFailed'),
                <TriangleAlertIcon className="inline" />,
            );
        } catch (error) {
            addAlert(
                t('common:error'),
                t('messages.reinstallFailed'),
                <TriangleAlertIcon className="inline" />,
            );
            logger.error(error);
        } finally {
            setBusyAction(null);
        }
    };

    return {
        isReleaseActionBusy,
        runReleaseAction,
        handleRemoveReleaseFromMenu,
        handleRetry,
        handleReinstall,
    };
}
