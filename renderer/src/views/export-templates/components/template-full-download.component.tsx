import type { TemplateJob } from '@shared/contracts';
import { CheckCircle, Info, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getTemplateDownloadFailure } from '../template-download-error.util';
import { formatTemplateBytes } from '../template-format.util';

type StatusProps = {
    part: 'status';
    job?: TemplateJob;
    failure?: string;
    controlFailure?: string;
};
type ActionsProps = {
    part: 'actions';
    job?: TemplateJob;
    failure?: string;
    pending: boolean;
    canCancel: boolean;
    onRetry: () => void;
    onCancel: () => void;
    onRefresh: () => void;
    onChooseVersion: () => void;
    onImport: () => void;
    onDone: () => void;
};
type Props = StatusProps | ActionsProps;

/** Renders complete-package status in Template files or controls in the action footer.
 * @param props - Retained main-process job and explicit user actions.
 */
export function TemplateFullDownload(props: Props) {
    const { job, failure } = props;
    const { t, i18n } = useTranslation(['exportTemplates', 'common']);
    const cancelled =
        job?.stage === 'cancelled' ||
        failure === 'exportTemplates:picker.fullCancelled';
    const complete = job?.stage === 'complete';
    const error = cancelled
        ? undefined
        : failure ||
          (job?.stage === 'error'
              ? (job.error ?? 'exportTemplates:errors.failed')
              : undefined);
    const classified = getTemplateDownloadFailure(error);
    const recovery =
        classified.key === 'errors.downloadChanged'
            ? { key: 'errors.fullChanged', action: 'choose' as const }
            : error?.includes('exportTemplates:errors.failed')
              ? { key: 'picker.installFailed', action: 'retry' as const }
              : ['errors.space', 'errors.busy', 'errors.read'].includes(
                      classified.key,
                  )
                ? { ...classified, action: 'retry' as const }
                : classified;
    const active = !complete && !cancelled && !error;
    const stage = job?.stage ?? 'queued';
    const message = complete
        ? 'picker.fullComplete'
        : cancelled
          ? 'picker.fullCancelled'
          : error
            ? recovery.key
            : stage === 'downloading'
              ? 'picker.fullDownloading'
              : stage === 'applying'
                ? 'picker.fullInstalling'
                : job?.fullPackage?.extracting
                  ? 'picker.fullExtracting'
                  : stage === 'queued'
                    ? 'stages.queued'
                    : 'stages.preparing';
    if (props.part === 'actions') {
        const {
            pending,
            canCancel,
            onRetry,
            onCancel,
            onRefresh,
            onChooseVersion,
            onImport,
            onDone,
        } = props;
        return (
            <div className="flex flex-wrap justify-end gap-2">
                {active ? (
                    <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={pending || !canCancel || stage === 'applying'}
                        onClick={onCancel}
                    >
                        {t('common:buttons.cancel')}
                    </button>
                ) : (
                    <>
                        {!complete && (
                            <button
                                type="button"
                                className="btn btn-primary"
                                disabled={pending}
                                onClick={
                                    cancelled || recovery.action === 'retry'
                                        ? onRetry
                                        : recovery.action === 'refresh'
                                          ? onRefresh
                                          : onChooseVersion
                                }
                            >
                                {t(
                                    cancelled || recovery.action === 'retry'
                                        ? 'picker.tryAgain'
                                        : recovery.action === 'refresh'
                                          ? 'picker.refreshFiles'
                                          : 'picker.chooseAnotherVersion',
                                )}
                            </button>
                        )}
                        {!complete && (
                            <button
                                type="button"
                                className="btn btn-ghost"
                                disabled={pending}
                                onClick={onImport}
                            >
                                {t('import')}
                            </button>
                        )}
                        <button
                            type="button"
                            className={`btn ${complete ? 'btn-primary' : 'btn-ghost'}`}
                            disabled={pending}
                            onClick={onDone}
                        >
                            {t('picker.done')}
                        </button>
                    </>
                )}
            </div>
        );
    }
    return (
        <div
            className="flex w-full min-w-0 shrink-0 flex-col gap-3 rounded-lg border border-base-300 bg-base-200/40 p-4"
            data-testid="templateFullDownload"
        >
            <div
                role={error ? 'alert' : 'status'}
                className={`flex items-start gap-2 text-sm ${error ? 'text-error-content dark:text-error' : complete ? 'text-success-content dark:text-success' : 'text-base-content'}`}
            >
                {error ? (
                    <TriangleAlert
                        className="mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                    />
                ) : complete ? (
                    <CheckCircle
                        className="mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                    />
                ) : cancelled ? (
                    <Info
                        className="mt-0.5 size-4 shrink-0"
                        aria-hidden="true"
                    />
                ) : (
                    <span
                        className="loading loading-spinner loading-sm shrink-0 text-primary"
                        aria-hidden="true"
                    />
                )}
                <p>{t(message)}</p>
            </div>
            {active && (
                <>
                    <progress
                        className="progress progress-primary w-full"
                        aria-label={t(message)}
                        max={job?.totalBytes || 1}
                        value={
                            job?.totalBytes &&
                            ['downloading', 'preparing'].includes(stage)
                                ? (job.receivedBytes ?? 0)
                                : undefined
                        }
                    />
                    {!!job?.totalBytes && (
                        <p className="text-sm text-base-content/70">
                            {formatTemplateBytes(
                                job.receivedBytes ?? 0,
                                i18n.language,
                            )}{' '}
                            /{' '}
                            {formatTemplateBytes(job.totalBytes, i18n.language)}
                        </p>
                    )}
                </>
            )}
            {active && props.controlFailure && (
                <p
                    role="alert"
                    className="text-sm text-error-content dark:text-error"
                >
                    {t('picker.fullCancelFailed')}
                </p>
            )}
        </div>
    );
}
