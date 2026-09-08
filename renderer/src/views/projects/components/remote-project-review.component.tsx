import type { RemoteDiscoveredProject } from '@shared/contracts';
import type { TFunction } from 'i18next';
import { Code2 } from 'lucide-react';
import { type RefObject, useEffect, useState } from 'react';
import { CopyBadge } from '../../../components/ui/copyBadge.component';
import {
    SelectField,
    type SelectFieldOption,
} from '../../../components/ui/selectField.component';
import type { LocalImportRow } from '../local-import-editor.model';
import type { RemoteProjectCodeEditorChoice } from '../remote-project-import.model';
import {
    ProjectImportReviewList,
    type ProjectImportReviewListItem,
} from './project-import-review-list.component';

type RemoteProjectReviewProps = {
    importNames: Record<string, string>;
    editorActionIds: Record<string, string>;
    conflicts: Record<string, string | undefined>;
    onNameChange: (file: string, name: string) => void;
    onEditingChange: (editing: boolean) => void;
    onGodotEditorChange: (file: string, editorActionId: string) => void;
    repositoryPath: string;
    projects: RemoteDiscoveredProject[];
    rows: LocalImportRow[];
    selectedPaths: Set<string>;
    allSelected: boolean;
    codeEditorChoices: Record<string, RemoteProjectCodeEditorChoice>;
    codeEditorOptions: SelectFieldOption[];
    selectAllRef: RefObject<HTMLInputElement | null>;
    t: TFunction;
    onToggleAll: (checked: boolean) => void;
    onToggleProject: (file: string, checked: boolean) => void;
    onCodeEditorChange: (
        file: string,
        choice: RemoteProjectCodeEditorChoice,
    ) => void;
};

/** Renders discovered remote projects with the shared compact import controls.
 * @param props - Inspected projects, current choices and controlled callbacks.
 */
export function RemoteProjectReview({
    repositoryPath,
    projects,
    rows,
    selectedPaths,
    allSelected,
    codeEditorChoices,
    codeEditorOptions,
    editorActionIds,
    selectAllRef,
    t,
    onToggleAll,
    onToggleProject,
    onCodeEditorChange,
    onGodotEditorChange,
    importNames,
    conflicts,
    onNameChange,
    onEditingChange,
}: RemoteProjectReviewProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    useEffect(
        () => () => {
            onEditingChange(false);
        },
        [onEditingChange],
    );
    const rowByPath = new Map(rows.map((row) => [row.projectFilePath, row]));
    const items: ProjectImportReviewListItem[] = projects.flatMap((project) => {
        const row = rowByPath.get(project.projectFilePath);
        if (!row) return [];
        const selected = selectedPaths.has(project.projectFilePath);
        const codeEditorValue =
            codeEditorChoices[project.projectFilePath] ?? 'auto';
        return [
            {
                id: project.projectFilePath,
                row,
                name: importNames[project.projectFilePath] ?? row.name,
                selected,
                editorActionId:
                    editorActionIds[project.projectFilePath] ??
                    row.editorActionId,
                conflict: selected
                    ? conflicts[project.projectFilePath]
                    : undefined,
                path: project.relativePath,
                secondaryControl: (
                    <SelectField
                        id={`selectRemoteProjectCodeEditor-${project.projectFilePath.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
                        testId={`selectRemoteProjectCodeEditor-${projects.indexOf(project)}`}
                        appearance="chip"
                        startIcon={<Code2 size={14} aria-hidden="true" />}
                        compact
                        regularText
                        fitOptionContent
                        showSelectedCheck
                        disabled={!selected}
                        ariaLabel={`${project.name}: ${t('editProject.codeEditor.title')}`}
                        value={codeEditorValue}
                        onChange={(value) =>
                            onCodeEditorChange(
                                project.projectFilePath,
                                value as RemoteProjectCodeEditorChoice,
                            )
                        }
                        options={codeEditorOptions.map((option) => ({
                            ...option,
                            selectedLabel: `${t('editProject.codeEditor.title')}: ${option.label}`,
                        }))}
                    />
                ),
            },
        ];
    });

    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div>
                <h2 className="text-base font-semibold">
                    {t('addProject.remote.review.title')}
                </h2>
                <p className="text-sm text-base-content/70">
                    {t('addProject.editorReview.description')}
                </p>
            </div>
            <CopyBadge
                value={repositoryPath}
                label={t('common:buttons.copyPath')}
                copiedLabel={t('common:success')}
                className="self-start bg-base-200/70 hover:bg-base-200"
            />
            {projects.length === 0 ? (
                <p role="status">{t('addProject.remote.review.empty')}</p>
            ) : (
                <div className="min-h-0 overflow-auto">
                    <ProjectImportReviewList
                        items={items}
                        editingId={editingId}
                        draft={draft}
                        t={t}
                        selectAll={{
                            checked: allSelected,
                            inputRef: selectAllRef,
                            label: t('addProject.remote.review.selectAll'),
                            onChange: onToggleAll,
                        }}
                        onToggle={(file, selected) => {
                            onToggleProject(file, selected);
                            if (editingId === file) {
                                setEditingId(null);
                                onEditingChange(false);
                            }
                        }}
                        onEdit={(file) => {
                            const row = rowByPath.get(file);
                            setDraft(importNames[file] ?? row?.name ?? '');
                            setEditingId(file);
                            onEditingChange(true);
                        }}
                        onDraftChange={setDraft}
                        onSave={(file) => {
                            onNameChange(file, draft.trim());
                            setEditingId(null);
                            onEditingChange(false);
                        }}
                        onCancel={() => {
                            setEditingId(null);
                            onEditingChange(false);
                        }}
                        onEditorChange={onGodotEditorChange}
                    />
                </div>
            )}
        </div>
    );
}
