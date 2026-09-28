import type { ProjectTag } from '@shared/contracts';
import { ChevronDown, X } from 'lucide-react';
import {
    type KeyboardEvent,
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../ui/tooltip.component';
import { projectTagColours } from './project-tag.model';
import { ProjectTagPills } from './project-tag-pills.component';

type ProjectTagFilterProps = {
    tags: ProjectTag[];
    selected: ProjectTag[];
    disabled: boolean;
    saving: boolean;
    loadFailed: boolean;
    onRetry: () => Promise<void>;
    onChange: (ids: string[]) => Promise<boolean>;
};

/** Filters projects using existing tags while retaining input focus for selection.
 * @param props - Catalogue, saved selection and persistence operations.
 */
export function ProjectTagFilter({
    tags,
    selected,
    disabled,
    saving,
    loadFailed,
    onRetry,
    onChange,
}: ProjectTagFilterProps) {
    const { t } = useTranslation('projects');
    const id = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [position, setPosition] = useState({ left: 0, top: 0 });
    const selectedIds = selected.map((tag) => tag.id);
    const options = tags.filter(
        (tag) =>
            !selectedIds.includes(tag.id) &&
            tag.name
                .toLocaleLowerCase()
                .includes(query.trim().toLocaleLowerCase()),
    );
    const activeIndex = Math.min(active, options.length - 1);
    /** Closes the picker and optionally returns focus to its trigger.
     * @param restoreFocus - Whether keyboard focus should return to Tags.
     */
    const close = (restoreFocus: boolean) => {
        panel.current?.hidePopover();
        if (restoreFocus) trigger.current?.focus({ preventScroll: true });
    };
    /** Keeps the picker within the available window space. */
    const reposition = useCallback(() => {
        if (!trigger.current || !panel.current) return;
        const anchor = trigger.current.getBoundingClientRect();
        const popup = panel.current.getBoundingClientRect();
        setPosition({
            left: Math.max(
                12,
                Math.min(
                    anchor.right - popup.width,
                    window.innerWidth - popup.width - 12,
                ),
            ),
            top: Math.max(
                12,
                Math.min(
                    anchor.bottom + 6,
                    window.innerHeight - popup.height - 12,
                ),
            ),
        });
    }, []);
    useLayoutEffect(() => {
        if (!open) return;
        reposition();
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
    }, [open, reposition]);
    useEffect(() => {
        if (!open) return;
        const option = list.current?.querySelector<HTMLElement>(
            `[id="${CSS.escape(`${id}-option-${activeIndex}`)}"]`,
        );
        if (!option || !list.current) return;
        const top = option.offsetTop;
        const bottom = top + option.offsetHeight;
        if (top < list.current.scrollTop) list.current.scrollTop = top;
        else if (bottom > list.current.scrollTop + list.current.clientHeight)
            list.current.scrollTop = bottom - list.current.clientHeight;
    }, [activeIndex, id, open]);
    /** Adds an existing tag and prepares the next search after a successful save.
     * @param tag - The catalogue tag to include in the filter.
     */
    const select = async (tag: ProjectTag) => {
        if (saving || disabled) return;
        if (await onChange([...selectedIds, tag.id])) {
            setQuery('');
            setActive(0);
            if (panel.current?.matches(':popover-open'))
                input.current?.focus({ preventScroll: true });
        }
    };
    /** Navigates the available tags without submitting surrounding forms.
     * @param event - Input keyboard event.
     */
    const handleInputKey = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            setActive(
                (activeIndex + direction + options.length) %
                    Math.max(1, options.length),
            );
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (options[activeIndex]) void select(options[activeIndex]);
        }
    };
    return (
        <>
            <Tooltip
                tip={
                    selected.length ? (
                        <ProjectTagPills tags={selected} />
                    ) : (
                        t('tags.label')
                    )
                }
                placement="top"
                className="shrink-0"
            >
                <button
                    ref={trigger}
                    type="button"
                    data-testid="btnFilterProjectTags"
                    disabled={disabled && !loadFailed}
                    aria-label={t('tags.label')}
                    aria-expanded={open}
                    aria-controls={id}
                    aria-haspopup="dialog"
                    className="btn btn-sm btn-ghost gap-1.5 border border-base-content/20 text-base"
                    popoverTarget={id}
                >
                    {t('tags.label')}
                    {selected.slice(0, 3).map((tag) => (
                        <span
                            key={tag.id}
                            aria-hidden="true"
                            className="size-2.5 rounded-full"
                            style={{
                                backgroundColor: projectTagColours[tag.colour],
                            }}
                        />
                    ))}
                    {selected.length > 3 && (
                        <span aria-hidden="true" className="text-xs">
                            +{selected.length - 3}
                        </span>
                    )}
                    {selected.length > 0 && (
                        <span className="rounded-sm bg-base-content/10 px-1.5 text-xs">
                            {selected.length}
                        </span>
                    )}
                    <ChevronDown size={14} aria-hidden="true" />
                </button>
            </Tooltip>
            <div
                ref={panel}
                id={id}
                popover="auto"
                role="dialog"
                aria-label={t('tags.label')}
                className="fixed m-0 w-80 max-w-[calc(100vw-24px)] overflow-y-auto rounded-lg border border-base-content/20 bg-base-100 p-3 text-base text-base-content shadow-xl"
                style={{ ...position, maxHeight: 'calc(100vh - 24px)' }}
                onToggle={(event) => {
                    const next = event.newState === 'open';
                    setOpen(next);
                    if (!next) {
                        setQuery('');
                        setActive(0);
                    }
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        close(true);
                    }
                    if (event.key === 'Tab')
                        window.requestAnimationFrame(() => {
                            if (
                                !panel.current?.contains(document.activeElement)
                            )
                                close(false);
                        });
                }}
            >
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
                                onClick={() => void onRetry()}
                            >
                                {t('tags.retry')}
                            </button>
                        </div>
                    ) : (
                        <>
                            {selected.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {selected.map((tag) => (
                                        <span
                                            key={tag.id}
                                            className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md bg-base-content/10 py-1 pl-2 pr-1 text-sm"
                                        >
                                            <span
                                                aria-hidden="true"
                                                className="size-2.5 shrink-0 rounded-full"
                                                style={{
                                                    backgroundColor:
                                                        projectTagColours[
                                                            tag.colour
                                                        ],
                                                }}
                                            />
                                            <span className="min-w-0 break-words">
                                                {tag.name}
                                            </span>
                                            <button
                                                type="button"
                                                disabled={saving}
                                                aria-label={t('tags.remove', {
                                                    name: tag.name,
                                                })}
                                                className="shrink-0 rounded-sm p-0.5 hover:bg-base-content/10 focus-visible:outline-2 focus-visible:outline-primary"
                                                onClick={async () => {
                                                    if (
                                                        await onChange(
                                                            selectedIds.filter(
                                                                (id) =>
                                                                    id !==
                                                                    tag.id,
                                                            ),
                                                        )
                                                    )
                                                        input.current?.focus({
                                                            preventScroll: true,
                                                        });
                                                }}
                                            >
                                                <X
                                                    size={14}
                                                    aria-hidden="true"
                                                />
                                            </button>
                                        </span>
                                    ))}
                                    <button
                                        type="button"
                                        disabled={saving}
                                        className="btn btn-ghost btn-xs text-sm"
                                        onClick={async () => {
                                            if (await onChange([]))
                                                input.current?.focus({
                                                    preventScroll: true,
                                                });
                                        }}
                                    >
                                        {t('tags.filter.clear')}
                                    </button>
                                </div>
                            )}
                            <input
                                ref={input}
                                role="combobox"
                                aria-label={t('tags.filter.search')}
                                aria-expanded={open}
                                aria-controls={`${id}-options`}
                                aria-autocomplete="list"
                                aria-activedescendant={
                                    activeIndex >= 0
                                        ? `${id}-option-${activeIndex}`
                                        : undefined
                                }
                                placeholder={t('tags.filter.search')}
                                autoComplete="off"
                                className="input input-sm w-full text-base"
                                value={query}
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                    setActive(0);
                                }}
                                onKeyDown={handleInputKey}
                            />
                            <div
                                ref={list}
                                id={`${id}-options`}
                                role="listbox"
                                aria-label={t('tags.label')}
                                className="relative max-h-48 overflow-y-auto"
                            >
                                {options.map((tag, index) => (
                                    <button
                                        key={tag.id}
                                        id={`${id}-option-${index}`}
                                        role="option"
                                        aria-selected={index === activeIndex}
                                        type="button"
                                        disabled={saving}
                                        tabIndex={-1}
                                        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left ${index === activeIndex ? 'bg-primary/15' : 'hover:bg-base-content/5'}`}
                                        onMouseDown={(event) =>
                                            event.preventDefault()
                                        }
                                        onMouseMove={() => setActive(index)}
                                        onClick={() => void select(tag)}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="size-2.5 shrink-0 rounded-full"
                                            style={{
                                                backgroundColor:
                                                    projectTagColours[
                                                        tag.colour
                                                    ],
                                            }}
                                        />
                                        <span className="min-w-0 break-words">
                                            {tag.name}
                                        </span>
                                    </button>
                                ))}
                                {options.length === 0 && (
                                    <p className="px-2 py-2 text-base-content/60">
                                        {t('tags.filter.noMatches')}
                                    </p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
