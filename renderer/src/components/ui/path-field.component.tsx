import clsx from 'clsx';
import { CircleX, File, Folder } from 'lucide-react';
import type React from 'react';
import { FormField } from './form-field.component';
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
    readOnly?: boolean;
    browseDisabled?: boolean;
    browseKind?: PathFieldBrowseKind;
    browseIcon?: React.ReactNode;
    browseTestId?: string;
    browseLabel?: string;
    browseText?: string;
};

/**
 * Renders a controlled path input joined to a separate browse button.
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
    readOnly = false,
    browseDisabled = false,
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
        <FormField id={id} label={label} labelAction={labelAction} help={help}>
            <div className="join w-full">
                <div
                    className={clsx(
                        'input input-sm join-item min-w-0 flex-1 gap-2 text-base',
                        {
                            'input-error': Boolean(error),
                        },
                    )}
                >
                    <input
                        ref={inputRef}
                        id={id}
                        data-testid={testId}
                        type="text"
                        className="min-w-0 flex-1"
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        onBlur={onBlur}
                        onKeyDown={onKeyDown}
                        placeholder={placeholder}
                        aria-label={ariaLabel}
                        aria-invalid={Boolean(error) || undefined}
                        title={title}
                        disabled={disabled}
                        readOnly={readOnly}
                    />
                    {suffix && (
                        <span
                            data-testid={suffixTestId}
                            className="max-w-40 shrink-0 whitespace-nowrap select-none"
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
                            className="shrink-0 text-error"
                            role="img"
                            ariaLabel={error}
                        >
                            <CircleX size={15} aria-hidden="true" />
                        </Tooltip>
                    )}
                </div>
                <button
                    type="button"
                    data-testid={browseTestId}
                    className="btn btn-sm join-item shrink-0 text-base"
                    onClick={onSelect}
                    disabled={disabled || browseDisabled}
                    aria-label={resolvedBrowseLabel}
                >
                    {browseIcon ?? <BrowseIcon size={18} aria-hidden="true" />}
                    {browseText && <span>{browseText}</span>}
                </button>
            </div>
        </FormField>
    );
};
