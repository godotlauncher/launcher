import clsx from 'clsx';
import { CircleX, File, Folder } from 'lucide-react';
import type React from 'react';
import { FormField } from './formField.component';
import { Tooltip } from './tooltip.component';

export type PathFieldBrowseKind = 'file' | 'directory';

export type PathFieldProps = {
    id: string;
    label: string;
    labelAction?: React.ReactNode;
    help: string;
    value: string;
    onChange: (value: string) => void;
    onSelect: () => void;
    onBlur?: () => void;
    placeholder?: string;
    error?: string;
    disabled?: boolean;
    compact?: boolean;
    browseKind?: PathFieldBrowseKind;
    browseLabel?: string;
    browseText?: string;
};

export const PathField: React.FC<PathFieldProps> = ({
    id,
    label,
    labelAction,
    help,
    value,
    onChange,
    onSelect,
    onBlur,
    placeholder,
    error,
    disabled = false,
    compact = false,
    browseKind = 'file',
    browseLabel = `${label} browse`,
    browseText,
}) => {
    const BrowseIcon = browseKind === 'directory' ? Folder : File;

    return (
        <FormField
            id={id}
            label={label}
            labelAction={labelAction}
            help={help}
            compact={compact}
        >
            <div className="join w-full">
                <div className="relative join-item min-w-0 flex-1">
                    <input
                        id={id}
                        type="text"
                        className={clsx(
                            'input input-bordered rounded-r-none w-full',
                            error ? 'pr-8' : '',
                            {
                                'input-sm': compact,
                                'input-error': Boolean(error),
                            },
                        )}
                        value={value}
                        onChange={(event) => onChange(event.target.value)}
                        onBlur={onBlur}
                        placeholder={placeholder}
                        disabled={disabled}
                    />
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
                </div>
                <button
                    type="button"
                    className={clsx(
                        'btn btn-outline join-item border-neutral',
                        {
                            'btn-sm': compact,
                        },
                    )}
                    onClick={onSelect}
                    disabled={disabled}
                    aria-label={browseLabel}
                >
                    <BrowseIcon size={18} aria-hidden="true" />
                    {browseText && <span>{browseText}</span>}
                </button>
            </div>
        </FormField>
    );
};
