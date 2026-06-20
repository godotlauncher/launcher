import type React from 'react';
import { ClearReleaseCacheControl } from '../../../components/settings/ClearReleaseCacheControl.component';
import { EditorsLocation } from '../../../components/settings/EditorLocation.component';
import { SettingsPanelSection } from './settingsPanelSection.component';

type InstallsSettingsPanelProps = {
    active: boolean;
};

export const InstallsSettingsPanel: React.FC<InstallsSettingsPanelProps> = ({
    active,
}) => (
    <SettingsPanelSection active={active} className=" ">
        <EditorsLocation />
        <div className="divider"></div>
        <ClearReleaseCacheControl />
    </SettingsPanelSection>
);
