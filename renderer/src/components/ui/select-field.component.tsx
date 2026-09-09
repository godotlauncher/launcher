import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { FormField } from './form-field.component';

export type SelectFieldOption = {
    value: string;
    label: string;
    selectedLabel?: string;
    disabled?: boolean;
    separatorBefore?: boolean;
};

export type SelectFieldProps = {
    id: string;
    label?: string;
    help?: string;
    ariaLabel?: string;
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    options: SelectFieldOption[];
    error?: string;
    disabled?: boolean;
    testId?: string;
    showSelectedCheck?: boolean;
    fitOptionContent?: boolean;
    width?: 'full' | 'auto';
    size?: 'sm' | 'md';
    /** Minimum closed-control width; numeric values are pixels. */
    minWidth?: React.CSSProperties['minWidth'];
    appearance?: 'field' | 'chip' | 'ghost';
    startIcon?: React.ReactNode;
};

export function getEnabledOptionIndex(
    options: SelectFieldOption[],
    currentIndex: number,
    direction: 1 | -1,
): number {
    const enabledIndices = options.flatMap((option, index) =>
        option.disabled ? [] : [index],
    );

    if (enabledIndices.length === 0) {
        return -1;
    }

    const enabledPosition = enabledIndices.indexOf(currentIndex);
    if (enabledPosition === -1) {
        return direction === 1
            ? enabledIndices[0]
            : enabledIndices[enabledIndices.length - 1];
    }

    const nextPosition =
        (enabledPosition + direction + enabledIndices.length) %
        enabledIndices.length;
    return enabledIndices[nextPosition];
}

export function getEnabledOptionEdgeIndex(
    options: SelectFieldOption[],
    edge: 'first' | 'last',
): number {
    if (edge === 'first') {
        return options.findIndex((option) => !option.disabled);
    }

    for (let index = options.length - 1; index >= 0; index -= 1) {
        if (!options[index].disabled) {
            return index;
        }
    }

    return -1;
}

/**
 * Renders a controlled select trigger with an anchored keyboard-accessible list.
 *
 * @param props - Selection state, options, callbacks, and field presentation.
 * @returns A reusable select form field.
 */
