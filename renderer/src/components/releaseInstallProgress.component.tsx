import type { ReleaseInstallProgress } from '@shared';

type ReleaseInstallProgressProps = {
    progress: ReleaseInstallProgress;
    className?: string;
};

function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) {
        return `${Math.round(bytes / 1024)} KB`;
    }

    return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function getStageLabel(progress: ReleaseInstallProgress): string {
    switch (progress.stage) {
        case 'queued':
            return progress.queuePosition
                ? `Queued #${progress.queuePosition}`
                : 'Queued';
        case 'preparing':
            return 'Preparing';
        case 'downloading':
            return 'Downloading';
        case 'extracting':
            return 'Extracting';
        case 'registering':
            return 'Registering';
        case 'validating':
            return 'Validating';
        case 'complete':
            return 'Complete';
        case 'error':
            return 'Failed';
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

export const ReleaseInstallProgressIndicator: React.FC<
    ReleaseInstallProgressProps
> = ({ progress, className }) => {
    const percent = getDisplayPercent(progress);
    const byteLabel = getByteLabel(progress);

    return (
        <div className={`flex min-w-36 flex-col gap-1 ${className ?? ''}`}>
            <div className="flex items-center justify-between gap-2 text-xs text-info">
                <span>{getStageLabel(progress)}</span>
                {typeof percent === 'number' && (
                    <span>{Math.round(percent)}%</span>
                )}
            </div>
            <progress
                className="progress progress-info h-1 w-full"
                value={typeof percent === 'number' ? percent : undefined}
                max={100}
            />
            {byteLabel && (
                <span className="text-[0.65rem] leading-none text-base-content/50">
                    {byteLabel}
                </span>
            )}
        </div>
    );
};
