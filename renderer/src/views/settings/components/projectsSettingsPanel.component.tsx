import type React from 'react';
import { ProjectsLocation } from '../../../components/settings/projectsLocation.component';
import { SettingsPanelSection } from './settingsPanelSection.component';

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
