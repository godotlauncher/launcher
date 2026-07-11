import type { UserPreferences } from '@shared';
import type React from 'react';
import { AutoStartSetting } from '../../../components/settings/AutoStartSetting.component';
import { ProjectLaunchAction } from '../../../components/settings/projectLaunchAction.component';
import { WindowsSymlinkSetting } from '../../../components/settings/WindowsSymlinkSetting.component';
import { SettingsPanelSection } from './settingsPanelSection.component';

type Translate = (key: string) => string;

type BehaviorSettingsPanelProps = {
    active: boolean;
    t: Translate;
    preferences: UserPreferences | null;
    onPreferencesChange: (preferences: UserPreferences) => void;
};

export const BehaviorSettingsPanel: React.FC<BehaviorSettingsPanelProps> = ({
    active,
    t,
    preferences,
    onPreferencesChange,
}) => (
    <SettingsPanelSection active={active} className=" ">
        <div className="flex flex-col gap-4">
            <div>
                <h1 data-testid="projectsSettingsHeader" className="font-bold">
                    {t('behavior.projects.title')}
                </h1>
                <p data-testid="projectsSettingsSubHeader" className="text-sm">
                    {t('behavior.projects.description')}
                </p>
            </div>
            <div className=" flex flex-col gap-8">
                <label className="flex flex-row items-start cursor-pointer gap-4">
                    <input
                        type="checkbox"
                        className="checkbox"
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
                    <span className="">
                        {t('behavior.projects.confirmRemove')}
                    </span>
                </label>
            </div>
        </div>
        <div className="divider"></div>

        <ProjectLaunchAction />
        <WindowsSymlinkSetting />

        <div className="divider"></div>
        <AutoStartSetting />
    </SettingsPanelSection>
);
