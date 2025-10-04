import { HardDrive } from 'lucide-react';
import { useTranslation } from 'react-i18next';
type InstalledReleaseTableProps = {
    releases: InstalledRelease[];
};

export const InstalledReleaseTable: React.FC<InstalledReleaseTableProps> = ({ releases }) => {
    const { t } = useTranslation();

    return (
        <table className="table  table-pin-rows table-sm h-full">
            <thead className="sticky top-0 bg-base-200 z-10">
                <tr >
                    <th className="min-w-44">{t('version')}</th>
                    <th>{t('Released')}</th>
                    <th className="">{t('installed')} </th>
                </tr>
            </thead>
            <tbody className="">
                {
                    releases.map((row, index) => (
                        <tr key={index} className="hover:bg-base-content/30 even:bg-base-100">
                            <td>{row.version}</td>
                            <td>{row.published_at?.split('T')[0]}</td>
                            <td className="flex flex-row gap-2">
                                {!row.mono && (
                                    <p className="tooltip tooltip-left flex items-center" data-tip={`Installed - ${row.version}`}>
                                        {(row.install_path.length > 0)
                                            ? <HardDrive />
                                            : <><div className="loading loading-ring loading-sm"></div> downloading... </>
                                        }
                                    </p>
                                )}

                                {row.mono &&
                                    (
                                        <p className="tooltip tooltip-left flex items-center" data-tip={`Installed - ${row.version} .NET`}>
                                            <span className="flex flex-row items-center gap-1 text-xs">
                                                {(row.install_path.length > 0)
                                                    ? <p className="flex items-center gap-2"><HardDrive />(.NET)</p>
                                                    : <><div className="loading loading-ring loading-sm"></div> downloading (.NET)... </>
                                                }
                                            </span>
                                        </p>
                                    )}
                            </td>
                        </tr>
                    ))
                }
            </tbody>

        </table>
    );
};