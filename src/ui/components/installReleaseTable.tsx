import { HardDrive, HardDriveDownload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRelease } from '../hooks/useRelease';

type InstallReleaseTableProps = {
    releases: ReleaseSummary[];
    onInstall: (release: ReleaseSummary, mono: boolean) => void;
};

export const InstallReleaseTable: React.FC<InstallReleaseTableProps> = ({
    releases,
    onInstall,
}) => {
    const { t } = useTranslation('installEditor');
    const { isInstalledRelease, isDownloadingRelease } = useRelease();

    const installReleaseRequest = (release: ReleaseSummary, mono: boolean) => {
        onInstall(release, mono);
    };

    return (
        <table className="table  table-pin-rows table-md h-full">
            <thead className="sticky top-0 bg-base-200 z-10 text-xs">
                <tr>
                    <th className="min-w-[150px]">
                        {t('table.headers.version')}
                    </th>
                    <th>{t('table.headers.released')}</th>
                    <th className="min-w-[200px]">
                        {t('table.headers.download')}{' '}
                    </th>
                    <th className="min-w-[200px]"></th>
                </tr>
            </thead>
            <tbody className="">
                {releases.map((row, index) => (
                    <tr
                        key={`installReleaseRow_${row.version}_${index}`}
                        className="hover:bg-base-content/30 even:bg-base-100"
                    >
                        <td>{row.version}</td>
                        <td>{row.published_at?.split('T')[0]}</td>
                        <td className="flex flex-row gap-2">
                            {isInstalledRelease(row.version, false) ? (
                                <p
                                    className="tooltip tooltip-left flex items-center text-info gap-1"
                                    data-tip={t(
                                        'table.tooltips.installedGDScript',
                                        { version: row.version },
                                    )}
                                >
                                    <HardDrive /> {t('table.gdscript')}
                                </p>
                            ) : isDownloadingRelease(row.version, false) ? (
                                <div className="flex items-center gap-1 text-info">
                                    <p className="loading loading-ring loading-sm text-current"></p>
                                    {t('table.gdscript')}{' '}
                                    {t('table.installing')}
                                </div>
                            ) : (
                                <p
                                    className="tooltip tooltip-left flex items-center"
                                    data-tip={t(
                                        'table.tooltips.downloadGDScript',
                                        { version: row.version },
                                    )}
                                >
                                    <button
                                        type="button"
                                        data-testid={`btnDownload${row.version}`}
                                        className="flex items-end gap-1 text-sm"
                                        onClick={() =>
                                            installReleaseRequest(row, false)
                                        }
                                        aria-label={t(
                                            'table.tooltips.downloadGDScript',
                                            { version: row.version },
                                        )}
                                    >
                                        <HardDriveDownload />{' '}
                                        {t('table.gdscript')}
                                    </button>
                                </p>
                            )}
                        </td>
                        <td>
                            {isInstalledRelease(row.version, true) ? (
                                <p
                                    className="tooltip tooltip-left flex items-center gap-1 text-xs text-info"
                                    data-tip={t(
                                        'table.tooltips.installedDotNet',
                                        { version: row.version },
                                    )}
                                >
                                    <HardDrive />
                                    {t('table.dotnet')}
                                </p>
                            ) : isDownloadingRelease(row.version, true) ? (
                                <div className="flex items-center gap-1 text-info">
                                    <div className="loading loading-ring loading-sm text-current"></div>
                                    {t('table.dotnet')} {t('table.installing')}
                                </div>
                            ) : (
                                <p
                                    className="tooltip tooltip-left flex items-center"
                                    data-tip={t(
                                        'table.tooltips.downloadDotNet',
                                        { version: row.version },
                                    )}
                                >
                                    <button
                                        type="button"
                                        data-testid={`btnDownload${row.version}-mono`}
                                        className="flex flex-row text-xs gap-1 items-end"
                                        onClick={() =>
                                            installReleaseRequest(row, true)
                                        }
                                        aria-label={t(
                                            'table.tooltips.downloadDotNet',
                                            { version: row.version },
                                        )}
                                    >
                                        <HardDriveDownload />
                                        {t('table.dotnet')}
                                    </button>
                                </p>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};
