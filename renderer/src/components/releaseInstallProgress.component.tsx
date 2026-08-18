import type { ReleaseInstallProgress } from '@shared/contracts';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
 * Renders the current editor installation stage and progress.
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
        <div className={`flex min-w-36 flex-col gap-1 ${className ?? ''}`}>
            <div className="flex items-center justify-between gap-2 text-xs text-info">
                <span>{getStageLabel(progress, t)}</span>
                <span className="flex items-center gap-1">
                    {typeof percent === 'number' && (
                        <span>{Math.round(percent)}%</span>
                    )}
                    {progress.canCancel && onCancel && (
                        <button
                            type="button"
                            className="btn btn-ghost btn-xs size-5 min-h-0 p-0 text-base-content/70 hover:text-error"
                            aria-label={cancelLabel}
                            title={cancelLabel}
                            onClick={(event) => {
                                event.stopPropagation();
                                onCancel(progress.id);
                            }}
                        >
                            <X size={14} aria-hidden="true" />
                        </button>
                    )}
                </span>
            </div>
            <progress
                className="progress progress-info h-1 w-full"
                value={typeof percent === 'number' ? percent : undefined}
                max={100}
            />
            <span
                aria-hidden={byteLabel ? undefined : true}
                className="text-[0.65rem] leading-none text-base-content/50"
            >
                {byteLabel ?? '\u00a0'}
            </span>
        </div>
    );
};
