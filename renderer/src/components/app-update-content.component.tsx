import type { AppUpdateMessage } from '@shared/contracts';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LAUNCHER_DOWNLOAD_URL } from '../app.constants';
import { getAppUpdateMessage } from './app-update-message.util';
import { getAppReleaseNotesUrl } from './app-update-url.util';

type AppUpdateContentProps = {
    updateAvailable: AppUpdateMessage;
    installAndRelaunch: () => Promise<void>;
    downloadAppUpdate: () => Promise<void>;
    retryAppUpdate: () => Promise<void>;
    skipAppUpdate: (version: string) => Promise<void>;
    openUpdateUrl: (url: string) => Promise<void>;
    onLater?: () => void;
    titleId?: string;
};

/**
 * Shows update instructions and actions in the sidebar popover.
 * @param props - Current update and the existing update actions.
 */
export function AppUpdateContent({
    updateAvailable: update,
    installAndRelaunch,
    downloadAppUpdate,
    retryAppUpdate,
    skipAppUpdate,
    openUpdateUrl,
    onLater,
    titleId,
}: AppUpdateContentProps) {
    const { t } = useTranslation('common');
    const [failure, setFailure] = useState<string>();
    const [pending, setPending] = useState(false);
    const [opening, setOpening] = useState(false);
    const notesUrl = getAppReleaseNotesUrl(update.version);
    const version = notesUrl ? update.version : undefined;
    const state = update.type === 'manual' ? 'available' : update.type;
    const percent = Number.isFinite(update.progressPercent)
        ? Math.round(Math.min(100, Math.max(0, update.progressPercent ?? 0)))
        : undefined;

    /**
     * Keeps failed actions recoverable without losing the update controls.
     * @param action - Update or external-link action to perform.
     * @param failureKey - Localised recovery message for a rejected action.
     * @param external - Whether this action opens an external link.
     */
    async function perform(
        action: () => Promise<void>,
        failureKey: string,
        external = false,
    ) {
        const setBusy = external ? setOpening : setPending;
        setFailure(undefined);
        setBusy(true);
        try {
            await action();
        } catch {
            setFailure(failureKey);
        } finally {
            setBusy(false);
        }
    }

    const description =
        update.type === 'available'
            ? t('app.update.panel.installAfterDownload')
            : update.type === 'downloading'
              ? undefined
              : update.type === 'error' ||
                  update.type === 'checking' ||
                  update.type === 'none'
                ? getAppUpdateMessage(update, t)
                : t(`app.update.panel.${update.type}`);
    const hasActions =
        update.type === 'available' ||
        update.type === 'ready' ||
        update.type === 'manual' ||
        (update.type === 'error' && Boolean(update.failedOperation));

    return (
        <div
            data-testid="appUpdateContent"
            className="flex flex-col gap-5 text-sm"
        >
            <div className="max-w-[23.5rem] pr-8">
                <p className="mb-1 text-xs text-base-content/60">
                    {state === 'checking' || state === 'none'
                        ? t(`app.update.${state}`)
                        : t(`app.update.notification.${state}`)}
                </p>
                <h2
                    id={titleId}
                    data-testid="appUpdateTitle"
                    className="text-base font-semibold"
                >
                    {version
                        ? t('app.update.panel.titleWithVersion', { version })
                        : t('app.update.panel.title')}
                </h2>
            </div>
            {description && (
                <p className="max-w-[23.5rem] text-base-content/75">
                    {description}
                </p>
            )}
            {update.type === 'downloading' && (
                <div className="w-[23.5rem] max-w-full space-y-2">
                    <div className="flex justify-between gap-3 text-xs text-base-content/60">
                        <span>{t('app.update.panel.downloadProgress')}</span>
                        {percent !== undefined && <span>{percent}%</span>}
                    </div>
                    <progress
                        data-testid="appUpdateProgress"
                        className="progress progress-primary block h-1 w-full"
                        aria-label={t('app.update.panel.downloadProgress')}
                        max={100}
                        value={percent}
                    />
                </div>
            )}
            {notesUrl && (
                <button
                    type="button"
                    data-testid="btnAppUpdateReleaseNotes"
                    className="link link-primary inline-flex w-fit items-center gap-1"
                    disabled={opening}
                    onClick={() =>
                        perform(
                            () => openUpdateUrl(notesUrl),
                            'app.update.panel.openFailed',
                            true,
                        )
                    }
                >
                    {t('app.update.panel.readReleaseNotes')}
                    <ExternalLink size={14} aria-hidden="true" />
                </button>
            )}
            {(hasActions || (update.downloaded && onLater)) && (
                <div
                    data-testid="appUpdateActions"
                    className="flex w-max flex-nowrap items-center gap-2 [&>button]:shrink-0 [&>button]:whitespace-nowrap"
                >
                    {update.type === 'available' && (
                        <button
                            type="button"
                            data-testid="btnAppUpdateDownload"
                            className="btn btn-primary btn-sm"
                            disabled={pending}
                            onClick={() =>
                                perform(
                                    downloadAppUpdate,
                                    'app.update.panel.actionFailed',
                                )
                            }
                        >
                            {t('app.update.panel.download')}
                        </button>
                    )}
                    {update.type === 'ready' && (
                        <button
                            type="button"
                            data-testid="btnAppUpdateRestart"
                            className="btn btn-primary btn-sm"
                            disabled={pending}
                            onClick={() =>
                                perform(
                                    installAndRelaunch,
                                    'app.update.panel.actionFailed',
                                )
                            }
                        >
                            {t('app.update.panel.restart')}
                        </button>
                    )}
                    {update.type === 'manual' && (
                        <button
                            type="button"
                            data-testid="btnAppUpdateManual"
                            className="btn btn-primary btn-sm"
                            disabled={opening}
                            onClick={() =>
                                perform(
                                    () =>
                                        openUpdateUrl(
                                            update.url ?? LAUNCHER_DOWNLOAD_URL,
                                        ),
                                    'app.update.panel.openFailed',
                                    true,
                                )
                            }
                        >
                            {t('app.update.panel.downloadManually')}
                            <ExternalLink size={14} aria-hidden="true" />
                        </button>
                    )}
                    {update.type === 'error' && update.failedOperation && (
                        <button
                            type="button"
                            data-testid="btnAppUpdateRetry"
                            className="btn btn-primary btn-sm"
                            disabled={pending}
                            onClick={() =>
                                perform(
                                    retryAppUpdate,
                                    'app.update.panel.actionFailed',
                                )
                            }
                        >
                            {t('buttons.retry')}
                        </button>
                    )}
                    {version &&
                        (update.type === 'available' ||
                            update.type === 'manual') && (
                            <button
                                type="button"
                                data-testid="btnAppUpdateSkip"
                                className="btn btn-ghost btn-sm"
                                disabled={pending}
                                onClick={() =>
                                    perform(
                                        () => skipAppUpdate(version),
                                        'app.update.panel.actionFailed',
                                    )
                                }
                            >
                                {t('app.update.panel.skip')}
                            </button>
                        )}
                    {update.downloaded && onLater && (
                        <button
                            type="button"
                            data-testid="btnAppUpdateLater"
                            onClick={() => onLater()}
                            className="btn btn-ghost btn-sm"
                        >
                            {t('app.update.panel.later')}
                        </button>
                    )}
                </div>
            )}
            {failure && (
                <p role="alert" className="max-w-[23.5rem] text-error">
                    {t(failure)}
                </p>
            )}
        </div>
    );
}
