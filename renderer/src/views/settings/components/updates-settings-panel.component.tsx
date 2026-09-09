import type React from 'react';
import { CheckForUpdates } from '../../../components/settings/check-for-updates.component';
import { SettingsPanelSection } from './settings-panel-section.component';

type UpdatesSettingsPanelProps = {
    active: boolean;
};

export const UpdatesSettingsPanel: React.FC<UpdatesSettingsPanelProps> = ({
    active,
}) => (
    <SettingsPanelSection active={active}>
        <CheckForUpdates />
    </SettingsPanelSection>
);
