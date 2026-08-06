import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAlerts } from '../../hooks/useAlerts';
import { usePreferences } from '../../hooks/usePreferences';

type WindowsSymlinkSettingProps = {
    value?: boolean;
    onChange?: (enabled: boolean) => Promise<boolean> | boolean;
    disabled?: boolean;
    showDivider?: boolean;
    compact?: boolean;
};

export const WindowsSymlinkSetting: React.FC<WindowsSymlinkSettingProps> = ({
    value,
    onChange,
    disabled = false,
    showDivider = true,
    compact = false,
}) => {
    const { t } = useTranslation('settings');
    const { preferences, savePreferences, platform } = usePreferences();
    const { addCustomConfirm } = useAlerts();
    const [saving, setSaving] = useState(false);

    if (platform !== 'win32' || !preferences) {
        return null;
    }

    const enabled = value ?? preferences.windows_enable_symlinks;

    const applyPreferenceChange = async (nextValue: boolean) => {
        setSaving(true);
        try {
            if (onChange) {
                return await onChange(nextValue);
            }
            await savePreferences({
                ...preferences,
                windows_enable_symlinks: nextValue,
            });
        } finally {
            setSaving(false);
        }

        return true;
    };

    const handleToggleChange = (checked: boolean) => {
        if (enabled === checked) {
            return;
        }

        if (onChange) {
            void applyPreferenceChange(checked);
            return;
        }

        const title = checked
            ? t('windowsSymlinks.enableTitle')
            : t('windowsSymlinks.disableTitle');
        const actionLabel = checked
            ? t('windowsSymlinks.enableAction')
            : t('windowsSymlinks.disableAction');
        const description = checked ? (
            <div className="flex flex-col gap-2 text-sm">
                <p>{t('windowsSymlinks.enableDescription.line1')}</p>
                <p>{t('windowsSymlinks.enableDescription.line2')}</p>
                <p>{t('windowsSymlinks.enableDescription.line3')}</p>
            </div>
        ) : (
            <div className="flex flex-col gap-2 text-sm">
                <p>{t('windowsSymlinks.disableDescription.line1')}</p>
                <p>{t('windowsSymlinks.disableDescription.line2')}</p>
            </div>
        );

        addCustomConfirm(
            title,
            description,
            [
                {
                    isCancel: true,
                    typeClass: 'btn-neutral',
                    text: 'Cancel',
                },
                {
                    typeClass: 'btn-primary',
                    text: actionLabel,
                    onClick: () => applyPreferenceChange(checked),
                },
            ],
            <TriangleAlert className="text-warning" />,
        );
    };

    return (
        <>
            {showDivider && <div className="divider"></div>}
            <div className="flex flex-col gap-3">
                <div
                    className={
                        compact
                            ? 'flex items-start justify-between gap-5'
                            : 'flex flex-col gap-3'
                    }
                >
                    <div className="flex flex-col gap-1">
                        <h2 className="font-bold">
                            {t('windowsSymlinks.title')}{' '}
                            <span className="badge badge-sm badge-info">
                                {t('windowsSymlinks.windowsOnly')}
                            </span>
                        </h2>
                        <p className="text-sm text-base-content/80">
                            {t('windowsSymlinks.description')}
                        </p>
                    </div>
                    <label className="flex shrink-0 flex-row items-start gap-3">
                        <input
                            type="checkbox"
                            className="checkbox"
                            checked={enabled}
                            onChange={(e) =>
                                handleToggleChange(e.target.checked)
                            }
                            disabled={saving || disabled}
                        />
                        <span className="max-w-52 text-sm">
                            {t('windowsSymlinks.checkbox')}
                        </span>
                    </label>
                </div>
                {!compact && (
                    <p className="text-xs text-base-content/70">
                        {t('windowsSymlinks.note')}
                    </p>
                )}
                {enabled && (
                    <div className="alert alert-warning items-start py-3 text-sm">
                        <TriangleAlert
                            className="mt-0.5 size-5 shrink-0"
                            aria-hidden="true"
                        />
                        <span>
                            {t('windowsSymlinks.enableDescription.line2')}
                        </span>
                    </div>
                )}
            </div>
        </>
    );
};
