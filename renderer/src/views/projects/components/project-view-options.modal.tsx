import { RestrictToVerticalAxis } from '@dnd-kit/abstract/modifiers';
import { Accessibility } from '@dnd-kit/dom';
import {
    DragDropProvider,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
} from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import type { ProjectSectionKey } from '@shared/contracts';
import { GripVertical, RotateCcw, Settings2, X } from 'lucide-react';
import { type RefObject, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../../../components/dialog.component';
import { DEFAULT_PROJECT_GROUP_ORDER } from '../project-group-order.model';
import { ProjectGroupIcon } from './project-group-icon.component';

type ProjectViewOptionsProps = {
    order: readonly ProjectSectionKey[];
    saving: boolean;
    returnFocusRef: RefObject<HTMLButtonElement | null>;
    onSave: (order: ProjectSectionKey[]) => Promise<boolean>;
    onClose: () => void;
};

/**
 * Makes the whole group row the pointer and keyboard sorting handle.
 * @param props - Group identity, position and save state.
 */
function SortableGroupRow({
    group,
    index,
    disabled,
}: {
    group: ProjectSectionKey;
    index: number;
    disabled: boolean;
}) {
    const { t } = useTranslation('projects');
    const { ref, handleRef, isDragging, isDropTarget } = useSortable({
        id: group,
        index,
        group: 'project-group-order',
        disabled,
    });
    return (
        <li ref={ref}>
            <button
                ref={handleRef}
                type="button"
                disabled={disabled}
                aria-label={t('pinning.reorder.label', {
                    project: t(`sections.${group}`),
                })}
                className={`flex min-h-14 w-full touch-none items-center gap-3 rounded-md border bg-base-200 px-4 py-3 text-left text-base font-semibold cursor-grab active:cursor-grabbing ${isDragging ? 'relative z-10 border-primary shadow-lg' : isDropTarget ? 'border-primary' : 'border-base-content/15 hover:border-primary'}`}
            >
                <GripVertical
                    size={16}
                    className="text-base-content/60"
                    aria-hidden="true"
                />
                <ProjectGroupIcon
                    group={group}
                    size={18}
                    className="text-base-content/70"
                    aria-hidden="true"
                />
                <span>{t(`sections.${group}`)}</span>
            </button>
        </li>
    );
}

/**
 * Edits a local group-order draft and saves only after confirmation.
 * @param props - Current saved order, save operation and modal focus targets.
 */
export function ProjectViewOptionsModal({
    order,
    saving,
    returnFocusRef,
    onSave,
    onClose,
}: ProjectViewOptionsProps) {
    const { t } = useTranslation(['projects', 'common']);
    const [draft, setDraft] = useState([...order]);
    const [saveFailed, setSaveFailed] = useState(false);
    const [sorting, setSorting] = useState(false);
    const sortingRef = useRef(false);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const accessibilityPlugin = useMemo(() => {
        /**
         * Describes a sortable group's current position for assistive technology.
         * @param key - Translated announcement key.
         * @param operation - Active sorting operation.
         */
        const announce = (
            key: string,
            operation: DragStartEvent['operation'],
        ) => {
            const source = operation.source;
            if (!isSortable(source)) return;
            return t(key, {
                project: t(`sections.${String(source.id)}`),
                position: source.index + 1,
                count: DEFAULT_PROJECT_GROUP_ORDER.length,
            });
        };
        return Accessibility.configure({
            screenReaderInstructions: {
                draggable: t('viewOptions.instructions'),
            },
            announcements: {
                dragstart: ({ operation }: DragStartEvent) =>
                    announce(
                        'pinning.reorder.announcements.pickedUp',
                        operation,
                    ),
                dragover: ({ operation }: DragOverEvent) =>
                    announce('pinning.reorder.announcements.moved', operation),
                dragend: ({ operation, canceled }: DragEndEvent) =>
                    announce(
                        canceled
                            ? 'pinning.reorder.announcements.cancelled'
                            : 'pinning.reorder.announcements.dropped',
                        operation,
                    ),
            },
        });
    }, [t]);
    /** Closes the draft only when no save or sort is in progress. */
    const close = () => {
        if (!saving && !sortingRef.current) onClose();
    };
    /**
     * Applies a completed drag to the draft while preserving cancelled sorts.
     * @param event - The sorting result from pointer or keyboard interaction.
     */
    const handleDragEnd = ({ operation, canceled }: DragEndEvent) => {
        sortingRef.current = false;
        setSorting(false);
        const source = operation.source;
        if (
            canceled ||
            !isSortable(source) ||
            source.initialIndex === source.index
        )
            return;
        setDraft((previous) => {
            const next = [...previous];
            const [group] = next.splice(source.initialIndex, 1);
            if (!group) return previous;
            next.splice(source.index, 0, group);
            return next;
        });
    };
    /** Saves the draft and keeps it available for retry after a failed write. */
    const save = async () => {
        setSaveFailed(false);
        const saved = await onSave([...draft]);
        if (!saved) setSaveFailed(true);
    };
    const defaultOrder = draft.every(
        (key, index) => key === DEFAULT_PROJECT_GROUP_ORDER[index],
    );
    return (
        <Dialog
            title={t('viewOptions.title')}
            icon={<Settings2 size={22} aria-hidden="true" />}
            testId="projectViewOptionsDialog"
            panelClassName="max-w-[460px]"
            initialFocusRef={cancelRef}
            returnFocusRef={returnFocusRef}
            onRequestClose={close}
            footer={
                <>
                    <button
                        type="button"
                        className="btn btn-ghost mr-auto text-sm"
                        disabled={defaultOrder || saving || sorting}
                        onClick={() =>
                            setDraft([...DEFAULT_PROJECT_GROUP_ORDER])
                        }
                    >
                        <RotateCcw size={16} aria-hidden="true" />
                        {t('viewOptions.restoreDefault')}
                    </button>
                    <button
                        ref={cancelRef}
                        type="button"
                        className="btn btn-ghost"
                        disabled={saving || sorting}
                        onClick={close}
                    >
                        {t('common:buttons.cancel')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={saving || sorting}
                        onClick={() => void save()}
                    >
                        {saving && (
                            <span
                                className="loading loading-spinner loading-xs"
                                aria-hidden="true"
                            />
                        )}
                        {t('tags.manage.save')}
                    </button>
                </>
            }
        >
            <button
                type="button"
                className="btn btn-ghost btn-sm btn-square absolute right-4 top-4"
                aria-label={t('viewOptions.close')}
                disabled={saving || sorting}
                onClick={close}
            >
                <X size={18} aria-hidden="true" />
            </button>
            <h2 className="font-semibold">{t('viewOptions.groupOrder')}</h2>
            <p className="mb-4 mt-1 text-sm text-base-content/75">
                {t('viewOptions.dragHelp')}
            </p>
            <DragDropProvider
                modifiers={[RestrictToVerticalAxis]}
                plugins={(defaults) =>
                    defaults.map((plugin) =>
                        plugin === Accessibility ? accessibilityPlugin : plugin,
                    )
                }
                onDragStart={() => {
                    sortingRef.current = true;
                    setSorting(true);
                }}
                onDragEnd={handleDragEnd}
            >
                <ol
                    className="flex flex-col gap-2"
                    aria-label={t('viewOptions.groupOrder')}
                >
                    {draft.map((group, index) => (
                        <SortableGroupRow
                            key={group}
                            group={group}
                            index={index}
                            disabled={saving}
                        />
                    ))}
                </ol>
            </DragDropProvider>
            {saveFailed && (
                <p role="alert" className="mt-4 text-error">
                    {t('viewOptions.saveFailed')}
                </p>
            )}
        </Dialog>
    );
}
