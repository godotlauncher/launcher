import type { ProjectDetails } from '@shared/contracts';
import { useState } from 'react';
import { Dialog } from '../../../components/dialog.component';
import type { LocalImportRow } from '../local-import-editor.model';
import { getImportConflicts } from '../project-import-conflict.model';
import {
    ProjectImportReviewList,
    type ProjectImportReviewListItem,
} from './project-import-review-list.component';

type Props = {
    rows: LocalImportRow[];
    existing: ProjectDetails[];
    platform?: string;
    t: (key: string, options?: Record<string, unknown>) => string;
    onConfirm: (rows: LocalImportRow[]) => void;
    onCancel: () => void;
};

/** Reviews conflicting imports using the app's compact item presentation.
 * @param props - Inspected files, existing projects and completion callbacks.
 */
export function ProjectImportReview({
    rows,
    existing,
    platform,
    t,
    onConfirm,
    onCancel,
}: Props) {
    const [editorIds, setEditorIds] = useState(
        rows.map((row) => row.editorActionId),
    );
    const [names, setNames] = useState(rows.map((row) => row.name));
    const [skipped, setSkipped] = useState(new Set<number>());
    const [editing, setEditing] = useState<number | null>(null);
    const [draft, setDraft] = useState('');
    const selected = rows.flatMap((row, index) =>
        skipped.has(index)
            ? []
            : [
                  {
                      ...row,
                      name: names[index],
                      editorActionId: editorIds[index],
                  },
              ],
    );
    const conflicts = getImportConflicts(selected, existing, platform);
    let selectedIndex = 0;
    const items: ProjectImportReviewListItem[] = rows.map((row, index) => {
        const selected = !skipped.has(index);
        return {
            id: String(index),
            row,
            name: names[index],
            selected,
            editorActionId: editorIds[index],
            conflict: selected ? conflicts[selectedIndex++] : undefined,
            path:
                row.directory ??
                row.projectFilePath.replace(/[\\/][^\\/]*$/, ''),
        };
    });

    /** Saves the current inline name and returns to the compact display.
     * @param id - Stable row index being edited.
     */
    const saveName = (id: string) => {
        const index = Number(id);
        setNames((current) =>
            current.map((name, itemIndex) =>
                itemIndex === index ? draft.trim() : name,
            ),
        );
        setEditing(null);
    };

    return (
        <Dialog
            title={t('addProject.conflicts.title')}
            panelClassName="max-w-5xl"
            onRequestClose={onCancel}
            footer={
                <>
                    <span className="mr-auto self-center text-sm text-base-content/60">
                        {t('addProject.editorReview.summary', {
                            count: selected.length,
                            downloads: new Set(
                                selected.flatMap((row) => {
                                    const action = row.editorActions.find(
                                        (candidate) =>
                                            candidate.id === row.editorActionId,
                                    );
                                    return action?.download
                                        ? [
                                              `${action.download.version}:${row.editorRequest?.flavor}`,
                                          ]
                                        : [];
                                }),
                            ).size,
                        })}
                    </span>
                    <button
                        type="button"
                        className="btn btn-neutral"
                        onClick={onCancel}
                    >
                        {t('common:buttons.cancel')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={
                            editing !== null ||
                            selected.length === 0 ||
                            conflicts.some(Boolean)
                        }
                        onClick={() => onConfirm(selected)}
                    >
                        {t('addProject.conflicts.continue')}
                    </button>
                </>
            }
        >
            <p className="mb-3 text-sm text-base-content/70">
                {t('addProject.editorReview.description')}
            </p>
            <ProjectImportReviewList
                items={items}
                editingId={editing === null ? null : String(editing)}
                draft={draft}
                t={t}
                onToggle={(id, isSelected) => {
                    const index = Number(id);
                    setSkipped((current) => {
                        const next = new Set(current);
                        isSelected ? next.delete(index) : next.add(index);
                        return next;
                    });
                    if (editing === index) setEditing(null);
                }}
                onEdit={(id) => {
                    const index = Number(id);
                    setDraft(names[index]);
                    setEditing(index);
                }}
                onDraftChange={setDraft}
                onSave={saveName}
                onCancel={() => setEditing(null)}
                onEditorChange={(id, editorActionId) => {
                    const index = Number(id);
                    setEditorIds((current) =>
                        current.map((value, itemIndex) =>
                            itemIndex === index ? editorActionId : value,
                        ),
                    );
                }}
            />
        </Dialog>
    );
}
