import { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../../hooks/usePreferences';
import { useApp } from '../../hooks/useApp';

export const CheckForUpdates: React.FC = () => {
    const { t } = useTranslation('settings');

    const { updateAvailable, installAndRelaunch, checkForAppUpdates } = useApp();
    const { preferences, setAutoUpdates } = usePreferences();

    const setAutoCheckUpdates = async (e: ChangeEvent<HTMLInputElement>) => {
        await setAutoUpdates(e.currentTarget.checked);
    };


    return (<div className="flex flex-col gap-4">
        <div>
            <h1 data-testid="updatesSettingsHeader" className="font-bold">{t('updates.title')}</h1>
            <p data-testid="updateSettingsSubHeader" className="text-sm">{t('updates.description')}</p>
        </div>
        <div className=" flex flex-col gap-8">
            <div className=" flex flex-row  gap-4">
                <div className="flex flex-row flex-shrink items-center justify-start gap-4 ">
                    <input data-testid="chkAutoCheckUpdatesCheckbox" onChange={setAutoCheckUpdates} type="checkbox" checked={preferences?.auto_check_updates} className="checkbox" />
                    <span className="">{t('updates.autoCheck')}</span>
                </div>
            </div>
            <div className="flex flex-col gap-4 ">

                <div>
                    {updateAvailable?.message}
                </div>

                <div>

                    {(!updateAvailable || (updateAvailable && updateAvailable?.type === 'none')) && (
                        <button onClick={() => checkForAppUpdates()} className="btn btn-primary">{t('updates.checkNow')}</button>
                    )}

                    {updateAvailable && updateAvailable?.type === 'ready' && (
                        <div className="gap-2 p-4 m-2 text-sm text-info rounded-xl bg-base-200">
                            {updateAvailable?.version ? t('updates.updateAvailable', { version: updateAvailable.version }) : t('updates.updateReady')} <button onClick={() => installAndRelaunch()} className="underline cursor-pointer hover:no-underline">{t('updates.restartNow')}</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>);
};