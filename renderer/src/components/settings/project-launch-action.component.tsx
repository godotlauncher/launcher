import type { ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../../hooks/preferences.hook';
import { SettingsSection } from './settings-section.component';

/** Renders the labelled launch-action radio group using shared settings styling. */
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
        <SettingsSection
            title={t('behavior.projectLaunch.title')}
            description={t('behavior.projectLaunch.description')}
            titleTestId="projectLaunchSettingsHeader"
            descriptionTestId="projectLaunchSettingsSubHeader"
        >
            <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
                <legend className="sr-only">
                    {t('behavior.projectLaunch.title')}
                </legend>
                <label className="flex min-h-8 items-center gap-2">
                    <input
                        onChange={setProjectLaunchAction}
                        value="none"
                        data-testid="radioLaunchActionNone"
                        type="radio"
                        name="launch-action"
                        className="radio radio-sm"
                        checked={preferences?.post_launch_action === 'none'}
                    />
                    <span>{t('behavior.projectLaunch.none')}</span>
                </label>
                <label className="flex min-h-8 items-center gap-2">
                    <input
                        onChange={setProjectLaunchAction}
                        value="minimize"
                        data-testid="radioLaunchActionMinimize"
                        type="radio"
                        name="launch-action"
                        className="radio radio-sm"
                        checked={preferences?.post_launch_action === 'minimize'}
                    />
                    <span>{t('behavior.projectLaunch.minimize')}</span>
                </label>
                <label className="flex min-h-8 items-center gap-2">
                    <input
                        onChange={setProjectLaunchAction}
                        value="close_to_tray"
                        data-testid="radioLaunchActionClose"
                        type="radio"
                        name="launch-action"
                        className="radio radio-sm"
                        checked={
                            preferences?.post_launch_action === 'close_to_tray'
                        }
                    />
                    <span>{t('behavior.projectLaunch.closeToTray')}</span>
                </label>
            </fieldset>
        </SettingsSection>
    );
};
