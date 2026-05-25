import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../../hooks/usePreferences';

export const ProjectLaunchAction: React.FC = () => {
    const { t } = useTranslation('settings');
    const { preferences, savePreferences } = usePreferences();

    const setProjectLaunchAction = async (e: ChangeEvent<HTMLInputElement>) => {
        if (preferences && e.target.value) {
            // validate the value
            if (
                ['none', 'minimize', 'close_to_tray'].includes(e.target.value)
            ) {
                await savePreferences({
                    ...preferences,
                    post_launch_action: e.target.value as
                        | 'none'
                        | 'minimize'
                        | 'close_to_tray',
                });
            }
        }
    };

    return (
        <div className="flex flex-col gap-4">
            <div>
                <h1
                    data-testid="projectLaunchSettingsHeader"
                    className="font-bold"
                >
                    {t('behavior.projectLaunch.title')}
                </h1>
                <p
                    data-testid="projectLaunchSettingsSubHeader"
                    className="text-sm"
                >
                    {t('behavior.projectLaunch.description')}
                </p>
            </div>
            <div className=" flex flex-col gap-8">
                <div className=" flex flex-row  gap-4">
                    <div className="flex flex-row flex-shrink items-center justify-start gap-4 ">
                        <input
                            onChange={setProjectLaunchAction}
                            value="none"
                            data-testid="radioLaunchActionNone"
                            type="radio"
                            name="launch-action"
                            className="radio"
                            checked={preferences?.post_launch_action === 'none'}
                        />
                        <span className="">
                            {t('behavior.projectLaunch.none')}
                        </span>
                    </div>
                    <div className="flex flex-row flex-shrink items-center justify-start gap-4 ">
                        <input
                            onChange={setProjectLaunchAction}
                            value="minimize"
                            data-testid="radioLaunchActionMinimize"
                            type="radio"
                            name="launch-action"
                            className="radio"
                            checked={
                                preferences?.post_launch_action === 'minimize'
                            }
                        />
                        <span className="">
                            {t('behavior.projectLaunch.minimize')}
                        </span>
                    </div>
                    <div className="flex flex-row flex-shrink items-center justify-start gap-4 ">
                        <input
                            onChange={setProjectLaunchAction}
                            value="close_to_tray"
                            data-testid="radioLaunchActionClose"
                            type="radio"
                            name="launch-action"
                            className="radio"
                            checked={
                                preferences?.post_launch_action ===
                                'close_to_tray'
                            }
                        />
                        <span className="">
                            {t('behavior.projectLaunch.closeToTray')}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
