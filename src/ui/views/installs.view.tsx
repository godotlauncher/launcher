import { CircleX, EllipsisVertical, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useRelease } from '../hooks/useRelease';
import { sortReleases } from '../releaseStoring.utils';
import { InstallEditorSubView } from './subViews/installEditor.subview';

export const InstallsView: React.FC = () => {
    const [textSearch, setTextSearch] = useState<string>('');
    const [installOpen, setInstallOpen] = useState<boolean>(false);

    const { installedReleases, downloadingReleases, showReleaseMenu } = useRelease();

    const onOpenReleaseMoreOptions = (e: React.MouseEvent, release: InstalledRelease) => {
        e.stopPropagation();
        showReleaseMenu(release);
    };

    const getFilteredRows = () => {
        // merge downloading and installed releases for proper display
        const all = installedReleases.concat(downloadingReleases.map(r =>
            ({
                version: r.version,
                version_number: -1,
                install_path: '',
                mono: r.mono,
                platform: '',
                arch: '',
                editor_path: '',
                prerelease: r.prerelease,
                config_version: 5,
                published_at: r.published_at,
                valid: true
            })));

        if (textSearch === '') return all.sort(sortReleases);
        const selection = all.filter(row => row.version.toLowerCase().includes(textSearch.toLowerCase()));
        return selection.sort(sortReleases);
    };

    return (
        <>
            <div className="flex flex-col h-full w-full overflow-auto p-1">
                <div className="flex flex-col gap-2 w-full">
                    <div className="flex flex-row justify-between">
                        <h1 data-testid="installsTitle" className="text-2xl">Editor Installs</h1>
                        <div className="flex gap-2">
                            <button data-testid="btnInstallEditor" className="btn btn-primary" onClick={() => setInstallOpen(true)}>Install Editor</button>
                        </div>
                    </div>
                    <div className="flex flex-row justify-end my-2 items-center">
                        <input
                            type="text"
                            placeholder="Search"
                            className="input input-bordered w-full max-w-xs"
                            onChange={(e) => setTextSearch(e.target.value)}
                            value={textSearch}
                        />
                        {textSearch.length > 0 &&
                            <button
                                tabIndex={-1}
                                onClick={() => setTextSearch('')}
                                className="absolute right-4 w-6 h-6"><CircleX /></button>
                        }
                    </div>
                </div>
                <div className="divider m-0"></div>

                {
                    (installedReleases.length < 1 && downloadingReleases.length < 1)
                        ? (<div className="text-warning flex gap-2"><TriangleAlert className="stroke-warning" />No releases installed, yet.<a onClick={() => setInstallOpen(true)} className="underline cursor-pointer">Install.</a></div>)
                        : (
                            <div className="overflow-auto h-full">
                                <table className="table table-sm">
                                    <thead className="sticky top-0 bg-base-200">
                                        <tr >
                                            <th>Name</th>
                                            <th></th>
                                        </tr>
                                    </thead>

                                    <tbody className="overflow-y-auto">
                                        {
                                            getFilteredRows().map((row, index) => (
                                                <tr key={index} className="even:bg-base-100 hover:bg-base-content/10">
                                                    <td >
                                                        <div className="flex flex-col gap-1">
                                                            <div className="flex flex-row gap-2">
                                                                {row.version}
                                                                {row.mono && <span className="badge">.NET</span>}
                                                                {row.prerelease && <span className="badge badge-secondary">prerelease</span>}
                                                            </div>
                                                            <div className="text-xs text-base-content/50">
                                                                {row.install_path || <div className="flex flex-row gap-2">
                                                                    <div className="loading loading-ring loading-sm"></div>
                                                                    Installing...
                                                                </div>
                                                                }
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="flex flex-row justify-end">

                                                        {
                                                            row.install_path &&
                                                            <button
                                                                onClick={(e) => onOpenReleaseMoreOptions(e, row)}
                                                                className="select-none outline-none relative flex items-center justify-center w-10 h-10 hover:bg-base-content/20 rounded-lg"                        >
                                                                <EllipsisVertical />
                                                            </button >
                                                        }
                                                    </td>
                                                </tr>
                                            ))
                                        }
                                    </tbody>
                                </table>
                            </div>
                        )}

            </div >
            {
                installOpen &&
                <InstallEditorSubView onClose={() => setInstallOpen(false)} />
            }
        </>
    );
};