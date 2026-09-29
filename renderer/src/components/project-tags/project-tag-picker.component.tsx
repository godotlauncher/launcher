import type { ProjectTag, ProjectTagSelection } from '@shared/contracts';
import { Plus, X } from 'lucide-react';
import {
    type KeyboardEvent,
    type RefObject,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
    getProjectTagOptions,
    getSelectedProjectTags,
    projectTagColours,
    withProjectTagColour,
} from './project-tag.model';
import { ProjectTagColourPicker } from './project-tag-colour-picker.component';

type ProjectTagPickerProps = {
    tags: ProjectTag[];
    inputRef: RefObject<HTMLInputElement | null>;
    selection: ProjectTagSelection[];
    onChange: (selection: ProjectTagSelection[]) => Promise<boolean>;
};

/** Edits tag membership and colours inside the shared popover.
 * @param props - Catalogue, current selection and save or staging callback.
 */
export function ProjectTagPicker({
    tags,
    inputRef: input,
    selection,
    onChange,
}: ProjectTagPickerProps) {
    const { t } = useTranslation('projects');
    const id = useId();
    const list = useRef<HTMLDivElement>(null);
    const busy = useRef(false);
    const [saving, setSaving] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const selected = getSelectedProjectTags(selection, tags);
    const { matches, createName } = getProjectTagOptions(tags, selected, query);
    const options: ProjectTagSelection[] = [
        ...matches.map((tag) => ({ id: tag.id })),
        ...(createName ? [{ name: createName }] : []),
    ];
    const activeIndex = Math.min(active, options.length - 1);
    useEffect(() => {
        const option = list.current?.querySelector<HTMLElement>(
            `[id="${CSS.escape(`${id}-option-${activeIndex}`)}"]`,
        );
        if (!option || !list.current) return;
        const top = option.offsetTop;
        const bottom = top + option.offsetHeight;
        if (top < list.current.scrollTop) list.current.scrollTop = top;
        else if (bottom > list.current.scrollTop + list.current.clientHeight)
            list.current.scrollTop = bottom - list.current.clientHeight;
    }, [activeIndex, id]);
    /** Serialises edits so a slow save cannot overwrite a later selection.
     * @param next - Proposed membership and colour overrides.
     * @param clearQuery - Whether a successful addition should reset search.
     * @param returnToInput - Whether to restore input focus after this edit.
     */
    const change = async (
        next: ProjectTagSelection[],
        clearQuery = false,
        returnToInput = true,
    ) => {
        if (busy.current) return;
        busy.current = true;
        setSaving(true);
        try {
            if (await onChange(next)) {
                if (clearQuery) {
                    setQuery('');
                    setActive(0);
                }
            }
        } finally {
            busy.current = false;
            setSaving(false);
            window.requestAnimationFrame(() => {
                if (returnToInput && input.current?.closest(':popover-open'))
                    input.current.focus({ preventScroll: true });
            });
        }
    };
    /** Selects the active option without submitting the settings form.
     * @param event - Keyboard input on the tag search.
     */
    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.nativeEvent.isComposing) return;
        if (busy.current) {
            if (event.key === 'Enter') event.preventDefault();
            return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            setActive(
                (activeIndex + direction + options.length) %
                    Math.max(1, options.length),
            );
        } else if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            if (options[activeIndex])
                void change([...selection, options[activeIndex]], true);
        }
    };
    return (
        <div className="flex min-w-0 flex-col gap-3" aria-busy={saving}>
            {selected.length > 0 && (
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                    {selected.map((tag, index) => (
                        <span
                            key={tag.id}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-base-content/10 py-1 pl-2 pr-1 text-sm"
                        >
                            <ProjectTagColourPicker
                                name={tag.name}
                                colour={tag.colour}
                                disabled={saving}
                                onOpen={() => {}}
                                onChange={(colour) =>
                                    change(
                                        selection.map((item, position) =>
                                            position === index
                                                ? withProjectTagColour(
                                                      item,
                                                      colour,
                                                      tags,
                                                  )
                                                : item,
                                        ),
                                        false,
                                        false,
                                    )
                                }
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
                                onClick={() =>
                                    void change(
                                        selection.filter(
                                            (_, position) => position !== index,
                                        ),
                                    )
                                }
                            >
                                <X size={14} aria-hidden="true" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <input
                ref={input}
                id={`${id}-input`}
                role="combobox"
                aria-label={t('tags.label')}
                aria-expanded="true"
                aria-controls={`${id}-options`}
                aria-autocomplete="list"
                aria-activedescendant={
                    activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined
                }
                autoComplete="off"
                readOnly={saving}
                value={query}
                placeholder={t('tags.placeholder')}
                className="input input-sm w-full text-base"
                onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                }}
                onKeyDown={handleKeyDown}
            />
            <div
                ref={list}
                id={`${id}-options`}
                role="listbox"
                aria-label={t('tags.label')}
                className="relative max-h-48 overflow-y-auto"
            >
                {options.map((option, index) => (
                    <button
                        type="button"
                        disabled={saving}
                        tabIndex={-1}
                        key={'id' in option ? option.id : 'create'}
                        id={`${id}-option-${index}`}
                        role="option"
                        aria-selected={index === activeIndex}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left ${index === activeIndex ? 'bg-primary/15' : 'hover:bg-base-content/5'}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseMove={() => setActive(index)}
                        onClick={() =>
                            void change([...selection, option], true)
                        }
                    >
                        {'id' in option ? (
                            <span
                                aria-hidden="true"
                                className="size-2.5 shrink-0 rounded-full"
                                style={{
                                    backgroundColor:
                                        projectTagColours[
                                            matches[index].colour
                                        ],
                                }}
                            />
                        ) : (
                            <Plus size={16} aria-hidden="true" />
                        )}
                        <span className="min-w-0 break-words">
                            {'id' in option
                                ? matches[index].name
                                : t('tags.create', { name: option.name })}
                        </span>
                    </button>
                ))}
                {options.length === 0 && (
                    <p className="px-2 py-2 text-base-content/60">
                        {query.trim()
                            ? t('tags.alreadySelected')
                            : t('tags.empty')}
                    </p>
                )}
            </div>
        </div>
    );
}
