import type { RemoteDiscoveredProject } from '@shared/contracts';
import type { TFunction } from 'i18next';
import { TriangleAlert } from 'lucide-react';
import type { RefObject } from 'react';
import {
    SelectField,
    type SelectFieldOption,
} from '../../../components/ui/selectField.component';
import type { RemoteProjectCodeEditorChoice } from '../remote-project-import.model';
import { getRemoteDetectedEditorLabel } from '../remote-project-import.model';

type RemoteProjectReviewProps = {
    repositoryPath: string;
    projects: RemoteDiscoveredProject[];
    selectedPaths: Set<string>;
    allSelected: boolean;
    codeEditorChoices: Record<string, RemoteProjectCodeEditorChoice>;
    codeEditorOptions: SelectFieldOption[];
    selectAllRef: RefObject<HTMLInputElement | null>;
    t: TFunction;
    onToggleAll: (checked: boolean) => void;
    onToggleProject: (projectFilePath: string, checked: boolean) => void;
    onCodeEditorChange: (
        projectFilePath: string,
        choice: RemoteProjectCodeEditorChoice,
    ) => void;
};

/** Renders discovered projects and their registration choices. */
export function RemoteProjectReview({
    repositoryPath,
    projects,
    selectedPaths,
    allSelected,
    codeEditorChoices,
    codeEditorOptions,
    selectAllRef,
    t,
    onToggleAll,
    onToggleProject,
    onCodeEditorChange,
}: RemoteProjectReviewProps) {
    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div>
                <p className="font-medium">
                    {t('addProject.remote.review.title')}
                </p>
                <p className="text-sm text-base-content/70">
                    {t('addProject.remote.review.description')}
                </p>
            </div>
            <code className="break-all rounded-box bg-base-200 p-3 text-sm">
                {repositoryPath}
            </code>
            {projects.length === 0 ? (
                <div className="alert alert-warning alert-soft" role="status">
                    <TriangleAlert aria-hidden="true" size={18} />
                    <span>{t('addProject.remote.review.empty')}</span>
                </div>
            ) : (
                <div className="min-h-0 overflow-auto rounded-box border border-base-300">
                    <div className="grid grid-cols-[auto_minmax(9rem,0.7fr)_minmax(10rem,1.1fr)_minmax(8rem,0.65fr)_minmax(12rem,1fr)] items-center gap-4 border-b border-base-300 bg-base-200 px-4 py-3 font-medium">
                        <input
                            ref={selectAllRef}
                            data-testid="checkboxRemoteProjectSelectAll"
                            type="checkbox"
                            aria-label={t('addProject.remote.review.selectAll')}
                            className="checkbox checkbox-primary checkbox-sm"
                            checked={allSelected}
                            onChange={(event) =>
                                onToggleAll(event.target.checked)
                            }
                        />
                        <span>{t('table.name')}</span>
                        <span>{t('editProject.fields.path.label')}</span>
                        <span>{t('editProject.godotEditor.title')}</span>
                        <span>{t('editProject.codeEditor.title')}</span>
                    </div>
                    {projects.map((project, index) => {
                        const checkboxId = `remote-project-${index}`;
                        return (
                            <div
                                key={project.projectFilePath}
                                className="grid grid-cols-[auto_minmax(9rem,0.7fr)_minmax(10rem,1.1fr)_minmax(8rem,0.65fr)_minmax(12rem,1fr)] items-center gap-4 border-b border-base-300 px-4 py-3 last:border-b-0 hover:bg-base-200"
                            >
                                <input
                                    id={checkboxId}
                                    type="checkbox"
                                    className="checkbox checkbox-primary checkbox-sm"
                                    checked={selectedPaths.has(
                                        project.projectFilePath,
                                    )}
                                    onChange={(event) =>
                                        onToggleProject(
                                            project.projectFilePath,
                                            event.target.checked,
                                        )
                                    }
                                />
                                <label
                                    htmlFor={checkboxId}
                                    className="contents cursor-pointer"
                                >
                                    <span className="truncate font-medium">
                                        {project.name}
                                    </span>
                                    <code className="truncate text-xs text-base-content/60">
                                        {project.relativePath}
                                    </code>
                                    <code className="truncate text-xs">
                                        {getRemoteDetectedEditorLabel(
                                            project,
                                        ) ?? t('settings:tools.status.unknown')}
                                    </code>
                                </label>
                                <SelectField
                                    id={`selectRemoteProjectCodeEditor-${index}`}
                                    testId={`selectRemoteProjectCodeEditor-${index}`}
                                    compact
                                    showSelectedCheck
                                    ariaLabel={`${project.name}: ${t('editProject.codeEditor.title')}`}
                                    value={
                                        codeEditorChoices[
                                            project.projectFilePath
                                        ] ?? 'auto'
                                    }
                                    onChange={(value) =>
                                        onCodeEditorChange(
                                            project.projectFilePath,
                                            value as RemoteProjectCodeEditorChoice,
                                        )
                                    }
                                    options={codeEditorOptions}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
