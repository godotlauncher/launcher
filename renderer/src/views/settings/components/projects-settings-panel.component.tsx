import type React from 'react';
import { ProjectsLocation } from '../../../components/settings/projects-location.component';
import { SettingsPanelSection } from './settings-panel-section.component';

type ProjectsSettingsPanelProps = {
    active: boolean;
};

export const ProjectsSettingsPanel: React.FC<ProjectsSettingsPanelProps> = ({
    active,
}) => (
    <SettingsPanelSection active={active}>
        <ProjectsLocation />
    </SettingsPanelSection>
);
