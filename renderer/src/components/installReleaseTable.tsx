import type { ReleaseSummary } from '@shared/contracts';
import { HardDrive, HardDriveDownload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRelease } from '../hooks/useRelease';
import { ReleaseInstallProgressIndicator } from './releaseInstallProgress.component';

type InstallReleaseTableProps = {
    releases: ReleaseSummary[];
    onInstall: (release: ReleaseSummary, mono: boolean) => void;
    onReinstall: (release: ReleaseSummary, mono: boolean) => void;
};

export const InstallReleaseTable: React.FC<InstallReleaseTableProps> = ({
    releases,
    onInstall,
    onReinstall,
}) => {
    const { t } = useTranslation(['installEditor', 'common']);
    const {
        getInstalledRelease,
        getReleaseInstallProgress,
        isDownloadingRelease,
    } = useRelease();

    const installReleaseRequest = (release: ReleaseSummary, mono: boolean) => {
        onInstall(release, mono);
    };

    const reinstallReleaseRequest = (
        release: ReleaseSummary,
        mono: boolean,
    ) => {
        onReinstall(release, mono);
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
                {releases.map((row) => {
                    const standardProgress = getReleaseInstallProgress(
                        row.version,
                        false,
                    );
                    const dotNetProgress = getReleaseInstallProgress(
                        row.version,
                        true,
                    );

                    return (
                        <tr
                            key={`installReleaseRow_${row.version}_${row.name}`}
                            className="hover:bg-base-content/30 even:bg-base-100"
                        >
                            <td>{row.version}</td>
                            <td>{row.published_at?.split('T')[0]}</td>
                            <td className="flex flex-row gap-2">
                                {getInstalledRelease(row.version, false)
                                    ?.valid !== false &&
                                getInstalledRelease(row.version, false) ? (
                                    <p
                                        className="tooltip tooltip-left flex items-center text-info gap-1"
                                        data-tip={t(
                                            'table.tooltips.installedGDScript',
                                            { version: row.version },
                                        )}
                                    >
                                        <HardDrive /> {t('table.gdscript')}
                                    </p>
                                ) : isDownloadingRelease(row.version, false) &&
                                  standardProgress ? (
                                    <ReleaseInstallProgressIndicator
                                        progress={standardProgress}
                                        className="max-w-56"
                                    />
                                ) : getInstalledRelease(row.version, false)
                                      ?.valid === false ? (
                                    <p
                                        className="tooltip tooltip-left flex items-center"
                                        data-tip={t(
                                            'table.tooltips.reinstallGDScript',
                                            { version: row.version },
                                        )}
                                    >
                                        <button
                                            type="button"
                                            data-testid={`btnReinstall${row.version}`}
                                            className="flex items-end gap-1 text-sm text-warning"
                                            onClick={() =>
                                                reinstallReleaseRequest(
                                                    row,
                                                    false,
                                                )
                                            }
                                            aria-label={t(
                                                'table.tooltips.reinstallGDScript',
                                                { version: row.version },
                                            )}
                                        >
                                            <HardDriveDownload />
                                            {t('buttons.reinstall', {
                                                ns: 'common',
                                            })}{' '}
                                            {t('table.gdscript')}
                                        </button>
                                    </p>
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
                                                installReleaseRequest(
                                                    row,
                                                    false,
                                                )
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
                                {getInstalledRelease(row.version, true)
                                    ?.valid !== false &&
                                getInstalledRelease(row.version, true) ? (
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
                                ) : isDownloadingRelease(row.version, true) &&
                                  dotNetProgress ? (
                                    <ReleaseInstallProgressIndicator
                                        progress={dotNetProgress}
                                        className="max-w-56"
                                    />
                                ) : getInstalledRelease(row.version, true)
                                      ?.valid === false ? (
                                    <p
                                        className="tooltip tooltip-left flex items-center"
                                        data-tip={t(
                                            'table.tooltips.reinstallDotNet',
                                            { version: row.version },
                                        )}
                                    >
                                        <button
                                            type="button"
                                            data-testid={`btnReinstall${row.version}-mono`}
                                            className="flex flex-row text-xs gap-1 items-end text-warning"
                                            onClick={() =>
                                                reinstallReleaseRequest(
                                                    row,
                                                    true,
                                                )
                                            }
                                            aria-label={t(
                                                'table.tooltips.reinstallDotNet',
                                                { version: row.version },
                                            )}
                                        >
                                            <HardDriveDownload />
                                            {t('buttons.reinstall', {
                                                ns: 'common',
                                            })}{' '}
                                            {t('table.dotnet')}
                                        </button>
                                    </p>
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
                    );
                })}
            </tbody>
        </table>
    );
};
