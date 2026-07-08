import type { InstalledRelease } from '@shared';
import { HardDrive, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRelease } from '../hooks/useRelease';
import { ReleaseInstallProgressIndicator } from './releaseInstallProgress.component';

type InstalledReleaseTableProps = {
    releases: InstalledRelease[];
    onRetry: (release: InstalledRelease) => void;
    onReinstall: (release: InstalledRelease) => void;
    onRemove: (release: InstalledRelease) => void;
    loading: boolean;
    busyAction?: {
        releaseKey: string;
        action: 'retry' | 'reinstall' | 'remove';
    } | null;
};

function getReleaseActionKey(release: InstalledRelease): string {
    return `${release.version}_${release.mono ? 'mono' : 'standard'}`;
}

export const InstalledReleaseTable: React.FC<InstalledReleaseTableProps> = ({
    releases,
    onRetry,
    onReinstall,
    onRemove,
    loading,
    busyAction,
}) => {
    const { t } = useTranslation(['installEditor', 'common']);
    const { getReleaseInstallProgress } = useRelease();

    const isReleaseActionBusy = (
        release: InstalledRelease,
        action?: 'retry' | 'reinstall' | 'remove',
    ) => {
        if (
            !busyAction ||
            busyAction.releaseKey !== getReleaseActionKey(release)
        ) {
            return false;
        }

        return action ? busyAction.action === action : true;
    };

    return (
        <table className="table  table-pin-rows table-md h-full">
            <thead className="sticky top-0 bg-base-200 z-10 text-xs">
                <tr>
                    <th className="min-w-44">{t('table.headers.version')}</th>
                    <th>{t('table.headers.released')}</th>
                    <th className="">{t('table.headers.installed')} </th>
                </tr>
            </thead>
            <tbody className="">
                {releases.map((row) => {
                    const progress = getReleaseInstallProgress(
                        row.version,
                        row.mono,
                    );

                    return (
                        <tr
                            key={`installedReleaseRow_${row.version}_${row.mono ? 'mono' : 'non-mono'}`}
                            className="hover:bg-base-content/30 even:bg-base-100"
                        >
                            <td>{row.version}</td>
                            <td>{row.published_at?.split('T')[0]}</td>
                            <td className="flex flex-col gap-2">
                                {row.valid === false ? (
                                    <div className="flex flex-col gap-2">
                                        <div className="flex flex-row items-center gap-2 text-warning text-xs">
                                            <TriangleAlert className="w-4 h-4" />
                                            <span>
                                                {t('table.status.unavailable')}
                                            </span>
                                        </div>
                                        <div className="flex flex-row flex-wrap gap-2">
                                            <button
                                                type="button"
                                                data-testid={`btnRetryRelease_${row.version}_${row.mono ? 'mono' : 'standard'}`}
                                                className="btn btn-xs flex items-center gap-2"
                                                disabled={
                                                    loading ||
                                                    isReleaseActionBusy(row)
                                                }
                                                onClick={() => onRetry(row)}
                                                aria-label={t('buttons.retry', {
                                                    ns: 'common',
                                                })}
                                            >
                                                {(loading ||
                                                    isReleaseActionBusy(
                                                        row,
                                                        'retry',
                                                    )) && (
                                                    <span className="loading loading-spinner loading-xs"></span>
                                                )}
                                                {t('buttons.retry', {
                                                    ns: 'common',
                                                })}
                                            </button>
                                            <button
                                                type="button"
                                                data-testid={`btnReinstallRelease_${row.version}_${row.mono ? 'mono' : 'standard'}`}
                                                className="btn btn-primary btn-xs flex items-center gap-2"
                                                disabled={
                                                    loading ||
                                                    isReleaseActionBusy(row)
                                                }
                                                onClick={() => onReinstall(row)}
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
                                                {t('buttons.reinstall', {
                                                    ns: 'common',
                                                })}
                                            </button>
                                            <button
                                                type="button"
                                                data-testid={`btnRemoveRelease_${row.version}_${row.mono ? 'mono' : 'standard'}`}
                                                className="btn btn-error btn-xs"
                                                disabled={
                                                    loading ||
                                                    isReleaseActionBusy(row)
                                                }
                                                onClick={() => onRemove(row)}
                                                aria-label={t(
                                                    'buttons.remove',
                                                    {
                                                        ns: 'common',
                                                    },
                                                )}
                                            >
                                                {isReleaseActionBusy(
                                                    row,
                                                    'remove',
                                                ) && (
                                                    <span className="loading loading-spinner loading-xs"></span>
                                                )}
                                                {t('buttons.remove', {
                                                    ns: 'common',
                                                })}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-row gap-2 items-center">
                                        {!row.mono && (
                                            <p
                                                className="tooltip tooltip-left flex items-center"
                                                data-tip={t(
                                                    'table.tooltips.installed',
                                                    { version: row.version },
                                                )}
                                            >
                                                {row.install_path.length > 0 ? (
                                                    <HardDrive />
                                                ) : progress ? (
                                                    <ReleaseInstallProgressIndicator
                                                        progress={progress}
                                                        className="max-w-72"
                                                    />
                                                ) : (
                                                    <>
                                                        <div className="loading loading-ring loading-sm"></div>{' '}
                                                        {t(
                                                            'table.downloading',
                                                        )}{' '}
                                                    </>
                                                )}
                                            </p>
                                        )}

                                        {row.mono && (
                                            <p
                                                className="tooltip tooltip-left flex items-center"
                                                data-tip={t(
                                                    'table.tooltips.installedDotNet',
                                                    { version: row.version },
                                                )}
                                            >
                                                <span className="flex flex-row items-center gap-1 text-xs">
                                                    {row.install_path.length >
                                                    0 ? (
                                                        <p className="flex items-center gap-2">
                                                            <HardDrive />
                                                            {t('table.dotnet')}
                                                        </p>
                                                    ) : progress ? (
                                                        <ReleaseInstallProgressIndicator
                                                            progress={progress}
                                                            className="max-w-72"
                                                        />
                                                    ) : (
                                                        <>
                                                            <div className="loading loading-ring loading-sm"></div>{' '}
                                                            {t(
                                                                'table.downloading',
                                                            )}{' '}
                                                            {t(
                                                                'table.dotnet',
                                                            )}{' '}
                                                        </>
                                                    )}
                                                </span>
                                            </p>
                                        )}
                                    </div>
                                )}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
