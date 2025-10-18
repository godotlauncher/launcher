import { useTranslation } from 'react-i18next';
import { usePreferences } from '../../hooks/usePreferences';

type CurrentSettingsStepProps = {
    onSkip: () => void;
};

export const CurrentSettingsStep: React.FC<CurrentSettingsStepProps> = ({ onSkip }) => {
    const { t } = useTranslation('welcome');

    const { preferences } = usePreferences();
    const loading = !preferences;

    const getPostLaunchText = (action: UserPreferences['post_launch_action']) => {
        switch (action) {
            case 'none':
                return t('currentSettings.postLaunchActions.nothing');
            case 'minimize':
                return t('currentSettings.postLaunchActions.minimize');
            case 'close_to_tray':
                return t('currentSettings.postLaunchActions.closeToTray');
            default:
                return t('currentSettings.postLaunchActions.nothing');
        }
    };
    return (
        <div className="flex flex-col gap-2 text-sm">
            {/* Default settings */}
            {loading && <p className="loading loading-spinner w-6"></p>}
            {!loading && (
                <>
                    <p className="font-bold">{t('currentSettings.title')}</p>
                    <div className="bg-base-200 p-4 rounded-lg flex flex-row justify-between items-start ">

                        <table className="">
                            <tbody>
                                <tr className="h-8">
                                    <td className="flex-1">{t('currentSettings.projectsLocation')}</td>
                                    <td className="pl-4">{preferences?.projects_location}</td>
                                </tr>
                                <tr className="h-8">
                                    <td className="flex-1">{t('currentSettings.installLocation')}</td>
                                    <td className="pl-4">{preferences?.install_location}</td>
                                </tr>
                                <tr className="h-8">

                                    <td className="flex-1">{t('currentSettings.postLaunchAction')}</td>
                                    <td className="pl-4">{getPostLaunchText(preferences?.post_launch_action || 'close_to_tray')}</td>
                                </tr>
                                <tr className="h-8">

                                    <td className="flex-1">{t('currentSettings.autoCheckUpdates')}</td>
                                    <td className="pl-4">{preferences?.auto_check_updates ? t('currentSettings.yes') : t('currentSettings.no')}</td>
                                </tr>

                                <tr className="h-8">
                                    <td className="flex-1">{t('currentSettings.autoStart')}</td>
                                    <td className="pl-4">{preferences?.auto_start ? t('currentSettings.yes') : t('currentSettings.no')}</td>
                                </tr>

                                {
                                    preferences?.auto_start &&
                                    <tr>
                                        <td className="flex-1">{t('currentSettings.autoStartType')}</td>
                                        <td className="pl-4">{preferences?.start_in_tray ? t('currentSettings.systemTray') : t('currentSettings.normalWindow')}</td>
                                    </tr>
                                }

                            </tbody>

                        </table>
                        <button onClick={onSkip} className="btn btn-ghost">{t('currentSettings.skipButton')}</button>
                    </div>

                </>
            )
            }



        </div>





    );
};
