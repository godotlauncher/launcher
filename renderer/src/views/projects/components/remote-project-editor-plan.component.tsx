import type { TFunction } from 'i18next';
import { SelectField } from '../../../components/ui/selectField.component';
import type {
    RemoteProjectEditorChoice,
    RemoteProjectEditorPlanGroup,
} from '../remote-project-editor-plan.model';

type RemoteProjectEditorPlanProps = {
    plan: RemoteProjectEditorPlanGroup[];
    t: TFunction;
    onChoiceChange: (key: string, choice: RemoteProjectEditorChoice) => void;
};

/** Renders grouped Godot editor requirements and resolution choices. */
export function RemoteProjectEditorPlan({
    plan,
    t,
    onChoiceChange,
}: RemoteProjectEditorPlanProps) {
    return (
        <div
            className="min-h-0 overflow-auto rounded-box border border-base-300"
            data-testid="remoteProjectEditorPlan"
        >
            <div className="grid grid-cols-[minmax(14rem,1fr)_minmax(12rem,1fr)_minmax(12rem,0.8fr)_minmax(14rem,1fr)] items-center gap-4 border-b border-base-300 bg-base-200 px-4 py-3 font-medium">
                <span>{t('editProject.godotEditor.title')}</span>
                <span>
                    {t('addProject.remote.editorBatch.affectedProjects')}
                </span>
                <span>{t('addProject.remote.editorBatch.resolution')}</span>
                <span>{t('addProject.remote.editorBatch.status')}</span>
            </div>
            {plan.map((group, index) => {
                const flavor = group.mono
                    ? t('installEditor:table.dotnet')
                    : t('installEditor:table.gdscript');
                const choiceOptions = [
                    ...(group.downloadableRelease
                        ? [
                              {
                                  value: 'download',
                                  label: t(
                                      'addProject.editorResolution.download',
                                      { version: group.version },
                                  ),
                              },
                          ]
                        : []),
                    ...(group.fallback
                        ? [
                              {
                                  value: 'use-fallback',
                                  label: t(
                                      'addProject.editorResolution.useFallback',
                                      { version: group.fallback.version },
                                  ),
                              },
                          ]
                        : []),
                    {
                        value: 'add-missing',
                        label: t('addProject.editorResolution.addMissing'),
                    },
                ];

                return (
                    <div
                        key={group.key}
                        className="grid grid-cols-[minmax(14rem,1fr)_minmax(12rem,1fr)_minmax(12rem,0.8fr)_minmax(14rem,1fr)] items-center gap-4 border-b border-base-300 px-4 py-4 last:border-b-0"
                    >
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium">
                                {group.version}
                            </span>
                            <span className="badge badge-outline badge-sm shrink-0">
                                {flavor}
                            </span>
                        </div>
                        <ul className="min-w-0 space-y-1 text-sm">
                            {group.candidates.map(({ project }) => (
                                <li
                                    key={project.projectFilePath}
                                    className="truncate"
                                    title={project.name}
                                >
                                    {project.name}
                                </li>
                            ))}
                        </ul>
                        <SelectField
                            id={`selectRemoteProjectEditorResolution-${index}`}
                            testId={`selectRemoteProjectEditorResolution-${index}`}
                            compact
                            showSelectedCheck
                            ariaLabel={`${group.version}: ${t('addProject.remote.editorBatch.resolution')}`}
                            value={group.choice}
                            onChange={(value) =>
                                onChoiceChange(
                                    group.key,
                                    value as RemoteProjectEditorChoice,
                                )
                            }
                            options={choiceOptions}
                        />
                        <div className="min-w-0">
                            <span className="text-sm text-base-content/70">
                                {t(
                                    'addProject.remote.editorBatch.statuses.ready',
                                )}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
