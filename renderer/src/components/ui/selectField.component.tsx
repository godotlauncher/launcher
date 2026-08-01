import clsx from 'clsx';
import { Check } from 'lucide-react';
import type React from 'react';
import { useId } from 'react';
import { FormField } from './formField.component';

export type SelectFieldOption = {
    value: string;
    label: string;
    disabled?: boolean;
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
    compact?: boolean;
    disabled?: boolean;
    testId?: string;
    showSelectedCheck?: boolean;
};

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
    compact = false,
    disabled = false,
    testId,
    showSelectedCheck = false,
}) => {
    const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const popoverId = `${id}-${reactId}-popover`;
    const anchorName = `--${id}-${reactId}-anchor`;
    const selectedLabel =
        options.find((option) => option.value === value)?.label ?? value;
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

    const control = (
        <>
            <button
                id={id}
                type="button"
                data-testid={testId}
                popoverTarget={popoverId}
                popoverTargetAction="toggle"
                onBlur={onBlur}
                disabled={disabled}
                aria-label={ariaLabel}
                aria-invalid={Boolean(error)}
                aria-haspopup="listbox"
                className={clsx(
                    'select select-bordered flex w-full items-center justify-between gap-2 bg-base-300 text-left focus:outline-none focus-visible:border-primary focus-visible:outline-none',
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
                className="dropdown dropdown-bottom dropdown-start max-h-64 overflow-auto rounded-box border border-base-300 bg-base-300 shadow-sm"
                style={popoverStyle}
            >
                <ul className="menu w-full p-1">
                    {options.map((option) => (
                        <li key={option.value}>
                            <button
                                type="button"
                                role="option"
                                disabled={option.disabled}
                                aria-selected={option.value === value}
                                className={clsx(
                                    'justify-start gap-2 text-left',
                                    option.value === value &&
                                        'menu-active bg-base-200',
                                )}
                                onClick={() => {
                                    onChange(option.value);
                                    closePopover();
                                }}
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
                                <span className="min-w-0 flex-1">
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
        return <div className="relative">{control}</div>;
    }

    return (
        <FormField
            id={id}
            label={label}
            help={help}
            error={error}
            compact={compact}
        >
            {control}
        </FormField>
    );
};
