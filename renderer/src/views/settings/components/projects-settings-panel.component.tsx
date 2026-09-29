import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProjectsLocation } from '../../../components/settings/projects-location.component';
import { SettingsSection } from '../../../components/settings/settings-section.component';
import { ContentDivider } from '../../../components/ui/content-divider.component';
import { ManageProjectTagsDrawer } from '../../sub-views/manage-project-tags-drawer.subview';
import { SettingsPanelSection } from './settings-panel-section.component';

type ProjectsSettingsPanelProps = {
    active: boolean;
};

/** Shows project storage and shared tag settings.
 * @param props - Whether the Projects settings tab is active.
 */
export const ProjectsSettingsPanel: React.FC<ProjectsSettingsPanelProps> = ({
    active,
}) => {
    const { t } = useTranslation('projects');
    const [manageTags, setManageTags] = useState(false);
    return (
        <SettingsPanelSection active={active}>
            <ProjectsLocation />
            <ContentDivider />
            <SettingsSection
                title={t('tags.label')}
                description={t('tags.manage.description')}
            >
                <button
                    type="button"
                    className="btn btn-sm self-start text-base"
                    onClick={() => setManageTags(true)}
                >
                    {t('tags.manage.title')}
                </button>
            </SettingsSection>
            <ManageProjectTagsDrawer
                open={active && manageTags}
                onOpenChange={setManageTags}
            />
        </SettingsPanelSection>
    );
};
