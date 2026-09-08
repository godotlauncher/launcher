import {
    CircleCheck,
    CircleHelp,
    CircleMinus,
    CircleX,
    Download,
    FolderCheck,
    TriangleAlert,
} from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import { CopyBadge } from '../../../components/ui/copyBadge.component';
import { EditableTextField } from '../../../components/ui/editable-text-field.component';
import { SelectField } from '../../../components/ui/selectField.component';
import { Tooltip } from '../../../components/ui/tooltip.component';
import { TooltipIconButton } from '../../../components/ui/tooltip-icon-button.component';
import type { LocalImportRow } from '../local-import-editor.model';

export type ProjectImportReviewListItem = {
    id: string;
    row: LocalImportRow;
    name: string;
    selected: boolean;
    editorActionId: string;
    conflict?: string;
    path: string;
    secondaryControl?: ReactNode;
};

type SelectAllControl = {
    checked: boolean;
    inputRef?: RefObject<HTMLInputElement | null>;
    label: string;
    onChange: (checked: boolean) => void;
};

type ProjectImportReviewListProps = {
    items: ProjectImportReviewListItem[];
    editingId: string | null;
    draft: string;
    t: (key: string, options?: Record<string, unknown>) => string;
    selectAll?: SelectAllControl;
    onToggle: (id: string, selected: boolean) => void;
    onEdit: (id: string) => void;
    onDraftChange: (value: string) => void;
    onSave: (id: string) => void;
    onCancel: () => void;
    onEditorChange: (id: string, editorActionId: string) => void;
};

/** Renders the shared compact project import rows and their inline controls.
 * @param props - Controlled project rows, editing state and selection callbacks.
 */
