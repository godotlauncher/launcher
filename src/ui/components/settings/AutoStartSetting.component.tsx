import clsx from 'clsx';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../../hooks/usePreferences';


export const AutoStartSetting: React.FC = () => {
    const { t } = useTranslation('settings');
    const { preferences, setAutoStart } = usePreferences();
    const { platform } = usePreferences();

    return (
        <div className="flex flex-col gap-4">
            <div>
                <h1 data-testid="startupSettingsHeader" className="font-bold">{t('behavior.autoStart.title')}</h1>
                <p data-testid="startupSettingsSubHeader" className="text-sm">{t('behavior.autoStart.description')}</p>
            </div>
            <div className="flex flex-col shrink items-start justify-center gap-0 ">
                {platform === 'linux'
                    ? (<span className="alert alert-warning flex flex-row gap-2 items-center"><TriangleAlert className='w-6' />{t('behavior.autoStart.linuxWarning')}</span>)
                    : (<>
                        <label className="label flex flex-row gap-4 ">
                            <input onChange={(e) => setAutoStart(e.target.checked, preferences?.start_in_tray || false)} data-testid="chkAutoStartCheckbox" type="checkbox" checked={preferences?.auto_start} className="checkbox" />
                            {t('behavior.autoStart.startOnBoot')}
                        </label>
                        <label className={clsx('label flex flex-row gap-4 pl-12', { 'cursor-not-allowed': (preferences?.auto_start === false) })} aria-disabled={preferences?.auto_start === false}>
                            <input onChange={(e) => setAutoStart(preferences?.auto_start || false, e.currentTarget.checked)} data-testid="chkStartInTrayCheckbox" type="checkbox" checked={preferences?.start_in_tray} className="checkbox" disabled={preferences?.auto_start === false} />
                            {t('behavior.autoStart.startInTray')}
                        </label>
                    </>)
                }
            </div>
        </div>
    );
};