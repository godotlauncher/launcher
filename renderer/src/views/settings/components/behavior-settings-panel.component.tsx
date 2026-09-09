import type { UserPreferences } from '@shared/contracts';
import type React from 'react';
import { AutoStartSetting } from '../../../components/settings/auto-start-setting.component';
import { ProjectLaunchAction } from '../../../components/settings/project-launch-action.component';
import { SettingsSection } from '../../../components/settings/settings-section.component';
import { WindowsSymlinkSetting } from '../../../components/settings/windows-symlink-setting.component';
import { TrayAvailabilityNotice } from '../../../components/tray-availability-notice.component';
import { ContentDivider } from '../../../components/ui/content-divider.component';
import { useTrayAvailability } from '../../../hooks/tray-availability.hook';
import { SettingsPanelSection } from './settings-panel-section.component';

type Translate = (key: string) => string;

type BehaviorSettingsPanelProps = {
    active: boolean;
    t: Translate;
    preferences: UserPreferences | null;
    onPreferencesChange: (preferences: UserPreferences) => void;
};

/**
 * Renders behaviour preferences with shared settings sections.
 * @param props - Panel visibility, translations and preference update callback.
 * @returns The behaviour settings panel.
 */
export const BehaviorSettingsPanel: React.FC<BehaviorSettingsPanelProps> = ({
    active,
    t,
    preferences,
    onPreferencesChange,
}) => {
    const trayAvailability = useTrayAvailability(active);

    return (
        <SettingsPanelSection active={active}>
            <SettingsSection
                title={t('behavior.projects.title')}
                description={t('behavior.projects.description')}
                titleTestId="projectsSettingsHeader"
                descriptionTestId="projectsSettingsSubHeader"
            >
                <label className="flex min-h-8 items-center gap-2">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        data-testid="chkConfirmProjectRemoveCheckbox"
                        checked={preferences?.confirm_project_remove}
                        onChange={(event) => {
                            if (preferences) {
                                onPreferencesChange({
                                    ...preferences,
                                    confirm_project_remove:
                                        event.target.checked,
                                });
                            }
                        }}
                    />
                    <span>{t('behavior.projects.confirmRemove')}</span>
                </label>
            </SettingsSection>
            <ContentDivider />

            <TrayAvailabilityNotice
                available={trayAvailability}
                message={t('behavior.trayAvailability.warning')}
                details={[t('behavior.trayAvailability.closeFallback')]}
            />

            <ProjectLaunchAction />
            <WindowsSymlinkSetting />

            <ContentDivider />
            <AutoStartSetting />
        </SettingsPanelSection>
    );
};
