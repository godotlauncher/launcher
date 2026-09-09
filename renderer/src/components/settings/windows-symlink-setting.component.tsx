import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAlerts } from '../../hooks/alerts.hook';
import { usePreferences } from '../../hooks/preferences.hook';
import { ContentDivider } from '../ui/content-divider.component';
import { StatusBadge } from '../ui/status-badge.component';
import { SettingsSection } from './settings-section.component';

type WindowsSymlinkSettingProps = {
    value?: boolean;
    onChange?: (enabled: boolean) => Promise<boolean> | boolean;
    disabled?: boolean;
    showDivider?: boolean;
};

/**
 * Renders Windows symlink preferences using shared settings styling.
 * @param props - Optional controlled preference, save callback and display state.
 * @returns The Windows-only settings section, or nothing on other platforms.
 */
export const WindowsSymlinkSetting: React.FC<WindowsSymlinkSettingProps> = ({
    value,
    onChange,
    disabled = false,
    showDivider = true,
}) => {
    const { t } = useTranslation('settings');
    const { preferences, savePreferences, platform } = usePreferences();
    const { addCustomConfirm } = useAlerts();
    const [saving, setSaving] = useState(false);

    if (platform !== 'win32' || !preferences) {
        return null;
    }

    const enabled = value ?? preferences.windows_enable_symlinks;

    /**
     * Saves the requested editor symlink preference.
     * @param nextValue - Whether future editor refreshes should use symlinks.
     */
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

    /**
     * Presents the consequences before changing the Windows editor preference.
     * @param checked - Requested symlink preference.
     */
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
            <div className="flex flex-col gap-[12px]">
                <p>{t('windowsSymlinks.enableDescription.line1')}</p>
                <div className="alert alert-warning alert-soft text-warning-content dark:text-warning">
                    <p>{t('windowsSymlinks.enableDescription.line2')}</p>
                </div>
                <p className="text-base-content/75">
                    {t('windowsSymlinks.enableDescription.line3')}
                </p>
            </div>
        ) : (
            <div className="flex flex-col gap-[12px]">
                <p>{t('windowsSymlinks.disableDescription.line1')}</p>
                <p className="text-base-content/75">
                    {t('windowsSymlinks.disableDescription.line2')}
                </p>
            </div>
        );

        addCustomConfirm(
            title,
            description,
            [
                {
                    isCancel: true,
                    typeClass: 'btn-ghost',
                    text: t('common:buttons.cancel'),
                },
                {
                    typeClass: checked ? 'btn-warning' : 'btn-primary',
                    text: actionLabel,
                    onClick: () => applyPreferenceChange(checked),
                },
            ],
            undefined,
            checked ? 'warning' : 'neutral',
        );
    };

    return (
        <>
            {showDivider && <ContentDivider />}
            <SettingsSection
                title={
                    <span className="inline-flex flex-wrap items-center gap-2">
                        {t('windowsSymlinks.title')}{' '}
                        <StatusBadge tone="info" className="font-normal">
                            {t('windowsSymlinks.windowsOnly')}
                        </StatusBadge>
                    </span>
                }
                description={t('windowsSymlinks.description')}
            >
                <label className="flex min-h-8 items-center gap-2">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={enabled}
                        onChange={(e) => handleToggleChange(e.target.checked)}
                        disabled={saving || disabled}
                    />
                    <span>{t('windowsSymlinks.checkbox')}</span>
                </label>
                <p className="text-base-content/75">
                    {t('windowsSymlinks.note')}
                </p>
                {enabled && (
                    <div className="alert alert-warning alert-soft items-start text-warning-content dark:text-warning">
                        <TriangleAlert
                            className="mt-0.5 size-5 shrink-0"
                            aria-hidden="true"
                        />
                        <span>
                            {t('windowsSymlinks.enableDescription.line2')}
                        </span>
                    </div>
                )}
            </SettingsSection>
        </>
    );
};