export const SelectField: React.FC<SelectFieldProps> = ({
    id,
    label,
    help,
    ariaLabel,
    value,
    onChange,
    onBlur,
    options,
    error,
    disabled = false,
    testId,
    showSelectedCheck = false,
    fitOptionContent = true,
    width = 'full',
    size = 'md',
    minWidth,
    appearance = 'field',
    startIcon,
}) => {
    const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const popoverId = `${id}-${reactId}-popover`;
    const anchorName = `--${id}-${reactId}-anchor`;
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const selectedIndex = options.findIndex(
        (option) => option.value === value && !option.disabled,
    );
    const firstEnabledIndex = getEnabledOptionEdgeIndex(options, 'first');
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(
        selectedIndex >= 0 ? selectedIndex : firstEnabledIndex,
    );
    const selectedOption = options.find((option) => option.value === value);
    const selectedLabel =
        selectedOption?.selectedLabel ?? selectedOption?.label ?? value;
    const selectedAccessibleLabel = selectedOption?.label ?? value;
    const accessibleLabel = ariaLabel ?? label;
    const triggerAriaLabel = accessibleLabel
        ? `${accessibleLabel}: ${selectedAccessibleLabel}`
        : undefined;
    const triggerStyle = {
        anchorName,
        minWidth,
    } as React.CSSProperties;
    const popoverStyle = {
        positionAnchor: anchorName,
        width: fitOptionContent ? 'max-content' : 'anchor-size(width)',
        maxWidth: 'calc(100vw - 1rem)',
    } as React.CSSProperties;

    const focusOption = useCallback((index: number) => {
        if (index < 0) {
            return;
        }

        setActiveIndex(index);
        optionRefs.current[index]?.focus();
    }, []);

    const closePopover = useCallback((restoreFocus = true) => {
        popoverRef.current?.hidePopover?.();
        setIsOpen(false);

        if (restoreFocus) {
            triggerRef.current?.focus();
        }
    }, []);

    const openPopover = useCallback(
        (preferredIndex: number) => {
            const nextIndex =
                preferredIndex >= 0 ? preferredIndex : firstEnabledIndex;
            popoverRef.current?.showPopover?.();
            setIsOpen(true);
            focusOption(nextIndex);
        },
        [firstEnabledIndex, focusOption],
    );

    useEffect(() => {
        if (!isOpen) {
            setActiveIndex(
                selectedIndex >= 0 ? selectedIndex : firstEnabledIndex,
            );
        }
    }, [firstEnabledIndex, isOpen, selectedIndex]);

    useEffect(() => {
        const popover = popoverRef.current;
        if (!popover) {
            return;
        }

        const handleToggle = (event: Event) => {
            const nextState = (
                event as Event & { newState?: 'open' | 'closed' }
            ).newState;
            setIsOpen(
                nextState
                    ? nextState === 'open'
                    : popover.matches(':popover-open'),
            );
        };

        popover.addEventListener('toggle', handleToggle);
        return () => popover.removeEventListener('toggle', handleToggle);
    }, []);

    const handleTriggerKeyDown = (
        event: React.KeyboardEvent<HTMLButtonElement>,
    ) => {
        if (disabled) {
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPopover(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex);
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            openPopover(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex);
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            openPopover(getEnabledOptionEdgeIndex(options, 'last'));
            return;
        }

        if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            openPopover(
                getEnabledOptionEdgeIndex(
                    options,
                    event.key === 'Home' ? 'first' : 'last',
                ),
            );
        }
    };

    const selectOption = (index: number) => {
        const option = options[index];
        if (!option || option.disabled) {
            return;
        }

        onChange(option.value);
        closePopover();
    };

    const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closePopover();
            return;
        }

        if (event.key === 'Tab') {
            closePopover(false);
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            focusOption(
                getEnabledOptionIndex(
                    options,
                    activeIndex,
                    event.key === 'ArrowDown' ? 1 : -1,
                ),
            );
            return;
        }

        if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            focusOption(
                getEnabledOptionEdgeIndex(
                    options,
                    event.key === 'Home' ? 'first' : 'last',
                ),
            );
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            selectOption(activeIndex);
        }
    };

    const control = (
        <>
            <button
                ref={triggerRef}
                id={id}
                type="button"
                data-testid={testId}
                onClick={() => {
                    if (isOpen) {
                        closePopover();
                    } else {
                        openPopover(
                            selectedIndex >= 0
                                ? selectedIndex
                                : firstEnabledIndex,
                        );
                    }
                }}
                onKeyDown={handleTriggerKeyDown}
                onBlur={onBlur}
                disabled={disabled}
                aria-label={triggerAriaLabel}
                aria-invalid={Boolean(error)}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-controls={popoverId}
                className={clsx(
                    appearance === 'ghost'
                        ? 'btn btn-ghost text-base'
                        : appearance === 'chip'
                          ? 'btn btn-ghost w-auto gap-2 text-left text-base'
                          : 'select text-base flex items-center justify-between gap-2 pe-10 text-left',
                    {
                        'w-full': appearance === 'field' && width === 'full',
                        'select-sm text-base':
                            appearance === 'field' && size === 'sm',
                        'w-auto': appearance === 'field' && width === 'auto',
                        'select-error':
                            Boolean(error) && appearance === 'field',
                        'btn-error': Boolean(error) && appearance === 'chip',
                    },
                )}
                style={triggerStyle}
            >
                {startIcon}
                <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
                {appearance !== 'field' && (
                    <ChevronDown size={14} aria-hidden="true" />
                )}
            </button>
            <div
                ref={popoverRef}
                id={popoverId}
                popover="auto"
                role="listbox"
                aria-labelledby={id}
                onKeyDown={handleListKeyDown}
                className="dropdown dropdown-bottom dropdown-start max-h-64 overflow-auto rounded-md bg-base-100 shadow-md"
                style={popoverStyle}
            >
                <ul className="menu w-full p-1 text-base">
                    {options.map((option, index) => (
                        <li
                            key={option.value}
                            className={clsx(
                                option.separatorBefore && 'mt-1 pt-1',
                            )}
                        >
                            <button
                                ref={(element) => {
                                    optionRefs.current[index] = element;
                                }}
                                id={`${popoverId}-option-${index}`}
                                type="button"
                                role="option"
                                disabled={option.disabled}
                                aria-selected={option.value === value}
                                tabIndex={activeIndex === index ? 0 : -1}
                                className={clsx(
                                    'justify-start gap-2 text-left',
                                    option.value === value && 'menu-active',
                                )}
                                onFocus={() => setActiveIndex(index)}
                                onClick={() => selectOption(index)}
                            >
                                {showSelectedCheck && (
                                    <span
                                        className="flex size-4 shrink-0 items-center justify-center"
                                        aria-hidden="true"
                                    >
                                        {option.value === value && (
                                            <Check size={14} />
                                        )}
                                    </span>
                                )}
                                <span
                                    className={clsx(
                                        'min-w-0 flex-1',
                                        fitOptionContent && 'whitespace-nowrap',
                                    )}
                                >
                                    {option.label}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </>
    );

    if (!label) {
        return (
            <div
                className={clsx(
                    'relative max-w-full',
                    width === 'auto' && 'w-fit',
                )}
            >
                {control}
            </div>
        );
    }

    const field = (
        <FormField id={id} label={label} help={help} error={error}>
            {control}
        </FormField>
    );
    return width === 'auto' ? (
        <div className="w-fit max-w-full">{field}</div>
    ) : (
        field
    );
};
