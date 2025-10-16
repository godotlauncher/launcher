import clsx from 'clsx';
import { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreferences } from '../../hooks/usePreferences';


export const CustomizeBehaviorStep: React.FC = () => {
    const { t } = useTranslation('welcome');

    const { preferences, updatePreferences, setAutoStart } = usePreferences();

    const setAutoCheckUpdates = async (e: ChangeEvent<HTMLInputElement>) => {
        if (preferences) {
            await updatePreferences({ auto_check_updates: e.target.checked });
        }
    };

    const onAutoStartChanged = async (e: ChangeEvent<HTMLInputElement>) => {
        if (preferences) {
            await setAutoStart(e.target.checked, preferences.start_in_tray);
        }
    };

    const setStartInTray = async (e: ChangeEvent<HTMLInputElement>) => {
        if (preferences) {
            await setAutoStart(preferences.auto_start, e.target.checked);
        }
    };

    const setProjectLaunchAction = async (e: ChangeEvent<HTMLInputElement>) => {
        if (preferences && e.target.value) {
            // validate the value
            if (['none', 'minimize', 'close_to_tray'].includes(e.target.value)) {
                await updatePreferences({ post_launch_action: e.target.value as 'none' | 'minimize' | 'close_to_tray' });
            }
        }
    };

    return (
        <div className="flex flex-col gap-4 text-sm">
            <div className="flex flex-row gap-">
                <div className='flex items-center gap-4'>
                    <p>{t('customizeBehavior.afterLaunching')}</p>
                    <div className=" flex flex-row gap-4">
                        <div className="flex flex-row flex-shrink items-center justify-start gap-4 ">
                            <input onChange={setProjectLaunchAction} value="none" data-testid="radioLaunchActionNone" type="radio" name="launch-action" className="radio-sm checked:bg-current" checked={preferences?.post_launch_action === 'none'} />
                            <span className="">{t('customizeBehavior.nothing')}</span>
                        </div>
                        <div className="flex flex-row flex-shrink items-center justify-start gap-4 ">
                            <input onChange={setProjectLaunchAction} value="minimize" data-testid="radioLaunchActionMinimize" type="radio" name="launch-action" className="radio-sm checked:bg-current" checked={preferences?.post_launch_action === 'minimize'} />
                            <span className="">{t('customizeBehavior.minimize')}</span>
                        </div>
                        <div className="flex flex-row flex-shrink items-center justify-start gap-4 ">
                            <input onChange={setProjectLaunchAction} value="close_to_tray" data-testid="radioLaunchActionClose" type="radio" name="launch-action" className="radio-sm checked:bg-current" checked={preferences?.post_launch_action === 'close_to_tray'} />
                            <span className="">{t('customizeBehavior.closeToTray')}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="divider m-0"></div>


            <div className=" flex flex-row gap-4">
                <div className="flex flex-row flex-shrink items-center justify-start gap-4 ">
                    <input data-testid="chkAutoCheckUpdatesCheckbox" onChange={setAutoCheckUpdates} type="checkbox" checked={preferences?.auto_check_updates} className="checkbox-sm" />
                    <span className="">{t('customizeBehavior.autoCheckUpdates')}</span>
                </div>
            </div>

            <div className="divider m-0"></div>
            <div>
                <div className="flex flex-col flex-shrink items-start  gap-0 ">
                    <label className="label flex flex-row gap-4">
                        <input onChange={onAutoStartChanged} data-testid="chkAutoStartCheckbox" type="checkbox" checked={preferences?.auto_start} className="checkbox-sm" />
                        {t('customizeBehavior.autoStart')}
                    </label>
                    <label className={clsx('label flex flex-row gap-4 pl-12', { 'cursor-not-allowed': (preferences?.auto_start === false) })} aria-disabled={preferences?.auto_start === false}>
                        <input onChange={setStartInTray} data-testid="chkStartInTrayCheckbox" type="checkbox" checked={preferences?.start_in_tray} className="checkbox-sm" disabled={preferences?.auto_start === false} />
                        {t('customizeBehavior.startInTray')}
                    </label>
                </div>
            </div>
        </div >
    );
};
