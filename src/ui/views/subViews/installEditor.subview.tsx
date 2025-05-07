import clsx from 'clsx';
import { CircleX, HardDrive, RefreshCcw, X } from 'lucide-react';
import { useState } from 'react';
import { InstallReleaseTable } from '../../components/installReleaseTable';
import { InstalledReleaseTable } from '../../components/installedReleasesTable';
import { useAlerts } from '../../hooks/useAlerts';
import { usePreferences } from '../../hooks/usePreferences';
import { useRelease } from '../../hooks/useRelease';

type SubviewProps = {
    onClose: () => void;
};



export const InstallEditorSubView: React.FC<SubviewProps> = ({ onClose }) => {
    const { preferences } = usePreferences();
    const [textSearch, setTextSearch] = useState<string>('');
    const [tab, setTab] = useState<'RELEASE' | 'PRERELEASE' | 'INSTALLED'>('RELEASE');
    const [filterInstalled, setFilterInstalled] = useState<boolean>(false);
    const {
        installedReleases,
        downloadingReleases,
        installRelease,
        availableReleases,
        availablePrereleases,
        loading,
        hasError,
        refreshAvailableReleases,
        isInstalledRelease,
    } = useRelease();

    const { addAlert } = useAlerts();

    const installReleaseRequest = async (release: ReleaseSummary, mono: boolean) => {
        const result = await installRelease(release, mono);

        if (result.success) {
            await refreshAvailableReleases();
        }
        else {
            addAlert('Error', result.error || 'Something went wrong when installing release');
        }
    };

    const getFilteredInstalledRows = (): InstalledRelease[] => {

        const installed = installedReleases.concat(downloadingReleases.map(r => ({
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
        if (textSearch === '') return installed;
        return installed.filter(row => row.version.toLowerCase().includes(textSearch.toLowerCase()));

    };


    const getFilteredRows = () => {
        if (tab === 'RELEASE') {

            let releases = availableReleases;

            if (filterInstalled) {
                releases = releases.filter(row => isInstalledRelease(row.version, false) || isInstalledRelease(row.version, true));
            }

            if (textSearch === '') return releases;
            return releases.filter(row => row.name.toLowerCase().includes(textSearch.toLowerCase()));
        }
        else {

            let prereleases = availablePrereleases;

            if (filterInstalled) {
                prereleases = prereleases.filter(row => isInstalledRelease(row.version, false) || isInstalledRelease(row.version, true));
            }

            if (textSearch === '') return prereleases.filter(row => row.prerelease);
            return prereleases.filter(row => row.prerelease && row.name.toLowerCase().includes(textSearch.toLowerCase()));
        }


    };

    return (
        <>
            <div className="absolute inset-0 z-100 w-full h-full p-4 bg-black/80 z-10"></div >
            <div className="absolute inset-0 px-8 pb-8 flex flex-col w-full h-full overflow-hidden items-center z-20">
                <div className="flex flex-col p-4 rounded-b-lg overflow-hidden bg-base-300  min-w-[900px]">

                    <div className="flex flex-col gap-2 w-full">

                        <div className="flex flex-row justify-between items-start">
                            <div className="flex flex-col gap-1">
                                <h1 data-testid="settingsTitle" className="text-2xl">Install Godot Editor</h1>
                                <p className="badge text-base-content/50">{preferences?.install_location}</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={onClose}><X /></button>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-row justify-end my-2 pr-1 items-center">
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
                                className="absolute right-8 w-6 h-6"><CircleX /></button>
                        }
                    </div>
                    <div className="flex flex-row justify-between">
                        {/* Tabs */}
                        <div role="tablist" className="tabs tabs-bordered flex flex-row ">
                            <a role="tab"
                                onClick={() => setTab('RELEASE')}
                                data-testid="tabInstallsRelease"
                                className={clsx('tab w-[150px] justify-start', { 'tab-active': (tab === 'RELEASE') })}
                            >
                                <p className="flex gap-2 items-center">
                                    Released
                                    ({
                                        installedReleases.reduce((acc, i) => acc += (i.prerelease ? 0 : 1), 0).toString()
                                    })
                                    {
                                        downloadingReleases.reduce((acc, i) => acc += (i.prerelease ? 0 : 1), 0) > 0 && <div className="loading loading-ring loading-xs m-0 p-0"></div>
                                    }
                                </p></a>
                            <a role="tab"
                                onClick={() => setTab('PRERELEASE')}
                                data-testid="tabInstallsPrerelease"
                                className={clsx('tab w-[150px] justify-start', { 'tab-active': (tab === 'PRERELEASE') })}
                            >
                                <p className="flex gap-2 items-center">
                                    Prerelease
                                    ({
                                        installedReleases.reduce((acc, i) => acc += (i.prerelease ? 1 : 0), 0).toString()
                                    })
                                    {
                                        downloadingReleases.reduce((acc, i) => acc += (i.prerelease ? 1 : 0), 0) > 0 && <div className="loading loading-ring loading-xs m-0 p-0"></div>
                                    }
                                </p>
                            </a>
                            {/* <a role="tab"
                            onClick={() => setTab('INSTALLED')}
                            data-testid="tabInstalled"
                            className={clsx('tab w-[150px] justify-start', { 'tab-active': (tab === 'INSTALLED') })}
                        >Installed</a> */}
                        </div>
                        <div className="flex flex-row gap-2">
                            <span className="flex items-center tooltip text-info" data-tip="Show installed only">

                                <label className="swap swap-indeterminate">
                                    {/* this hidden checkbox controls the state */}
                                    <input type="checkbox" onChange={(e) => setFilterInstalled(e.target.checked)} />
                                    <div className="swap-on  text-sm flex gap-2 items-center text-info"><HardDrive className="stroke-info" />Show installed only</div>
                                    <div className="swap-off text-sm flex gap-2 items-center text-base-content"><HardDrive />Show installed only</div>
                                </label>
                            </span>

                            <button onClick={refreshAvailableReleases} className="btn btn-sm" title="Reload Release List"><RefreshCcw className="w-4" /></button>

                        </div>
                    </div>
                    <div className="divider my-2"></div>

                    <div className="flex flex-col overflow-auto w-full h-full">
                        {
                            loading && <span className="loading loading-dots loading-sm"></span>
                        }
                        {
                            hasError &&
                            <div>
                                <div>There was an error fetching releases.</div>
                                <div>{hasError}</div>
                                <div>Please <button className="underline cursor-pointer hover:no-underline" onClick={async () => await refreshAvailableReleases()}>try again later</button></div>
                            </div>
                        }
                        {
                            (!hasError && !loading) && <div className="overflow-x-hidden overflow-y-auto">

                                {tab !== 'INSTALLED'
                                    ? <InstallReleaseTable releases={getFilteredRows()} onInstall={installReleaseRequest} />
                                    : <InstalledReleaseTable releases={getFilteredInstalledRows()} />
                                }
                            </div>
                        }
                    </div>
                </div>
            </div>
        </>);
};