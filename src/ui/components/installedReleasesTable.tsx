import { HardDrive, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type InstalledReleaseTableProps = {
    releases: InstalledRelease[];
    onRetry: (release: InstalledRelease) => void;
    onRemove: (release: InstalledRelease) => void;
    loading: boolean;
};

export const InstalledReleaseTable: React.FC<InstalledReleaseTableProps> = ({
    releases,
    onRetry,
    onRemove,
    loading,
}) => {
    const { t } = useTranslation(['installEditor', 'common']);

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
                {releases.map((row, index) => (
                    <tr
                        key={`installedReleaseRow_${row.version}_${index}`}
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
                                            className="btn btn-ghost btn-xs flex items-center gap-2"
                                            disabled={loading}
                                            onClick={() => onRetry(row)}
                                        >
                                            {loading && (
                                                <span className="loading loading-spinner loading-xs"></span>
                                            )}
                                            {t('buttons.retry', {
                                                ns: 'common',
                                            })}
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-ghost btn-xs"
                                            disabled={loading}
                                            onClick={() => onRemove(row)}
                                        >
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
                                                {row.install_path.length > 0 ? (
                                                    <p className="flex items-center gap-2">
                                                        <HardDrive />
                                                        {t('table.dotnet')}
                                                    </p>
                                                ) : (
                                                    <>
                                                        <div className="loading loading-ring loading-sm"></div>{' '}
                                                        {t('table.downloading')}{' '}
                                                        {t('table.dotnet')}{' '}
                                                    </>
                                                )}
                                            </span>
                                        </p>
                                    )}
                                </div>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};
