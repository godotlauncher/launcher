import clsx from 'clsx';
import type React from 'react';
import { useId } from 'react';
import { FormField } from './formField.component';

export type SelectFieldProps = {
    id: string;
    label: string;
    help: string;
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    options: Array<[string, string]>;
    error?: string;
    compact?: boolean;
};

export const SelectField: React.FC<SelectFieldProps> = ({
    id,
    label,
    help,
    value,
    onChange,
    onBlur,
    options,
    error,
    compact = false,
}) => {
    const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const popoverId = `${id}-${reactId}-popover`;
    const anchorName = `--${id}-${reactId}-anchor`;
    const selectedLabel =
        options.find(([optionValue]) => optionValue === value)?.[1] ?? value;
    const triggerStyle = {
        anchorName,
    } as React.CSSProperties;
    const popoverStyle = {
        positionAnchor: anchorName,
        width: 'anchor-size(width)',
    } as React.CSSProperties;

    const closePopover = () => {
        const popover = document.getElementById(popoverId) as
            | (HTMLElement & { hidePopover?: () => void })
            | null;
        popover?.hidePopover?.();
    };

    return (
        <FormField
            id={id}
            label={label}
            help={help}
            error={error}
            compact={compact}
        >
            <button
                id={id}
                type="button"
                popoverTarget={popoverId}
                popoverTargetAction="toggle"
                onBlur={onBlur}
                aria-invalid={Boolean(error)}
                aria-haspopup="listbox"
                className={clsx(
                    'select select-bordered flex w-full items-center justify-between gap-2 text-left focus:outline-none focus-visible:outline-none focus-visible:border-primary',
                    {
                        'select-sm': compact,
                        'select-error': Boolean(error),
                    },
                )}
                style={triggerStyle}
            >
                <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
            </button>
            <div
                id={popoverId}
                popover="auto"
                role="listbox"
                aria-labelledby={id}
                className="dropdown dropdown-bottom dropdown-start max-h-64 overflow-auto rounded-box border border-base-300 bg-base-200 shadow-sm"
                style={popoverStyle}
            >
                <ul className="menu w-full p-1">
                    {options.map(([optionValue, optionLabel]) => (
                        <li key={optionValue}>
                            <button
                                type="button"
                                role="option"
                                aria-selected={optionValue === value}
                                className={clsx(
                                    'justify-start text-left',
                                    optionValue === value &&
                                        'menu-active bg-base-300',
                                )}
                                onClick={() => {
                                    onChange(optionValue);
                                    closePopover();
                                }}
                            >
                                {optionLabel}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </FormField>
    );
};
