import { ChevronDown, ListChecks } from 'lucide-react';
import type { MouseEventHandler } from 'react';
import { Tooltip } from '../../../components/ui/tooltip.component';

type EditorSelectionToolbarProps = {
    enabled: boolean;
    selectedCount: number;
    disabled: boolean;
    actionsOpen: boolean;
    t: (key: string, options?: Record<string, unknown>) => string;
    onToggle: () => void;
    onOpenActions: MouseEventHandler<HTMLButtonElement>;
};

/**
 * Shows the compact selection toggle beside the editor-list search controls.
 *
 * @param props - Selection state, localised labels and toolbar actions.
 * @returns The selection toolbar.
 */
export function EditorSelectionToolbar({
    enabled,
    selectedCount,
    disabled,
    actionsOpen,
    t,
    onToggle,
    onOpenActions,
}: EditorSelectionToolbarProps) {
    const toggleLabel = t(enabled ? 'selection.disable' : 'selection.enable');
    return (
        <div className="flex shrink-0 items-center gap-3 pl-2">
            <Tooltip tip={toggleLabel} placement="top" delay={1000}>
                <button
                    type="button"
                    className={`btn btn-sm btn-square btn-ghost ${enabled ? 'bg-primary/15 text-primary' : ''}`}
                    aria-label={toggleLabel}
                    aria-pressed={enabled}
                    disabled={disabled}
                    onClick={onToggle}
                >
                    <ListChecks size={16} aria-hidden="true" />
                </button>
            </Tooltip>
            {enabled && (
                <>
                    <span
                        className="text-sm text-base-content/75"
                        role="status"
                    >
                        {t('selection.selected', { count: selectedCount })}
                    </span>
                    <button
                        type="button"
                        className="btn btn-sm btn-ghost bg-base-content/5 text-base"
                        aria-haspopup="dialog"
                        aria-expanded={actionsOpen}
                        disabled={disabled}
                        onClick={onOpenActions}
                    >
                        {t('selection.actions')}
                        <ChevronDown size={16} aria-hidden="true" />
                    </button>
                </>
            )}
        </div>
    );
}
