import { HardDrive, HardDriveDownload } from 'lucide-react';
import { useRelease } from '../hooks/useRelease';

type InstallReleaseTableProps = {
    releases: ReleaseSummary[];
    onInstall: (release: ReleaseSummary, mono: boolean) => void;
};

export const InstallReleaseTable: React.FC<InstallReleaseTableProps> = ({ releases, onInstall }) => {

    const { isInstalledRelease, isDownloadingRelease } = useRelease();

    const installReleaseRequest = (release: ReleaseSummary, mono: boolean) => {
        onInstall(release, mono);
    };

    return (
        <table className="table  table-pin-rows table-sm h-full">
            <thead className="sticky top-0 bg-base-200 z-10">
                <tr >
                    <th className="min-w-[150px]">Version</th>
                    <th>Released</th>
                    <th className="min-w-[200px]">Download </th>
                    <th className="min-w-[200px]"></th>
                </tr>
            </thead>
            <tbody className="">
                {
                    releases.map((row, index) => (
                        <tr key={index} className="hover:bg-base-content/30 even:bg-base-100">
                            <td>{row.version}</td>
                            <td>{row.published_at?.split('T')[0]}</td>
                            <td className="flex flex-row gap-2">
                                {
                                    isInstalledRelease(row.version, false)
                                        ? (<p className="tooltip tooltip-left flex items-center text-info gap-1" data-tip={`Installed - ${row.version} (GDScript)`}>
                                            <HardDrive /> (GDScript)
                                        </p>)
                                        : isDownloadingRelease(row.version, false)
                                            ? <div className="flex items-center gap-1 text-info"><p className="loading loading-ring loading-sm text-current"></p>(GDScript) Installing...</div>
                                            : (<p className="tooltip tooltip-left flex items-center" data-tip={`Download ${row.version} (GDScript)`}>
                                                <button data-testid={`btnDownload${row.version}`}
                                                    className="flex items-center"
                                                    onClick={() => installReleaseRequest(row, false)}
                                                    aria-label={`download ${row.version} (GDScript)`}>
                                                    <HardDriveDownload /> (GDScript)
                                                </button>
                                            </p>)
                                }
                            </td>
                            <td>

                                {
                                    isInstalledRelease(row.version, true)
                                        ? (<p className="tooltip tooltip-left flex items-center gap-1 text-info" data-tip={`Installed - ${row.version} .NET`}>
                                            <HardDrive />(.NET)
                                        </p>)
                                        : isDownloadingRelease(row.version, true)
                                            ? <div className="flex items-center gap-1 text-info"><div className="loading loading-ring loading-sm text-current"></div>(.NET) Installing...</div>
                                            : (<p className="tooltip tooltip-left flex items-center" data-tip={`Download ${row.version} .NET`}>
                                                <button data-testid={`btnDownload${row.version}-mono`} className="flex flex-row text-xs gap-1 items-center" onClick={() => installReleaseRequest(row, true)} aria-label={`download ${row.version} - .NET`} ><HardDriveDownload />(.NET)</button>
                                            </p>)
                                }
                            </td>
                        </tr>
                    ))
                }
            </tbody>

        </table>
    );
};