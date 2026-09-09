import clsx from 'clsx';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../../hooks/preferences.hook';
import { SettingsSection } from './settings-section.component';

/** Renders startup preferences with shared settings typography and control sizing. */
export const AutoStartSetting: React.FC = () => {
    const { t } = useTranslation('settings');
    const { preferences, setAutoStart } = usePreferences();
    const { platform } = usePreferences();

    return (
        <SettingsSection
            title={t('behavior.autoStart.title')}
            description={t('behavior.autoStart.description')}
            titleTestId="startupSettingsHeader"
            descriptionTestId="startupSettingsSubHeader"
        >
            <div className="flex flex-col items-start gap-2">
                {platform === 'linux' ? (
                    <span className="alert alert-warning">
                        <TriangleAlert
                            className="size-5 shrink-0"
                            aria-hidden="true"
                        />
                        {t('behavior.autoStart.linuxWarning')}
                    </span>
                ) : (
                    <>
                        <label className="flex min-h-8 items-center gap-2">
                            <input
                                onChange={(e) =>
                                    setAutoStart(
                                        e.target.checked,
                                        preferences?.start_in_tray || false,
                                    )
                                }
                                data-testid="chkAutoStartCheckbox"
                                type="checkbox"
                                checked={preferences?.auto_start}
                                className="checkbox checkbox-sm"
                            />
                            {t('behavior.autoStart.startOnBoot')}
                        </label>
                        <label
                            className={clsx(
                                'flex min-h-8 items-center gap-2 pl-7',
                                {
                                    'text-base-content/50':
                                        preferences?.auto_start === false,
                                },
                            )}
                            aria-disabled={preferences?.auto_start === false}
                        >
                            <input
                                onChange={(e) =>
                                    setAutoStart(
                                        preferences?.auto_start || false,
                                        e.currentTarget.checked,
                                    )
                                }
                                data-testid="chkStartInTrayCheckbox"
                                type="checkbox"
                                checked={preferences?.start_in_tray}
                                className="checkbox checkbox-sm"
                                disabled={preferences?.auto_start === false}
                            />
                            {t('behavior.autoStart.startInTray')}
                        </label>
                    </>
                )}
            </div>
        </SettingsSection>
    );
};
