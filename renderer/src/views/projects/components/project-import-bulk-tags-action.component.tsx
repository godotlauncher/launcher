import type { ProjectTagSelection } from '@shared/contracts';
import { Tag } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActionMenuAnchorRect } from '../../../components/ui/action-menu.component';
import { useProjectTags } from '../../../hooks/project-tags.hook';
import {
    changeImportTags,
    getImportTagSnapshot,
} from '../project-import-tags.model';
import { ProjectBulkTagsPopover } from './project-bulk-tags-popover.component';

type Props = {
    items: {
        id: string;
        selection: ProjectTagSelection[];
        selected: boolean;
        disabled: boolean;
    }[];
    onChange: (updates: Record<string, ProjectTagSelection[]>) => void;
};

/** Shares the project-list bulk picker while editing only import drafts.
 * @param props - Per-row drafts, eligibility and the form-owned staging callback.
 */
export function ProjectImportBulkTagsAction({ items, onChange }: Props) {
    const { t } = useTranslation('projects');
    const { snapshot, loadFailed, reload } = useProjectTags();
    const trigger = useRef<HTMLButtonElement>(null);
    const [popup, setPopup] = useState<{
        anchor: ActionMenuAnchorRect;
        targets: { path: string }[];
    } | null>(null);
    const eligible = items.filter((item) => item.selected && !item.disabled);
    const selections = Object.fromEntries(
        items.map((item) => [item.id, item.selection]),
    );
    const staged = snapshot
        ? getImportTagSnapshot(snapshot.tags, selections)
        : null;
    return (
        <>
            <button
                ref={trigger}
                type="button"
                className="btn btn-ghost btn-sm shrink-0"
                disabled={!eligible.length}
                aria-haspopup="dialog"
                aria-expanded={!!popup}
                onClick={() => {
                    if (!trigger.current || !eligible.length) return;
                    const rect = trigger.current.getBoundingClientRect();
                    setPopup({
                        anchor: {
                            width: rect.width,
                            height: rect.height,
                            left: rect.left,
                            right: rect.right,
                            top: rect.top,
                            bottom: rect.bottom,
                        },
                        targets: eligible.map((item) => ({ path: item.id })),
                    });
                }}
            >
                <Tag size={14} aria-hidden="true" />
                {t('addProject.tagSelected', { count: eligible.length })}
            </button>
            {popup && (
                <ProjectBulkTagsPopover
                    targets={popup.targets}
                    anchor={popup.anchor}
                    snapshot={staged}
                    loadFailed={loadFailed}
                    onReload={reload}
                    busy={false}
                    failure={null}
                    onClose={(restoreFocus) => {
                        setPopup(null);
                        if (restoreFocus)
                            requestAnimationFrame(() =>
                                trigger.current?.focus({ preventScroll: true }),
                            );
                    }}
                    onChange={async (targets, intent) => {
                        if (!snapshot) return false;
                        const allowed = new Set(
                            eligible.map((item) => item.id),
                        );
                        onChange(
                            changeImportTags(
                                snapshot.tags,
                                selections,
                                targets
                                    .map((target) => target.path)
                                    .filter((id) => allowed.has(id)),
                                intent,
                            ),
                        );
                        return true;
                    }}
                />
            )}
        </>
    );
}
