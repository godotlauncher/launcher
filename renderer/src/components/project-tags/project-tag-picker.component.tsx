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
    inputRef?: RefObject<HTMLInputElement | null>;
    selection: ProjectTagSelection[];
    disabled?: boolean;
    changed: boolean;
    onChange: (selection: ProjectTagSelection[]) => void;
};

/** Renders a searchable multi-select whose creations remain draft until Save.
 * @param props - Catalogue, staged selection and change callback.
 */
export function ProjectTagPicker({
    tags,
    inputRef,
    selection,
    disabled = false,
    changed,
    onChange,
}: ProjectTagPickerProps) {
    const { t } = useTranslation('projects');
    const id = useId();
    const localInput = useRef<HTMLInputElement>(null);
    const input = inputRef ?? localInput;
    const optionsRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(0);
    const selected = getSelectedProjectTags(selection, tags);
    const { matches, createName } = getProjectTagOptions(tags, selected, query);
    const options: ProjectTagSelection[] = [
        ...matches.map((tag) => ({ id: tag.id })),
        ...(createName ? [{ name: createName }] : []),
    ];
    const activeIndex = Math.min(active, options.length - 1);
    useEffect(() => {
        const list = optionsRef.current;
        if (!open || !list) return;
        const option = list.querySelector<HTMLElement>(
            `[id="${CSS.escape(`${id}-option-${activeIndex}`)}"]`,
        );
        if (!option) return;
        // Scroll only the options, leaving the drawer's opening animation intact.
        const top = option.offsetTop;
        const bottom = top + option.offsetHeight;
        if (top < list.scrollTop) list.scrollTop = top;
        else if (bottom > list.scrollTop + list.clientHeight)
            list.scrollTop = bottom - list.clientHeight;
    }, [activeIndex, id, open]);

    /** Adds one option while keeping typing focus in the picker.
     * @param option - Persisted tag or proposed creation.
     */
    const select = (option: ProjectTagSelection) => {
        onChange([...selection, option]);
        setQuery('');
        setActive(0);
        setOpen(true);
        input.current?.focus();
    };
    /** Handles selection without submitting the surrounding settings form.
     * @param event - Keyboard input on the combobox.
     */
    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            setActive(
                open
                    ? (activeIndex + direction + options.length) %
                          Math.max(1, options.length)
                    : direction === 1
                      ? 0
                      : options.length - 1,
            );
            setOpen(true);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            if (open && options[activeIndex]) select(options[activeIndex]);
            else setOpen(true);
        }
    };
    return (
        <fieldset
            aria-labelledby={`${id}-label`}
            className="flex min-w-0 flex-col gap-2"
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                    setOpen(false);
            }}
        >
            <label
                id={`${id}-label`}
                htmlFor={`${id}-input`}
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
            <div className="relative">
                <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-md border border-base-content/20 bg-base-100 px-3 py-2 focus-within:border-primary">
                    {selected.map((tag, index) => (
                        <span
                            key={tag.id}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-base-content/10 py-1 pl-2 pr-1 text-sm"
                        >
                            <ProjectTagColourPicker
                                name={tag.name}
                                colour={tag.colour}
                                disabled={disabled}
                                onOpen={() => setOpen(false)}
                                onChange={(colour) =>
                                    onChange(
                                        selection.map((item, position) =>
                                            position === index
                                                ? withProjectTagColour(
                                                      item,
                                                      colour,
                                                      tags,
                                                  )
                                                : item,
                                        ),
                                    )
                                }
                            />
                            <span className="break-all">{tag.name}</span>
                            <button
                                type="button"
                                disabled={disabled}
                                aria-label={t('tags.remove', {
                                    name: tag.name,
                                })}
                                className="rounded-sm p-0.5 hover:bg-base-content/10 focus-visible:outline-2 focus-visible:outline-primary"
                                onClick={() =>
                                    onChange(
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
                    <input
                        ref={input}
                        id={`${id}-input`}
                        role="combobox"
                        aria-expanded={open && !disabled}
                        aria-controls={
                            open && !disabled ? `${id}-options` : undefined
                        }
                        aria-autocomplete="list"
                        aria-activedescendant={
                            open && !disabled && activeIndex >= 0
                                ? `${id}-option-${activeIndex}`
                                : undefined
                        }
                        autoComplete="off"
                        disabled={disabled}
                        value={query}
                        placeholder={t('tags.placeholder')}
                        className="min-w-32 flex-1 bg-transparent py-1 outline-none placeholder:text-base-content/50"
                        onFocus={() => setOpen(true)}
                        onClick={() => setOpen(true)}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setActive(0);
                            setOpen(true);
                        }}
                        onKeyDown={onKeyDown}
                    />
                </div>
                {open && !disabled && (
                    <div
                        ref={optionsRef}
                        id={`${id}-options`}
                        role="listbox"
                        aria-label={t('tags.label')}
                        className="absolute inset-x-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-base-content/15 bg-base-100 p-1 shadow-lg"
                    >
                        {options.map((option, index) => {
                            const tag = matches[index];
                            return (
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    key={'id' in option ? option.id : 'create'}
                                    id={`${id}-option-${index}`}
                                    role="option"
                                    aria-selected={index === activeIndex}
                                    className={`flex w-full text-left cursor-pointer items-center gap-2 rounded-sm px-3 py-2 ${index === activeIndex ? 'bg-primary/15' : 'hover:bg-base-content/5'}`}
                                    onMouseDown={(event) =>
                                        event.preventDefault()
                                    }
                                    onMouseMove={() => setActive(index)}
                                    onClick={() => select(option)}
                                >
                                    {'id' in option ? (
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
                                    ) : (
                                        <Plus size={16} aria-hidden="true" />
                                    )}
                                    <span className="min-w-0 flex-1 break-words">
                                        {'id' in option
                                            ? tag.name
                                            : t('tags.create', {
                                                  name: option.name,
                                              })}
                                    </span>
                                </button>
                            );
                        })}
                        {options.length === 0 && (
                            <p className="px-3 py-2 text-base-content/60">
                                {query.trim()
                                    ? t('tags.alreadySelected')
                                    : t('tags.empty')}
                            </p>
                        )}
                    </div>
                )}
            </div>
        </fieldset>
    );
}