export function ProjectImportReviewList({
    items,
    editingId,
    draft,
    t,
    selectAll,
    onToggle,
    onEdit,
    onDraftChange,
    onSave,
    onCancel,
    onEditorChange,
}: ProjectImportReviewListProps) {
    return (
        <ul className="overflow-hidden rounded-lg border border-base-300">
            {selectAll && (
                <li className="border-b border-base-300 bg-base-200/70 px-4 py-3">
                    <label className="flex items-center gap-4 text-base">
                        <input
                            ref={selectAll.inputRef}
                            type="checkbox"
                            className="checkbox checkbox-primary checkbox-sm"
                            checked={selectAll.checked}
                            onChange={(event) =>
                                selectAll.onChange(event.target.checked)
                            }
                        />
                        {selectAll.label}
                    </label>
                </li>
            )}
            {items.map((item) => {
                const { row } = item;
                const action = row.editorActions.find(
                    (candidate) => candidate.id === item.editorActionId,
                );
                const request =
                    row.editorRequest ?? row.editorResolution?.requested;
                const status = !item.selected
                    ? 'skipped'
                    : (item.conflict ??
                      (action?.kind === 'download'
                          ? 'download'
                          : action?.kind === 'missing'
                            ? 'missing'
                            : 'ready'));
                const statusLabel = t(
                    status === 'download' || status === 'missing'
                        ? `addProject.editorReview.${status}`
                        : `addProject.conflicts.badges.${status}`,
                );
                const StatusIcon =
                    status === 'ready'
                        ? CircleCheck
                        : status === 'skipped'
                          ? CircleMinus
                          : status === 'download'
                            ? Download
                            : status === 'folder'
                              ? FolderCheck
                              : status === 'invalid'
                                ? CircleX
                                : TriangleAlert;
                const statusTone =
                    item.conflict || status === 'missing'
                        ? 'warning'
                        : status === 'download'
                          ? 'info'
                          : 'default';

                return (
                    <li
                        key={item.id}
                        className="grid min-h-[88px] grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-4 gap-y-2 border-b border-base-300 px-4 py-3 last:border-b-0 hover:bg-base-content/[0.03] md:grid-cols-[1.25rem_minmax(14rem,1fr)_max-content_minmax(13rem,16rem)_1.5rem]"
                    >
                        <input
                            type="checkbox"
                            className="checkbox checkbox-primary checkbox-sm col-start-1 row-start-1 mt-0.5 shrink-0"
                            checked={item.selected}
                            aria-label={`${t('addProject.conflicts.include')}: ${item.name || row.projectFilePath}`}
                            onChange={(event) =>
                                onToggle(item.id, event.target.checked)
                            }
                        />
                        <div className="col-start-2 row-start-1 min-w-0">
                            <EditableTextField
                                value={item.name}
                                draft={draft}
                                editing={editingId === item.id}
                                ariaLabel={t('addProject.conflicts.label')}
                                editLabel={`${t('addProject.conflicts.edit')}: ${item.name}`}
                                saveLabel={t('common:buttons.ok')}
                                cancelLabel={t('common:buttons.cancel')}
                                placeholder={t('addProject.conflicts.label')}
                                maxLength={255}
                                disabled={
                                    !item.selected ||
                                    item.conflict === 'folder' ||
                                    !!row.error
                                }
                                invalid={item.conflict === 'name'}
                                className="pl-2"
                                valueClassName={
                                    !item.selected
                                        ? 'text-base-content/45'
                                        : item.conflict === 'name'
                                          ? 'text-error'
                                          : undefined
                                }
                                onEdit={() => onEdit(item.id)}
                                onDraftChange={onDraftChange}
                                onSave={() => onSave(item.id)}
                                onCancel={onCancel}
                            />
                        </div>
                        {request && (
                            <div className="col-start-2 row-start-2 flex min-w-0 items-center text-sm text-base-content/50 md:col-start-3 md:row-start-1 md:pt-2">
                                <span className="whitespace-nowrap">
                                    {t(
                                        request.kind === 'exact'
                                            ? 'addProject.editorReview.exact'
                                            : 'addProject.editorReview.requested',
                                    )}
                                    :{' '}
                                    {request.kind === 'exact'
                                        ? request.version
                                        : request.base_version}
                                </span>
                                <TooltipIconButton
                                    label={`${t('addProject.editorReview.details')}: ${item.name}`}
                                    placement="top"
                                    className="border-0 text-base-content/50 hover:border-transparent hover:text-base-content/70"
                                    tip={
                                        <div className="text-left">
                                            <p className="font-medium">
                                                {t(
                                                    'addProject.editorReview.details',
                                                )}
                                            </p>
                                            {request.kind === 'exact' && (
                                                <p>
                                                    {t(
                                                        'addProject.editorResolution.version',
                                                    )}
                                                    : {request.version}
                                                </p>
                                            )}
                                            <p>
                                                {t(
                                                    'addProject.editorResolution.channel',
                                                )}
                                                : {request.channel}
                                            </p>
                                            <p>
                                                {t(
                                                    'addProject.editorResolution.flavor',
                                                )}
                                                : {request.flavor}
                                            </p>
                                            <p>
                                                {t(
                                                    'addProject.editorResolution.baseVersion',
                                                )}
                                                : {request.base_version}
                                            </p>
                                        </div>
                                    }
                                >
                                    <CircleHelp size={13} aria-hidden="true" />
                                </TooltipIconButton>
                            </div>
                        )}
                        <div className="col-start-2 row-start-3 min-w-0 md:col-start-4 md:row-start-1">
                            <SelectField
                                id={`import-editor-${item.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
                                ariaLabel={`${t('editProject.godotEditor.title')}: ${item.name}`}
                                compact
                                regularText
                                fitOptionContent
                                disabled={
                                    !item.selected ||
                                    !!row.error ||
                                    item.conflict === 'folder' ||
                                    !row.editorResolution
                                }
                                value={item.editorActionId}
                                onChange={(value) =>
                                    onEditorChange(item.id, value)
                                }
                                options={row.editorActions.map((candidate) => ({
                                    value: candidate.id,
                                    selectedLabel: candidate.version,
                                    label:
                                        candidate.kind === 'missing'
                                            ? t(
                                                  'addProject.editorResolution.addMissing',
                                              )
                                            : t(
                                                  candidate.kind === 'download'
                                                      ? 'addProject.editorResolution.download'
                                                      : 'addProject.editorResolution.useFallback',
                                                  {
                                                      version: `${candidate.name && candidate.name !== candidate.version ? `${candidate.name} (${candidate.version})` : (candidate.version ?? '')}${candidate.recommended ? ` - ${t('welcome:onboarding.setup.recommended')}` : ''}`,
                                                  },
                                              ),
                                }))}
                            />
                        </div>
                        <Tooltip
                            tip={statusLabel}
                            placement="top"
                            tone={statusTone}
                            role="img"
                            ariaLabel={statusLabel}
                            className={`col-start-1 row-start-2 size-6 items-center justify-center rounded-full md:col-start-5 md:row-start-1 md:mt-1.5 ${item.conflict || status === 'missing' ? 'text-warning' : !item.selected ? 'text-base-content/45' : status === 'download' ? 'text-info' : 'text-success'}`}
                        >
                            <StatusIcon
                                size={18}
                                strokeWidth={2.2}
                                aria-hidden="true"
                            />
                        </Tooltip>
                        <span role="status" className="sr-only">
                            {statusLabel}
                        </span>
                        <div className="col-start-2 row-start-4 flex min-w-0 flex-wrap items-center gap-2 md:col-end-5 md:row-start-2">
                            <CopyBadge
                                value={item.path}
                                label={t('common:buttons.copyPath')}
                                copiedLabel={t('common:success')}
                                className={`self-start bg-base-200/70 hover:bg-base-200 ${!item.selected ? 'opacity-45' : ''}`}
                            />
                            {item.secondaryControl}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
