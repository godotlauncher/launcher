import type { ProjectTag, ProjectTagSelection } from '@shared/contracts';
import { ChevronDown, Tag } from 'lucide-react';
import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSelectedProjectTags, projectTagColours } from './project-tag.model';
import { ProjectTagIndicators } from './project-tag-indicators.component';
import { ProjectTagPicker } from './project-tag-picker.component';

type ProjectTagPopoverProps = {
    tags: ProjectTag[];
    selection: ProjectTagSelection[];
    variant?: 'row' | 'field';
    changed?: boolean;
    disabled?: boolean;
    loading?: boolean;
    loadFailed?: boolean;
    onRetry?: () => Promise<void>;
    onChange: (selection: ProjectTagSelection[]) => unknown;
};

/** Shares the tag picker between immediate row edits and staged settings edits.
 * @param props - Tags, presentation and the caller's persistence policy.
 */
export function ProjectTagPopover({
    tags,
    selection,
    variant = 'row',
    changed = false,
    disabled = false,
    loading = false,
    loadFailed = false,
    onRetry,
    onChange,
}: ProjectTagPopoverProps) {
    const { t } = useTranslation('projects');
    const id = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [error, setError] = useState(false);
    const [position, setPosition] = useState({ left: 0, top: 0 });
    const selected = getSelectedProjectTags(selection, tags);
    /** Fits the picker beside its trigger without scrolling the drawer or row. */
    const reposition = useCallback(() => {
        if (!trigger.current || !panel.current) return;
        const anchor = trigger.current.getBoundingClientRect();
        const popup = panel.current.getBoundingClientRect();
        setPosition({
            left: Math.max(
                12,
                Math.min(anchor.left, window.innerWidth - popup.width - 12),
            ),
            top:
                anchor.bottom + popup.height + 6 <= window.innerHeight - 12
                    ? anchor.bottom + 6
                    : Math.max(12, anchor.top - popup.height - 6),
        });
    }, []);
    useLayoutEffect(() => {
        if (!open) return;
        reposition();
        if (!loading && !loadFailed)
            input.current?.focus({ preventScroll: true });
        const observer = new ResizeObserver(reposition);
        if (panel.current) observer.observe(panel.current);
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
        };
    }, [open, loading, loadFailed, reposition]);
    /** Leaves the existing selection available when an immediate save fails.
     * @param next - Requested tag membership and colours.
     */
    const change = async (next: ProjectTagSelection[]) => {
        setError(false);
        try {
            await onChange(next);
            return true;
        } catch {
            setError(true);
            return false;
        }
    };
    return (
        <>
            {variant === 'row' ? (
                <ProjectTagIndicators
                    tags={selected}
                    label={t('tags.label')}
                    triggerRef={trigger}
                    popoverId={id}
                    open={open}
                    disabled={disabled}
                />
            ) : (
                <div className="flex min-w-0 flex-col gap-2">
                    <label
                        htmlFor={`${id}-trigger`}
                        className="flex items-center gap-2 font-semibold"
                    >
                        {t('tags.label')}
                        {changed && (
                            <span
                                className="size-1.5 rounded-full bg-warning"
                                aria-hidden="true"
                                title={t('tags.unsaved')}
                            />
                        )}
                    </label>
                    <button
                        ref={trigger}
                        id={`${id}-trigger`}
                        type="button"
                        data-testid="btnProjectTagsField"
                        disabled={disabled}
                        popoverTarget={id}
                        aria-haspopup="dialog"
                        aria-expanded={open}
                        aria-controls={id}
                        aria-label={t('tags.label')}
                        className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-md border border-base-content/20 bg-base-100 px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-primary"
                    >
                        <Tag
                            size={16}
                            className="shrink-0 text-base-content/60"
                            aria-hidden="true"
                        />
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                            {selected.length ? (
                                selected.slice(0, 3).map((tag) => (
                                    <span
                                        key={tag.id}
                                        className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-base-content/10 px-2 py-0.5 text-sm"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="size-2 shrink-0 rounded-full"
                                            style={{
                                                backgroundColor:
                                                    projectTagColours[
                                                        tag.colour
                                                    ],
                                            }}
                                        />
                                        <span className="truncate">
                                            {tag.name}
                                        </span>
                                    </span>
                                ))
                            ) : (
                                <span className="text-base-content/50">
                                    {t('tags.none')}
                                </span>
                            )}
                            {selected.length > 3 && (
                                <span className="shrink-0 text-sm text-base-content/60">
                                    +{selected.length - 3}
                                </span>
                            )}
                        </span>
                        <ChevronDown
                            size={16}
                            className="shrink-0"
                            aria-hidden="true"
                        />
                    </button>
                </div>
            )}
            <div
                ref={panel}
                id={id}
                popover="auto"
                role="dialog"
                aria-label={t('tags.label')}
                className="fixed m-0 w-96 max-w-[calc(100vw-24px)] overflow-y-auto rounded-lg border border-base-content/20 bg-base-100 p-3 text-base text-base-content shadow-xl"
                style={{ ...position, maxHeight: 'calc(100vh - 24px)' }}
                onToggle={(event) => {
                    if (event.target !== event.currentTarget) return;
                    const next = event.newState === 'open';
                    setOpen(next);
                    if (next) setError(false);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        panel.current?.hidePopover();
                        trigger.current?.focus({ preventScroll: true });
                    }
                    if (event.key === 'Tab')
                        window.requestAnimationFrame(() => {
                            if (
                                !panel.current?.contains(document.activeElement)
                            )
                                panel.current?.hidePopover();
                        });
                }}
            >
                {open && (
                    <div className="flex flex-col gap-3">
                        {loadFailed ? (
                            <div
                                role="alert"
                                className="flex items-center justify-between gap-2"
                            >
                                <span>{t('tags.loadFailed')}</span>
                                <button
                                    type="button"
                                    className="btn btn-sm"
                                    onClick={() => void onRetry?.()}
                                >
                                    {t('tags.retry')}
                                </button>
                            </div>
                        ) : loading ? (
                            <p role="status">{t('tags.loading')}</p>
                        ) : (
                            <ProjectTagPicker
                                tags={tags}
                                selection={selection}
                                inputRef={input}
                                onChange={change}
                            />
                        )}
                        {error && (
                            <p role="alert" className="text-sm text-error">
                                {t('tags.saveFailed')}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
