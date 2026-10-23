import type { ProjectDetails, ProjectTagSelection } from '@shared/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProjectEntryTagRecovery } from '../components/project-tags/project-entry-tag-recovery.component';
import { projectsBridge, projectTagsBridge } from '../renderer.bridge';
import { saveProjectEntryTags } from '../views/projects/project-entry-tags.service';
import { useAlerts } from './alerts.hook';
import { useProjectTags } from './project-tags.hook';

/** Retains failed tag choices for a tag-only retry after project registration. */
export function useProjectEntryTags() {
    const { save } = useProjectTags();
    const [recovering, setRecovering] = useState(false);
    const { addCustomConfirm } = useAlerts();
    const { t } = useTranslation('projects');
    /** Applies captured choices without repeating creation or import on save failure.
     * @param project - Successfully registered project incarnation.
     * @param selection - Tags captured with this submission or import row.
     */
    const apply = async (
        project: ProjectDetails,
        selection: ProjectTagSelection[] = [],
    ): Promise<void> => {
        const captured = selection.map((tag) => ({ ...tag }));
        /** Revalidates the target and fresh memberships on every persistence attempt. */
        const saveTags = () =>
            saveProjectEntryTags({
                project,
                selection: captured,
                getProjects: () => projectsBridge.getProjectsDetails(),
                getSnapshot: () => projectTagsBridge.getSnapshot(),
                save,
            });
        try {
            await saveTags();
        } catch {
            setRecovering(true);
            await new Promise<void>((resolve) => {
                addCustomConfirm(
                    t('tags.label'),
                    (renderLayout, close) => (
                        <ProjectEntryTagRecovery
                            projectName={project.name}
                            renderLayout={renderLayout}
                            onRetry={saveTags}
                            onDone={() => {
                                close();
                                setRecovering(false);
                                resolve();
                            }}
                        />
                    ),
                    [],
                    undefined,
                    'warning',
                );
            });
        }
    };
    return { apply, recovering };
}
