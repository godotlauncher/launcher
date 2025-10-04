import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useAlerts } from '../../hooks/useAlerts';
import { usePreferences } from '../../hooks/usePreferences';
import { useTranslation } from 'react-i18next';

export const WindowsSymlinkSetting: React.FC = () => {
    const { preferences, savePreferences, platform } = usePreferences();
    const { addCustomConfirm } = useAlerts();
    const [saving, setSaving] = useState(false);
    const { t } = useTranslation();
    if (platform !== 'win32' || !preferences) {
        return null;
    }

    const applyPreferenceChange = async (nextValue: boolean) => {
        setSaving(true);
        try {
            await savePreferences({
                ...preferences,
                windows_enable_symlinks: nextValue,
            });
        }
        finally {
            setSaving(false);
        }

        return true;
    };

    const handleToggleChange = (checked: boolean) => {
        if (preferences.windows_enable_symlinks === checked) {
            return;
        }

        const title = checked ? t('settings.editor.symlink.enable.title') : t('settings.editor.symlink.disable.title');
        const actionLabel = checked ? t('settings.editor.symlink.enable.action') : t('settings.editor.symlink.disable.action');
        const description = checked
            ? (
                <div className="flex flex-col gap-2 text-sm">
                    <p>{t('settings.editor.symlink.enable.desc.1')}</p>
                    <p>{t('settings.editor.symlink.enable.desc.2')}</p>
                    <p>{t('settings.editor.symlink.enable.desc.3')}</p>
                </div>
            )
            : (
                <div className="flex flex-col gap-2 text-sm">
                    <p>{t('settings.editor.symlink.disable.desc.1')}</p>
                    <p>{t('settings.editor.symlink.disable.desc.2')}</p>
                </div>
            );

        addCustomConfirm(title, description, [
            {
                isCancel: true,
                typeClass: 'btn-neutral',
                text: t('Cancel'),
            },
            {
                typeClass: 'btn-primary',
                text: actionLabel,
                onClick: () => applyPreferenceChange(checked),
            },
        ], <TriangleAlert className="text-warning" />);
    };

    return (
        <>
            <div className="divider"></div>
            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                    <h2 className="font-bold">Editor symlinks <span className='badge badge-sm badge-info'>Windows Only</span></h2>
                    <p className="text-sm text-base-content/80">
                        Choose whether project editors use optional symbolic links or stay with local copies.
                    </p>
                </div>
                <label className="flex flex-row items-start gap-4 cursor-pointer">
                    <input
                        type="checkbox"
                        className="checkbox"
                        checked={preferences.windows_enable_symlinks}
                        onChange={(e) => handleToggleChange(e.target.checked)}
                        disabled={saving}
                    />
                    <span className="text-sm">
                        Use symbolic links for Windows project editors. This stays off by default so you can opt in when you are ready for potential elevation prompts during editor updates.
                    </span>
                </label>
                <p className="text-xs text-base-content/70">
                    Changing this setting does not convert existing project links; it only affects how future editor refreshes behave.
                </p>
            </div>
        </>
    );
};
