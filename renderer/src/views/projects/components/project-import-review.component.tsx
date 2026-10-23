import type { ProjectDetails, ProjectTagSelection } from '@shared/contracts';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../../components/dialog.component';
import { ProjectEntryTagField } from '../../../components/project-tags/project-entry-tag-field.component';
import {
    applyImportDownloadPreference,
    type LocalImportRow,
} from '../local-import-editor.model';
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

/** Reviews local imports with bulk controls above the scrolling project rows.
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
    const [downloadMissingEditors, setDownloadMissingEditors] = useState(
        rows[0]?.downloadMissingEditors ?? true,
    );
    const effectiveRows = applyImportDownloadPreference(
        rows,
        downloadMissingEditors,
    );
    const [editorIds, setEditorIds] = useState(
        rows.map((row) => row.editorActionId),
    );
    const [tagSelections, setTagSelections] = useState<ProjectTagSelection[][]>(
        rows.map((row) => row.tagSelection ?? []),
    );
    const [names, setNames] = useState(rows.map((row) => row.name));
    const [skipped, setSkipped] = useState(new Set<number>());
    const [editing, setEditing] = useState<number | null>(null);
    const selectAllRef = useRef<HTMLInputElement>(null);
    const [draft, setDraft] = useState('');
    const selected = effectiveRows.flatMap((row, index) =>
        skipped.has(index)
            ? []
            : [
                  {
                      ...row,
                      name: names[index],
                      tagSelection: tagSelections[index],
                      editorActionId: editorIds[index],
                  },
              ],
    );
    const conflicts = getImportConflicts(selected, existing, platform);
    let selectedIndex = 0;
    const items: ProjectImportReviewListItem[] = effectiveRows.map(
        (row, index) => {
            const selected = !skipped.has(index);
            return {
                id: String(index),
                row,
                name: names[index],
                selected,
                editorActionId: editorIds[index],
                conflict: selected ? conflicts[selectedIndex++] : undefined,
                tagSelection: tagSelections[index],
                tagControl: (
                    <ProjectEntryTagField
                        selection={tagSelections[index]}
                        disabled={
                            !selected ||
                            !!row.error ||
                            row.registered ||
                            conflicts[selectedIndex - 1] === 'folder'
                        }
                        onChange={(tags) =>
                            setTagSelections((current) =>
                                current.map((value, position) =>
                                    position === index ? tags : value,
                                ),
                            )
                        }
                    />
                ),
                path:
                    row.directory ??
                    row.projectFilePath.replace(/[\\/][^\\/]*$/, ''),
            };
        },
    );

    const eligible = items.filter(
        (item) =>
            !item.row.error &&
            !item.row.registered &&
            item.conflict !== 'folder',
    );
    const allSelected =
        eligible.length > 0 && eligible.every((item) => item.selected);
    useEffect(() => {
        if (selectAllRef.current)
            selectAllRef.current.indeterminate =
                !allSelected && eligible.some((item) => item.selected);
    }, [eligible, allSelected]);

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
            bodyClassName="flex flex-col overflow-hidden pr-6"
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
                        className="btn btn-ghost text-base"
                        onClick={onCancel}
                    >
                        {t('common:buttons.cancel')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary text-base"
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
            <p className="mb-4 shrink-0 text-base text-base-content/75">
                {t('addProject.editorReview.description')}
            </p>
            <ProjectImportReviewList
                items={items}
                downloadMissingEditors={downloadMissingEditors}
                onDownloadMissingEditorsChange={setDownloadMissingEditors}
                selectAll={
                    rows.length > 1
                        ? {
                              checked: allSelected,
                              inputRef: selectAllRef,
                              label: t('addProject.remote.review.selectAll'),
                              onChange: (checked) =>
                                  setSkipped(
                                      new Set(
                                          items
                                              .filter(
                                                  (item) =>
                                                      !checked ||
                                                      !eligible.includes(item),
                                              )
                                              .map((item) => Number(item.id)),
                                      ),
                                  ),
                          }
                        : undefined
                }
                onTagsChange={(updates) =>
                    setTagSelections((current) =>
                        current.map(
                            (tags, index) => updates[String(index)] ?? tags,
                        ),
                    )
                }
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
