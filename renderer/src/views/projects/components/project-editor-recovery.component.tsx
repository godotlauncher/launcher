import type { AddProjectToListResult } from '@shared/contracts';
import { Check, ChevronDown, Download } from 'lucide-react';
import { useState } from 'react';
import {
    ActionMenu,
    type ActionMenuAnchorRect,
    type ActionMenuItem,
    getActionMenuAnchorRect,
} from '../../../components/ui/action-menu.component';

type Translate = (key: string, options?: Record<string, unknown>) => string;
type Resolution = NonNullable<AddProjectToListResult['editorResolution']>;

/** Shows the requested editor and any compatible fallback.
 * @param props - Resolution details and translations.
 */
export function ProjectEditorRecoveryDetails({
    resolution,
    t,
}: {
    resolution: Resolution;
    t: Translate;
}) {
    const requested = resolution.requested;
    const flavour =
        requested.flavor === 'dotnet'
            ? '.NET'
            : requested.flavor === 'gdscript'
              ? t('createProject:editorPicker.standard')
              : requested.flavor;
    return (
        <div className="flex flex-col gap-4 text-base">
            <p className="text-base-content/75">
                {t('addProject.editorResolution.message')}
            </p>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-box bg-base-200/60 p-3">
                {requested.kind === 'exact' && (
                    <>
                        <dt className="text-base-content/60">
                            {t('addProject.editorResolution.version')}
                        </dt>
                        <dd className="break-all font-mono text-sm">
                            {requested.version}
                        </dd>
                    </>
                )}
                <dt className="text-base-content/60">
                    {t('addProject.editorResolution.channel')}
                </dt>
                <dd className="break-words">
                    {requested.channel === 'official'
                        ? t('addProject.editorResolution.official')
                        : requested.channel === 'custom'
                          ? t('createProject:editorPicker.custom')
                          : requested.channel}
                </dd>
                <dt className="text-base-content/60">
                    {t('addProject.editorResolution.flavor')}
                </dt>
                <dd className="break-words">{flavour}</dd>
                <dt className="text-base-content/60">
                    {t('addProject.editorResolution.baseVersion')}
                </dt>
                <dd className="break-all font-mono text-sm">
                    {requested.base_version}
                </dd>
            </dl>
            {resolution.fallback && (
                <div className="flex flex-col gap-2">
                    <p className="text-base-content/75">
                        {t('addProject.editorResolution.fallbackMessage')}
                    </p>
                    <span className="break-words font-semibold">
                        {resolution.fallback.name ??
                            resolution.fallback.version}
                    </span>
                </div>
            )}
        </div>
    );
}

/** Offers existing recovery actions through the shared menu.
 * @param props - Actions, translated trigger label and selection callback.
 */
export function ProjectEditorRecoveryActions({
    actions,
    label,
    onSelect,
}: {
    actions: { label: string; installed: boolean; source: string }[];
    label: string;
    onSelect: (index: number) => void;
}) {
    const [anchor, setAnchor] = useState<ActionMenuAnchorRect | null>(null);
    const items: ActionMenuItem[] = actions.flatMap(
        (action, index): ActionMenuItem[] => [
            ...(action.source === 'custom' &&
            actions[index - 1]?.source !== 'custom' &&
            index > 0
                ? [{ type: 'separator' as const, key: `separator-${index}` }]
                : []),
            {
                key: String(index),
                label: action.label,
                icon: action.installed ? (
                    <Check size={16} aria-hidden="true" />
                ) : (
                    <Download size={16} aria-hidden="true" />
                ),
                onSelect: () => onSelect(index),
            },
        ],
    );
    return (
        <>
            <button
                type="button"
                className="btn btn-primary text-base"
                aria-haspopup="menu"
                aria-expanded={anchor !== null}
                onClick={(event) =>
                    setAnchor(getActionMenuAnchorRect(event.currentTarget))
                }
            >
                {label}
                <ChevronDown size={16} aria-hidden="true" />
            </button>
            <ActionMenu
                open={anchor !== null}
                anchorRect={anchor}
                ariaLabel={label}
                items={items}
                onClose={() => setAnchor(null)}
            />
        </>
    );
}
