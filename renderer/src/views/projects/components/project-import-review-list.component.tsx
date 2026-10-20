import {
    CircleCheck,
    CircleHelp,
    CircleMinus,
    CircleX,
    Download,
    FolderCheck,
    TriangleAlert,
} from 'lucide-react';
import { type ReactNode, type RefObject, useId } from 'react';
import { CopyBadge } from '../../../components/ui/copy-badge.component';
import { EditableTextField } from '../../../components/ui/editable-text-field.component';
import { ListGroupHeading } from '../../../components/ui/list-group-heading.component';
import { SelectField } from '../../../components/ui/select-field.component';
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
    disabled?: boolean;
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
    groupByAvailability?: boolean;
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
    groupByAvailability = false,
    onToggle,
    onEdit,
    onDraftChange,
    onSave,
    onCancel,
    onEditorChange,
}: ProjectImportReviewListProps) {
    const descriptionId = useId();
    const sections = groupByAvailability
        ? [
              {
                  key: 'available',
                  items: items.filter((item) => !item.disabled),
              },
              {
                  key: 'added',
                  items: items.filter(
                      (item) => item.disabled && item.row.registered,
                  ),
              },
              {
                  key: 'unavailable',
                  items: items.filter(
                      (item) => item.disabled && !item.row.registered,
                  ),
              },
          ].filter((section) => section.items.length > 0)
        : [{ key: 'all', items }];

    /** Renders a selectable project or its read-only summary.
     * @param item - Inspected project and its current review state.
     */
    const renderItem = (item: ProjectImportReviewListItem) => {
        const { row } = item;
        const hasNameConflict = item.selected && item.conflict === 'name';
        const conflictId = `${descriptionId}-${encodeURIComponent(item.id)}`;
        const action = row.editorActions.find(
            (candidate) => candidate.id === item.editorActionId,
        );
        const request = row.editorRequest ?? row.editorResolution?.requested;
        const status = item.disabled
            ? row.registered
                ? 'folder'
                : 'invalid'
            : !item.selected
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

        if (item.disabled) {
            return (
                <li
                    key={item.id}
                    className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-4 gap-y-2 rounded-md px-3 py-3 text-base-content/75 md:grid-cols-[1.25rem_minmax(10rem,1fr)_minmax(12rem,20rem)_1.5rem]"
                >
                    <StatusIcon size={18} className="mt-1" aria-hidden="true" />
                    <div className="col-start-2 flex min-w-0 flex-col items-start gap-2">
                        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-1 pl-3">
                            <span
                                className="min-w-0 truncate font-semibold"
                                title={item.name}
                            >
                                {item.name}
                            </span>
                            <span className="rounded-sm bg-base-content/8 px-2 py-0.5 text-sm">
                                {statusLabel}
                            </span>
                        </div>
                        {row.error && (
                            <p className="break-words pl-3 text-sm">
                                {row.error}
                            </p>
                        )}
                        <CopyBadge
                            value={item.path}
                            label={t('common:buttons.copyPath')}
                            copiedLabel={t('common:success')}
                            className="text-base-content"
                        />
                    </div>
                    {request && (
                        <p className="col-start-2 break-words text-sm md:col-start-3 md:row-start-1 md:pt-1">
                            {t(
                                request.kind === 'exact'
                                    ? 'addProject.editorReview.exact'
                                    : 'addProject.editorReview.requested',
                            )}
                            :{' '}
                            {request.kind === 'exact'
                                ? request.version
                                : request.base_version}
                            {' · '}
                            {t(`installEditor:table.${request.flavor}`)}
                        </p>
                    )}
                </li>
            );
        }

        return (
            <li
                key={item.id}
                className="grid min-h-[88px] grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-4 gap-y-2 rounded-md bg-base-content/2 px-3 py-3 hover:bg-base-content/5 md:grid-cols-[1.25rem_minmax(10rem,1fr)_minmax(12rem,20rem)_1.5rem]"
            >
                <input
                    type="checkbox"
                    className="checkbox checkbox-sm col-start-1 row-start-1 mt-1 shrink-0"
                    checked={item.selected}
                    aria-label={`${t('addProject.conflicts.include')}: ${item.name || row.projectFilePath}`}
                    onChange={(event) =>
                        onToggle(item.id, event.target.checked)
                    }
                />
                <div className="col-start-2 row-start-1 flex min-w-0 flex-col items-start gap-2">
                    <EditableTextField
                        value={item.name}
                        draft={draft}
                        editing={editingId === item.id}
                        ariaLabel={t('addProject.conflicts.label')}
                        ariaDescribedBy={
                            hasNameConflict ? conflictId : undefined
                        }
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
                        className="pl-3"
                        onEdit={() => onEdit(item.id)}
                        onDraftChange={onDraftChange}
                        onSave={() => onSave(item.id)}
                        onCancel={onCancel}
                    />
                    {hasNameConflict && (
                        <p
                            id={conflictId}
                            role="alert"
                            className="w-full max-w-[36ch] break-words pl-3 text-sm text-error"
                        >
                            {t('addProject.conflicts.name')}
                        </p>
                    )}
                    <CopyBadge
                        value={item.path}
                        label={t('common:buttons.copyPath')}
                        copiedLabel={t('common:success')}
                        className={!item.selected ? 'opacity-45' : undefined}
                    />
                </div>
                <div className="col-start-2 row-start-2 flex min-w-0 flex-col gap-1 md:col-start-3 md:row-start-1">
                    {request && (
                        <div className="flex min-w-0 items-center text-sm text-base-content/60">
                            <span className="min-w-0 break-words">
                                {t(
                                    request.kind === 'exact'
                                        ? 'addProject.editorReview.exact'
                                        : 'addProject.editorReview.requested',
                                )}
                                :{' '}
                                {request.kind === 'exact'
                                    ? request.version
                                    : request.base_version}
                                <span>
                                    {' · '}
                                    {t(`installEditor:table.${request.flavor}`)}
                                </span>
                            </span>
                            <TooltipIconButton
                                className="btn-xs ml-1 size-[24px] shrink-0"
                                label={`${t('addProject.editorReview.details')}: ${item.name}`}
                                placement="top"
                                tip={
                                    <div className="text-left">
                                        <p>
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
                    <SelectField
                        size="sm"
                        id={`import-editor-${item.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
                        ariaLabel={`${t('editProject.godotEditor.title')}: ${item.name}`}
                        fitOptionContent
                        disabled={
                            !item.selected ||
                            !!row.error ||
                            item.conflict === 'folder' ||
                            !row.editorResolution
                        }
                        value={item.editorActionId}
                        onChange={(value) => onEditorChange(item.id, value)}
                        options={row.editorActions.map((candidate) => ({
                            value: candidate.id,
                            selectedLabel: candidate.version
                                ? `${candidate.version}${candidate.flavor ? ` · ${t(`installEditor:table.${candidate.flavor}`)}` : ''}`
                                : undefined,
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
                                              version: `${candidate.name && candidate.name !== candidate.version ? `${candidate.name} (${candidate.version})` : (candidate.version ?? '')}${candidate.flavor ? ` · ${t(`installEditor:table.${candidate.flavor}`)}` : ''}${candidate.recommended ? ` - ${t('welcome:onboarding.setup.recommended')}` : ''}`,
                                          },
                                      ),
                        }))}
                    />
                    {item.secondaryControl}
                </div>
                <Tooltip
                    tip={statusLabel}
                    placement="top"
                    tone="default"
                    role="img"
                    ariaLabel={statusLabel}
                    className={`col-start-1 row-start-2 size-6 items-center justify-center md:col-start-4 md:row-start-1 md:self-center ${!item.selected ? 'text-base-content/60' : item.conflict || status === 'missing' ? 'text-warning' : status === 'download' ? 'text-info' : 'text-success'}`}
                >
                    <StatusIcon size={18} aria-hidden="true" />
                </Tooltip>
                {!hasNameConflict && (
                    <span role="status" className="sr-only">
                        {statusLabel}
                    </span>
                )}
            </li>
        );
    };

    return (
        <div className="flex flex-col gap-2 p-1 text-base">
            {sections.map((section) => (
                <section
                    key={section.key}
                    aria-labelledby={
                        groupByAvailability
                            ? `${descriptionId}-${section.key}-heading`
                            : undefined
                    }
                >
                    {groupByAvailability && (
                        <ListGroupHeading
                            id={`${descriptionId}-${section.key}-heading`}
                            title={t(
                                `addProject.folder.sections.${section.key}`,
                            )}
                            count={section.items.length}
                            headingLevel="h3"
                        />
                    )}
                    <ul className="flex flex-col gap-2">
                        {selectAll &&
                            (section.key === 'all' ||
                                section.key === 'available') && (
                                <li className="rounded-md bg-base-200/70 px-3 py-3">
                                    <label className="flex items-center gap-4">
                                        <input
                                            ref={selectAll.inputRef}
                                            type="checkbox"
                                            className="checkbox checkbox-sm"
                                            checked={selectAll.checked}
                                            onChange={(event) =>
                                                selectAll.onChange(
                                                    event.target.checked,
                                                )
                                            }
                                        />
                                        {selectAll.label}
                                    </label>
                                </li>
                            )}
                        {section.items.map(renderItem)}
                    </ul>
                </section>
            ))}
        </div>
    );
}
