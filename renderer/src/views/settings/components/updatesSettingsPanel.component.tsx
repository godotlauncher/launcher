import type React from 'react';
import { CheckForUpdates } from '../../../components/settings/checkForUpdates.component';
import { SettingsPanelSection } from './settingsPanelSection.component';

type UpdatesSettingsPanelProps = {
    active: boolean;
};

export const UpdatesSettingsPanel: React.FC<UpdatesSettingsPanelProps> = ({
    active,
}) => (
    <SettingsPanelSection active={active} className=" ">
        <CheckForUpdates />
    </SettingsPanelSection>
);
