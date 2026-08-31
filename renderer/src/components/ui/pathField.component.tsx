import clsx from 'clsx';
import { CircleX, File, Folder } from 'lucide-react';
import type React from 'react';
import { FormField } from './formField.component';
import { Tooltip } from './tooltip.component';

export type PathFieldBrowseKind = 'file' | 'directory';

export type PathFieldProps = {
    id: string;
    label?: string;
    labelAction?: React.ReactNode;
    help?: string;
    ariaLabel?: string;
    testId?: string;
    inputRef?: React.Ref<HTMLInputElement>;
    title?: string;
    suffix?: string;
    suffixTestId?: string;
    inputAction?: React.ReactNode;
    value: string;
    onChange: (value: string) => void;
    onSelect: () => void;
    onBlur?: () => void;
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
    placeholder?: string;
    error?: string;
    disabled?: boolean;
    browseDisabled?: boolean;
    compact?: boolean;
    regularText?: boolean;
    browseKind?: PathFieldBrowseKind;
    browseIcon?: React.ReactNode;
    browseTestId?: string;
    browseLabel?: string;
    browseText?: string;
};

/**
 * Renders a controlled path input with an optional suffix and browse action.
 *
 * @param props - Path field content, state, and interaction callbacks.
 * @returns A reusable path form field.
 */
export const PathField: React.FC<PathFieldProps> = ({
    id,
    label,
    labelAction,
    help,
    ariaLabel,
    testId,
    inputRef,
    title,
    suffix,
    suffixTestId,
    inputAction,
    value,
    onChange,
    onSelect,
    onBlur,
    onKeyDown,
    placeholder,
    error,
    disabled = false,
    browseDisabled = false,
    compact = false,
    regularText = false,
    browseKind = 'file',
    browseIcon,
    browseTestId,
    browseLabel,
    browseText,
}) => {
    const BrowseIcon = browseKind === 'directory' ? Folder : File;
    const resolvedBrowseLabel =
        browseLabel ?? `${label ?? ariaLabel ?? 'Path'} browse`;

    return (
        <FormField
            id={id}
            label={label}
            labelAction={labelAction}
            help={help}
            compact={compact}
            regularText={regularText}
        >
            <div className="join w-full">
                <label
                    className={clsx(
                        'relative join-item min-w-0 flex-1 input input-bordered gap-2 outline-0 p-0',
                        {
                            'input-sm': compact,
                            'text-sm': regularText,
                            'input-error': Boolean(error),
                        },
                    )}
                >
                    <input
                        ref={inputRef}
                        id={id}
                        data-testid={testId}
                        type="text"
                        className="input min-w-0 flex-1 text-sm"
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        onBlur={onBlur}
                        onKeyDown={onKeyDown}
                        placeholder={placeholder}
                        aria-label={ariaLabel}
                        title={title}
                        disabled={disabled}
                    />
                    {suffix && (
                        <span
                            data-testid={suffixTestId}
                            className="max-w-40 shrink-0 whitespace-nowrap text-base-content/50 select-none"
                        >
                            {suffix}
                        </span>
                    )}
                    {inputAction}
                    {error && (
                        <Tooltip
                            tip={error}
                            placement="right"
                            tone="error"
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-error"
                            role="img"
                            ariaLabel={error}
                        >
                            <CircleX size={15} aria-hidden="true" />
                        </Tooltip>
                    )}
                    <button
                        type="button"
                        data-testid={browseTestId}
                        className={clsx(
                            'btn btn-ghost border-0 text-base-content shadow-none btn-primary',
                            {
                                'btn-sm h-6 px-2 m-1': compact,
                                'btn-sm m-1 ': !compact,
                                'text-sm': regularText,
                            },
                        )}
                        onClick={onSelect}
                        disabled={disabled || browseDisabled}
                        aria-label={resolvedBrowseLabel}
                    >
                        {browseIcon ?? (
                            <BrowseIcon size={18} aria-hidden="true" />
                        )}
                        {browseText && <span>{browseText}</span>}
                    </button>
                </label>
            </div>
        </FormField>
    );
};
