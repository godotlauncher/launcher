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
    inputAction?: React.ReactNode;
    value: string;
    onChange: (value: string) => void;
    onSelect: () => void;
    onBlur?: () => void;
    placeholder?: string;
    error?: string;
    disabled?: boolean;
    compact?: boolean;
    regularText?: boolean;
    browseKind?: PathFieldBrowseKind;
    browseIcon?: React.ReactNode;
    browseTestId?: string;
    browseLabel?: string;
    browseText?: string;
};

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
    inputAction,
    value,
    onChange,
    onSelect,
    onBlur,
    placeholder,
    error,
    disabled = false,
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
                        'relative join-item min-w-0 flex-1 input input-bordered rounded-r-none gap-2',
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
                        className="min-w-0 flex-1 outline-0"
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        onBlur={onBlur}
                        placeholder={placeholder}
                        aria-label={ariaLabel}
                        title={title}
                        disabled={disabled}
                    />
                    {suffix && (
                        <span className="max-w-40 shrink-0 whitespace-nowrap text-base-content/50 select-none">
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
                </label>
                <button
                    type="button"
                    data-testid={browseTestId}
                    className={clsx(
                        'btn join-item border-base-content/20 bg-base-100 text-base-content shadow-none hover:border-base-content/20 hover:bg-base-content/5',
                        {
                            'btn-sm': compact,
                            'text-sm': regularText,
                        },
                    )}
                    onClick={onSelect}
                    disabled={disabled}
                    aria-label={resolvedBrowseLabel}
                >
                    {browseIcon ?? <BrowseIcon size={18} aria-hidden="true" />}
                    {browseText && <span>{browseText}</span>}
                </button>
            </div>
        </FormField>
    );
};
