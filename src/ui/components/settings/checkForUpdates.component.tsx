import { ChangeEvent } from 'react';
import { usePreferences } from '../../hooks/usePreferences';
import { useApp } from '../../hooks/useApp';

export const CheckForUpdates: React.FC = () => {


    const { updateAvailable, installAndRelaunch, checkForAppUpdates } = useApp();
    const { preferences, setAutoUpdates } = usePreferences();

    const setAutoCheckUpdates = async (e: ChangeEvent<HTMLInputElement>) => {
        await setAutoUpdates(e.currentTarget.checked);
    };


    return (<div className="flex flex-col gap-4">
        <div>
            <h1 data-testid="updatesSettingsHeader" className="font-bold">Updates</h1>
            <p data-testid="updateSettingsSubHeader" className="text-sm">Configure how GD Launcher checks for updates</p>
        </div>
        <div className=" flex flex-col gap-8">
            <div className=" flex flex-row  gap-4">
                <div className="flex flex-row flex-shrink items-center justify-start gap-4 ">
                    <input data-testid="chkAutoCheckUpdatesCheckbox" onChange={setAutoCheckUpdates} type="checkbox" checked={preferences?.auto_check_updates} className="checkbox" />
                    <span className="">Automatically check for updates</span>
                </div>
            </div>
            <div className="flex flex-col gap-4 ">

                <div>
                    {updateAvailable?.message}
                </div>

                <div>

                    {(!updateAvailable || (updateAvailable && updateAvailable?.type === 'none')) && (
                        <button onClick={() => checkForAppUpdates()} className="btn btn-primary">Check for updates</button>
                    )}

                    {updateAvailable && updateAvailable?.type === 'ready' && (
                        <div className="gap-2 p-4 m-2 text-sm text-info rounded-xl bg-base-200">
                            {updateAvailable?.version ? `Version ${updateAvailable?.version}` : 'A new version'} is available, restart Godot Launcher to install. <button onClick={() => installAndRelaunch()} className="underline cursor-pointer hover:no-underline">Restart now.</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>);
};