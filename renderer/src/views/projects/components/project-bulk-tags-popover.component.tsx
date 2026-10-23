import type { ProjectDetails, ProjectTagsSnapshot } from '@shared/contracts';
import { Plus, X } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    getProjectTagOptions,
    projectTagColours,
} from '../../../components/project-tags/project-tag.model';
import type { ActionMenuAnchorRect } from '../../../components/ui/action-menu.component';
import {
    getBulkTagMembership,
    type ProjectTagIntent,
} from '../project-bulk-tags.model';

type BulkTagsProps<T extends Pick<ProjectDetails, 'path'>> = {
    targets: T[];
    anchor: ActionMenuAnchorRect;
    snapshot: ProjectTagsSnapshot | null;
    loadFailed: boolean;
    busy: boolean;
    onReload: () => Promise<void>;
    onChange: (targets: T[], intent: ProjectTagIntent) => Promise<boolean>;
    onClose: (restoreFocus: boolean) => void;
    failure: { description: string; retry: () => Promise<boolean> } | null;
};

/** Edits tag membership against one frozen target set using the caller's save policy.
 * @param props - Captured targets, saved tags and guarded mutation operations.
 */
export function ProjectBulkTagsPopover<T extends Pick<ProjectDetails, 'path'>>({
    targets,
    anchor,
    snapshot,
    loadFailed,
    busy,
    onReload,
    onChange,
    onClose,
    failure,
}: BulkTagsProps<T>) {
    const { t } = useTranslation(['projects', 'menus']);
    const panel = useRef<HTMLDialogElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState('');
    const ready = snapshot !== null && !loadFailed;
    const [position, setPosition] = useState({
        left: 0,
        top: 0,
        maxHeight: 480,
    });
    const { matches, createName } = getProjectTagOptions(
        snapshot?.tags ?? [],
        [],
        query,
    );
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    useLayoutEffect(() => {
        const popup = panel.current;
        if (!popup) return;
        /** Keeps the popover within the viewport as its result content changes. */
        const reposition = () => {
            const width = popup.getBoundingClientRect().width;
            const below = window.innerHeight - anchor.bottom - 18;
            const above = anchor.top - 18;
            const openBelow = below >= 240 || below >= above;
            const height = Math.max(
                0,
                Math.min(480, openBelow ? below : above),
            );
            setPosition({
                left: Math.max(
                    12,
                    Math.min(anchor.left, window.innerWidth - width - 12),
                ),
                top: openBelow
                    ? anchor.bottom + 6
                    : Math.max(
                          12,
                          anchor.top - Math.min(popup.scrollHeight, height) - 6,
                      ),
                maxHeight: height,
            });
        };
        popup.showModal();
        reposition();
        (input.current ?? popup.querySelector('button'))?.focus({
            preventScroll: true,
        });
        const observer = new ResizeObserver(reposition);
        observer.observe(popup);
        window.addEventListener('resize', reposition);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', reposition);
            if (popup.open) popup.close();
        };
    }, [anchor]);
    useLayoutEffect(() => {
        if (ready && panel.current?.open)
            input.current?.focus({ preventScroll: true });
    }, [ready]);

    /** Saves one checkbox intent and restores focus only if the edit lost it.
     * @param intent - Explicit add/remove operation captured at activation.
     * @param clearQuery - Whether a newly created tag should clear search on success.
     */
    const change = async (intent: ProjectTagIntent, clearQuery = false) => {
        const focused = document.activeElement;
        const success = await onChange(targets, intent);
        if (success && clearQuery) setQuery('');
        requestAnimationFrame(() => {
            if (
                !panel.current?.open ||
                (document.activeElement !== document.body &&
                    document.activeElement !== focused)
            )
                return;
            const target =
                focused instanceof HTMLElement &&
                focused.isConnected &&
                !focused.hasAttribute('disabled')
                    ? focused
                    : input.current;
            target?.focus({ preventScroll: true });
        });
    };
    /** Closes a completed or pending edit without cancelling its saved work. */
    const close = () => {
        closeRef.current(true);
    };
    return (
        <dialog
            ref={panel}
            aria-modal="true"
            aria-label={t('selection.tags')}
            aria-busy={busy}
            className="fixed m-0 w-96 max-w-[calc(100vw-24px)] overflow-y-auto rounded-lg border border-base-content/20 bg-base-100 p-3 text-base text-base-content shadow-xl backdrop:bg-black/40"
            style={position}
            onCancel={(event) => {
                event.preventDefault();
                close();
            }}
            onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                close();
            }}
            onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                if (
                    event.clientX < bounds.left ||
                    event.clientX > bounds.right ||
                    event.clientY < bounds.top ||
                    event.clientY > bounds.bottom
                )
                    close();
            }}
        >
            <div className="flex items-center justify-between gap-2 border-b border-base-content/10 pb-2">
                <h3 className="font-semibold">{t('selection.tags')}</h3>
                {busy && (
                    <span
                        className="loading loading-spinner loading-xs"
                        aria-hidden="true"
                    />
                )}
                <span className="text-sm text-base-content/70">
                    {t('selection.selected', { count: targets.length })}
                </span>
                <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-square"
                    aria-label={t('menus:app.close')}
                    onClick={close}
                >
                    <X size={16} aria-hidden="true" />
                </button>
            </div>
            {failure && (
                <div
                    role="alert"
                    className="flex flex-col gap-2 border-b border-base-content/10 py-3 text-sm text-error"
                >
                    <p>{failure.description}</p>
                    <button
                        type="button"
                        className="btn btn-sm self-start"
                        disabled={busy}
                        onClick={async () => {
                            await failure.retry();
                            requestAnimationFrame(() => {
                                if (
                                    panel.current?.open &&
                                    document.activeElement === document.body
                                )
                                    input.current?.focus({
                                        preventScroll: true,
                                    });
                            });
                        }}
                    >
                        {t('tags.retry')}
                    </button>
                </div>
            )}
            {loadFailed ? (
                <div
                    role="alert"
                    className="flex items-center justify-between gap-2 py-3"
                >
                    <span>{t('tags.loadFailed')}</span>
                    <button
                        type="button"
                        className="btn btn-sm"
                        disabled={busy}
                        onClick={() => void onReload()}
                    >
                        {t('tags.retry')}
                    </button>
                </div>
            ) : !snapshot ? (
                <p role="status">{t('tags.loading')}</p>
            ) : (
                <div className="flex flex-col gap-3 pt-3">
                    <input
                        ref={input}
                        type="search"
                        aria-label={t('tags.placeholder')}
                        placeholder={t('tags.placeholder')}
                        className="input input-sm w-full text-base"
                        value={query}
                        readOnly={busy}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                            if (busy || event.nativeEvent.isComposing) return;
                            if (event.key === 'ArrowDown') {
                                event.preventDefault();
                                panel.current
                                    ?.querySelector<HTMLInputElement>(
                                        'input[type="checkbox"]',
                                    )
                                    ?.focus();
                            }
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                if (matches[0])
                                    void change({
                                        tag: { id: matches[0].id },
                                        add:
                                            getBulkTagMembership(
                                                targets,
                                                snapshot,
                                                matches[0].id,
                                            ).state !== 'all',
                                    });
                                else if (createName)
                                    void change(
                                        {
                                            tag: { name: createName },
                                            add: true,
                                        },
                                        true,
                                    );
                            }
                        }}
                    />
                    <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                        {matches.map((tag) => {
                            const membership = getBulkTagMembership(
                                targets,
                                snapshot,
                                tag.id,
                            );
                            return (
                                <label
                                    key={tag.id}
                                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-base-content/5"
                                >
                                    <input
                                        type="checkbox"
                                        className="checkbox checkbox-sm shrink-0"
                                        aria-label={tag.name}
                                        aria-description={t(
                                            'selection.tagMembership',
                                            {
                                                members: membership.count,
                                                total: membership.total,
                                            },
                                        )}
                                        checked={membership.state === 'all'}
                                        aria-checked={
                                            membership.state === 'some'
                                                ? 'mixed'
                                                : membership.state === 'all'
                                        }
                                        ref={(element) => {
                                            if (element)
                                                element.indeterminate =
                                                    membership.state === 'some';
                                        }}
                                        disabled={busy}
                                        onChange={() =>
                                            void change({
                                                tag: { id: tag.id },
                                                add: membership.state !== 'all',
                                            })
                                        }
                                    />
                                    <span
                                        aria-hidden="true"
                                        className="size-2.5 shrink-0 rounded-full"
                                        style={{
                                            backgroundColor:
                                                projectTagColours[tag.colour],
                                        }}
                                    />
                                    <span className="min-w-0 flex-1 break-words">
                                        {tag.name}
                                    </span>
                                    <span className="shrink-0 text-sm text-base-content/60">
                                        {t('selection.tagMembership', {
                                            members: membership.count,
                                            total: membership.total,
                                        })}
                                    </span>
                                </label>
                            );
                        })}
                        {createName && (
                            <button
                                type="button"
                                disabled={busy}
                                className="btn btn-ghost justify-start text-left"
                                onClick={() =>
                                    void change(
                                        {
                                            tag: { name: createName },
                                            add: true,
                                        },
                                        true,
                                    )
                                }
                            >
                                <Plus size={16} aria-hidden="true" />
                                {t('tags.create', { name: createName })}
                            </button>
                        )}
                        {matches.length === 0 && !createName && (
                            <p className="px-2 py-2 text-base-content/60">
                                {t('tags.empty')}
                            </p>
                        )}
                    </div>
                </div>
            )}
        </dialog>
    );
}
