import type React from 'react';
import { ClearReleaseCacheControl } from '../../../components/settings/clear-release-cache-control.component';
import { EditorsLocation } from '../../../components/settings/editor-location.component';
import { ContentDivider } from '../../../components/ui/content-divider.component';
import { SettingsPanelSection } from './settings-panel-section.component';

type InstallsSettingsPanelProps = {
    active: boolean;
};

export const InstallsSettingsPanel: React.FC<InstallsSettingsPanelProps> = ({
    active,
}) => (
    <SettingsPanelSection active={active}>
        <EditorsLocation />
        <ContentDivider />
        <ClearReleaseCacheControl />
    </SettingsPanelSection>
);
