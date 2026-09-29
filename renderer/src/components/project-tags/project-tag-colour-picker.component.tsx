import { Check } from 'lucide-react';
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
import { projectTagColourNames, projectTagColours } from './project-tag.model';

type ProjectTagColourPickerProps = {
    name: string;
    colour: number;
    disabled?: boolean;
    onOpen: () => void;
    onChange: (colour: number) => unknown;
};

/** Displays a named preset palette anchored to a tag's swatch.
 * @param props - Tag identity, draft colour and staged change callback.
 */
export function ProjectTagColourPicker({
    name,
    colour,
    disabled,
    onOpen,
    onChange,
}: ProjectTagColourPickerProps) {
    const { t } = useTranslation('projects');
    const id = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(colour);
    const [position, setPosition] = useState({ left: 0, top: 0 });
    const label = t('tags.colourFor', { name });

    /** Closes the palette and optionally restores keyboard focus.
     * @param restoreFocus - Whether to return to the swatch trigger.
     */
    const close = useCallback((restoreFocus: boolean) => {
        panel.current?.hidePopover();
        setOpen(false);
        if (restoreFocus) trigger.current?.focus({ preventScroll: true });
    }, []);
    /** Anchors the palette within the visible window. */
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
    useEffect(() => {
        if (disabled) close(false);
    }, [close, disabled]);
    useLayoutEffect(() => {
        if (!open) return;
        reposition();
        const popup = panel.current;
        const observer = new ResizeObserver(reposition);
        if (popup) observer.observe(popup);
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        popup
            ?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
            ?.focus({ preventScroll: true });
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
        };
    }, [open, reposition]);

    /** Moves focus through the palette without committing the focused colour.
     * @param event - Keyboard input within the palette.
     */
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Tab') {
            // Let the browser move focus before removing the focused option.
            window.requestAnimationFrame(() => {
                if (!panel.current?.contains(document.activeElement))
                    close(false);
            });
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close(true);
            return;
        }
        const offsets: Record<string, number> = {
            ArrowRight: 1,
            ArrowLeft: -1,
            ArrowDown: 6,
            ArrowUp: -6,
        };
        const offset = offsets[event.key];
        if (offset === undefined && event.key !== 'Home' && event.key !== 'End')
            return;
        event.preventDefault();
        event.stopPropagation();
        const next =
            event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? projectTagColours.length - 1
                  : (active + offset + projectTagColours.length) %
                    projectTagColours.length;
        setActive(next);
        panel.current
            ?.querySelector<HTMLButtonElement>(`[data-colour="${next}"]`)
            ?.focus({ preventScroll: true });
    };

    return (
        <>
            <button
                ref={trigger}
                type="button"
                disabled={disabled}
                aria-label={label}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                title={label}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-base-content/10 focus-visible:outline-2 focus-visible:outline-primary"
                onClick={() => {
                    if (open) {
                        close(false);
                        return;
                    }
                    onOpen();
                    setActive(colour);
                    panel.current?.showPopover();
                    setOpen(true);
                }}
            >
                <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: projectTagColours[colour] }}
                />
            </button>
            <div
                ref={panel}
                id={id}
                popover="auto"
                role="dialog"
                aria-label={label}
                onToggle={(event) => setOpen(event.newState === 'open')}
                onKeyDown={handleKeyDown}
                className="fixed m-0 w-60 max-w-[calc(100vw-24px)] rounded-lg border border-base-content/20 bg-base-100 p-3 text-base-content shadow-xl"
                style={position}
            >
                <p className="mb-2 truncate text-sm font-semibold" title={name}>
                    {label}
                </p>
                <div
                    role="listbox"
                    aria-label={t('tags.colour')}
                    className="grid grid-cols-6 gap-1.5"
                >
                    {projectTagColours.map((value, index) => {
                        const colourName = t(
                            `tags.colours.${projectTagColourNames[index]}`,
                        );
                        return (
                            <button
                                key={value}
                                type="button"
                                role="option"
                                data-colour={index}
                                aria-label={colourName}
                                aria-selected={index === colour}
                                tabIndex={index === active ? 0 : -1}
                                title={colourName}
                                className="flex size-7 items-center justify-center rounded-md border border-black/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-base-content"
                                style={{ backgroundColor: value }}
                                onFocus={() => setActive(index)}
                                onClick={async () => {
                                    const result = onChange(index);
                                    close(true);
                                    await result;
                                    window.requestAnimationFrame(() => {
                                        if (
                                            trigger.current?.checkVisibility() &&
                                            !trigger.current.disabled
                                        )
                                            trigger.current.focus({
                                                preventScroll: true,
                                            });
                                    });
                                }}
                            >
                                {index === colour && (
                                    <Check
                                        size={18}
                                        strokeWidth={3}
                                        aria-hidden="true"
                                        className="rounded-full bg-base-100 text-base-content"
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
                <p
                    className="mt-2 text-sm text-base-content/70"
                    aria-live="polite"
                >
                    {t(`tags.colours.${projectTagColourNames[active]}`)}
                </p>
            </div>
        </>
    );
}
