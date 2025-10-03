import { ChangeEvent } from 'react';
import { usePreferences } from '../../hooks/usePreferences';
import { useTranslation } from 'react-i18next';

export const ProjectLaunchAction: React.FC = () => {
    const { preferences, savePreferences } = usePreferences();
    const { t } = useTranslation();
    const setProjectLaunchAction = async (e: ChangeEvent<HTMLInputElement>) => {
        if (preferences && e.target.value) {
            // validate the value
            if (['none', 'minimize', 'close_to_tray'].includes(e.target.value)) {
                await savePreferences({ ...preferences, post_launch_action: e.target.value as 'none' | 'minimize' | 'close_to_tray' });
            }
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div>
                <h1 data-testid="projectLaunchSettingsHeader" className="font-bold">{t('Project_Launch_Action')}</h1>
                <p data-testid="projectLaunchSettingsSubHeader" className="text-sm">{t('Choose_what_GD_Launcher_does_after_launching_a_project')}</p>
            </div>
            <div className=" flex flex-col gap-8">
                <div className=" flex flex-row  gap-4">
                    <div className="flex flex-row flex-shrink items-center justify-start gap-4 ">
                        <input onChange={setProjectLaunchAction} value="none" data-testid="radioLaunchActionNone" type="radio" name="launch-action" className="radio checked:bg-current" checked={preferences?.post_launch_action === 'none'} />
                        <span className="">{t('Nothing')}</span>
                    </div>
                    <div className="flex flex-row flex-shrink items-center justify-start gap-4 ">
                        <input onChange={setProjectLaunchAction} value="minimize" data-testid="radioLaunchActionMinimize" type="radio" name="launch-action" className="radio checked:bg-current" checked={preferences?.post_launch_action === 'minimize'} />
                        <span className="">{t('Minimize')}</span>
                    </div>
                    <div className="flex flex-row flex-shrink items-center justify-start gap-4 ">
                        <input onChange={setProjectLaunchAction} value="close_to_tray" data-testid="radioLaunchActionClose" type="radio" name="launch-action" className="radio checked:bg-current" checked={preferences?.post_launch_action === 'close_to_tray'} />
                        <span className="">{t('Close_to_system_tray')}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};