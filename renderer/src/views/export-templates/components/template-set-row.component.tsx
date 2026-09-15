import type { ExportTemplateSet, TemplateJob } from '@shared/contracts';
import { FileOutput, Settings, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../../../components/ui/tooltip.component';
import type { TemplateAction } from '../hooks/export-templates.hook';
import { isTemplateJobFinished } from '../hooks/export-templates.hook';
import { formatTemplateBytes } from '../template-format.util';
import { TemplatePlatformBadges } from './template-platform-badges.component';
import { TemplateReviewPanel } from './template-review.component';

type Props = {
    set: ExportTemplateSet;
    installed: boolean;
    job?: TemplateJob;
    pending: boolean;
    recovery: boolean;
    recoveryIds: string[];
    canRecover: boolean;
    onManage: () => void;
    onRemove: () => void;
    run: (action: TemplateAction) => Promise<boolean>;
};
/** Keeps progress, errors and file actions inside their affected collection row.
 * @param props - Installed collection and its queue entry.
 */
export function TemplateSetRow({
    set,
    installed,
    job,
    pending,
    recovery,
    recoveryIds,
    canRecover,
    onManage,
    onRemove,
    run,
}: Props) {
    const { t, i18n } = useTranslation('exportTemplates');
    const active = !!job && !isTemplateJobFinished(job);
    const showJob = job && !['complete', 'cancelled'].includes(job.stage);
    return (
        <article
            aria-label={set.id}
            aria-busy={active}
            className="flex items-start gap-3 rounded-md bg-base-content/2 px-3 py-3 text-base hover:bg-base-content/5"
        >
            {active ? (
                <span
                    className="loading loading-spinner mt-1.5 size-5 shrink-0 text-base-content/60"
                    aria-hidden="true"
                />
            ) : (
                <FileOutput
                    className="mt-1.5 size-5 shrink-0 text-base-content/60"
                    aria-hidden="true"
                />
            )}
            <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <h3 className="font-semibold">
                                {set.id.startsWith('job-') ||
                                set.id.startsWith('recovery-')
                                    ? t('picker.files')
                                    : `${set.version} - ${t(`editions.${set.edition}`)}`}
                            </h3>
                            {showJob && (
                                <p
                                    role="status"
                                    className="flex items-center gap-2 text-sm"
                                >
                                    {t(
                                        job.kind === 'remove' &&
                                            ['preparing', 'applying'].includes(
                                                job.stage,
                                            )
                                            ? 'stages.removing'
                                            : `stages.${job.stage}`,
                                    )}
                                </p>
                            )}
                            {showJob &&
                                ((active && job.stage !== 'applying') ||
                                    job.stage === 'error') && (
                                    <button
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        disabled={pending}
                                        onClick={() =>
                                            void run({
                                                type: 'cancel',
                                                jobId: job.id,
                                            })
                                        }
                                    >
                                        {t('cancel')}
                                    </button>
                                )}
                        </div>
                        {installed && (
                            <p className="text-sm text-base-content/70">
                                {formatTemplateBytes(
                                    set.sizeBytes,
                                    i18n.language,
                                )}{' '}
                                · {t('fileCount', { number: set.fileCount })}
                            </p>
                        )}
                    </div>
                    {installed && (
                        <div className="flex shrink-0 gap-2">
                            <Tooltip tip={t('manage')}>
                                <button
                                    type="button"
                                    aria-label={`${t('manage')} ${set.id}`}
                                    className="btn btn-sm btn-square btn-ghost bg-base-content/5"
                                    disabled={pending || active || recovery}
                                    onClick={onManage}
                                >
                                    <Settings className="size-4" />
                                </button>
                            </Tooltip>
                            <Tooltip tip={t('remove')} tone="error">
                                <button
                                    type="button"
                                    aria-label={`${t('remove')} ${set.id}`}
                                    className="btn btn-sm btn-ghost btn-square text-error/80 hover:text-error hover:bg-error/20 hover:border-transparent"
                                    disabled={pending || active || recovery}
                                    onClick={onRemove}
                                >
                                    <Trash2 className="size-4" />
                                </button>
                            </Tooltip>
                        </div>
                    )}
                </div>
                {installed && (
                    <TemplatePlatformBadges platforms={set.platforms} />
                )}
                {showJob &&
                    ['downloading', 'error', 'review'].includes(job.stage) && (
                        <div className="space-y-2">
                            {job.stage === 'downloading' && (
                                <>
                                    <progress
                                        className="progress progress-primary"
                                        aria-label={t('download')}
                                        max={job.totalBytes || 1}
                                        value={
                                            job.totalBytes
                                                ? (job.receivedBytes ?? 0)
                                                : undefined
                                        }
                                    />
                                    <p className="text-sm text-base-content/70">
                                        {formatTemplateBytes(
                                            job.receivedBytes ?? 0,
                                            i18n.language,
                                        )}
                                        {job.totalBytes
                                            ? ` / ${formatTemplateBytes(job.totalBytes, i18n.language)}`
                                            : ''}
                                    </p>
                                </>
                            )}
                            {job.error && (
                                <p role="alert" className="text-sm text-error">
                                    {t(
                                        job.error.match(
                                            /exportTemplates:([\w.]+)/,
                                        )?.[1] ?? 'errors.failed',
                                    )}
                                </p>
                            )}
                            {job.stage === 'error' && (
                                <button
                                    type="button"
                                    className="btn btn-sm btn-ghost"
                                    disabled={pending || recovery}
                                    onClick={() =>
                                        void run({
                                            type: 'retry',
                                            jobId: job.id,
                                        })
                                    }
                                >
                                    {t('retry')}
                                </button>
                            )}
                            {job.stage === 'review' &&
                                job.review &&
                                (!job.setIds?.length ||
                                    job.setIds[0] === set.id) && (
                                    <TemplateReviewPanel
                                        review={job.review}
                                        pending={pending}
                                        onApply={(decisions) =>
                                            void run({
                                                type: 'apply',
                                                jobId: job.id,
                                                decisions,
                                            })
                                        }
                                    />
                                )}
                        </div>
                    )}
                {!!recoveryIds.length && (
                    <div className="space-y-2 border-t border-warning/30 pt-3">
                        <p className="text-sm text-warning">
                            {t('recoveryDetail')}
                        </p>
                        {recoveryIds.map((id) => (
                            <button
                                key={id}
                                type="button"
                                className="btn btn-warning btn-sm"
                                disabled={pending || !canRecover}
                                onClick={() =>
                                    void run({
                                        type: 'recover',
                                        recoveryId: id,
                                    })
                                }
                            >
                                {t('recover')}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </article>
    );
}
