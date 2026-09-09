import type { ReleaseInstallProgress } from '@shared/contracts';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from './ui/tooltip.component';

type ReleaseInstallProgressProps = {
    progress: ReleaseInstallProgress;
    className?: string;
    onCancel?: (jobId: string) => void;
};

function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) {
        return `${Math.round(bytes / 1024)} KB`;
    }

    return `${Math.round(bytes / (1024 * 1024))} MB`;
}

type Translate = (
    key: string,
    options?: Record<string, string | number>,
) => string;

function getStageLabel(progress: ReleaseInstallProgress, t: Translate): string {
    switch (progress.stage) {
        case 'queued':
            return progress.queuePosition
                ? t('progress.queuedPosition', {
                      position: progress.queuePosition,
                  })
                : t('progress.queued');
        case 'preparing':
            return t('progress.preparing');
        case 'downloading':
            return t('progress.downloading');
        case 'cancelling':
            return t('progress.cancelling');
        case 'extracting':
            return t('progress.extracting');
        case 'registering':
            return t('progress.registering');
        case 'validating':
            return t('progress.validating');
        case 'complete':
            return t('progress.complete');
        case 'cancelled':
            return t('progress.cancelled');
        case 'error':
            return t('progress.failed');
    }
}

function getDisplayPercent(
    progress: ReleaseInstallProgress,
): number | undefined {
    if (progress.stage === 'registering') {
        return progress.percent ?? 95;
    }

    if (progress.stage === 'validating') {
        return progress.percent ?? 98;
    }

    return progress.percent;
}

function getByteLabel(progress: ReleaseInstallProgress): string | undefined {
    if (progress.stage !== 'downloading' || !progress.receivedBytes) {
        return undefined;
    }

    if (!progress.totalBytes) {
        return formatBytes(progress.receivedBytes);
    }

    return `${formatBytes(progress.receivedBytes)} / ${formatBytes(
        progress.totalBytes,
    )}`;
}

/**
 * Renders readable installation progress with a compact cancellation action.
 *
 * @param props - The progress state and optional style classes.
 * @returns The editor installation progress indicator.
 */
export const ReleaseInstallProgressIndicator: React.FC<
    ReleaseInstallProgressProps
> = ({ progress, className, onCancel }) => {
    const { t } = useTranslation('installEditor');
    const percent = getDisplayPercent(progress);
    const byteLabel = getByteLabel(progress);
    const cancelLabel = t('progress.cancelLabel', {
        version: progress.version,
    });

    return (
        <div
            className={`flex min-w-36 flex-col gap-1 text-base ${className ?? ''}`}
        >
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <span className="min-w-0 text-base-content/75">
                    {getStageLabel(progress, t)}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1">
                    {typeof percent === 'number' && (
                        <span className="tabular-nums text-base-content/75">
                            {Math.round(percent)}%
                        </span>
                    )}
                    {progress.canCancel && onCancel && (
                        <Tooltip tip={cancelLabel} placement="top">
                            <button
                                type="button"
                                className="btn btn-sm btn-ghost btn-square"
                                aria-label={cancelLabel}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onCancel(progress.id);
                                }}
                            >
                                <X size={16} aria-hidden="true" />
                            </button>
                        </Tooltip>
                    )}
                </span>
            </div>
            <progress
                className="progress progress-info w-full"
                value={typeof percent === 'number' ? percent : undefined}
                max={100}
                aria-label={getStageLabel(progress, t)}
            />
            <span
                className="text-sm tabular-nums text-base-content/60"
                aria-hidden={byteLabel ? undefined : true}
            >
                {byteLabel ?? '\u00a0'}
            </span>
        </div>
    );
};
