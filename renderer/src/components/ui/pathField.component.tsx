import clsx from 'clsx';
import { CircleX, File, Folder } from 'lucide-react';
import type React from 'react';
import { FormField } from './formField.component';

export type PathFieldBrowseKind = 'file' | 'directory';

export type PathFieldProps = {
    id: string;
    label: string;
    help: string;
    value: string;
    onChange: (value: string) => void;
    onSelect: () => void;
    onBlur?: () => void;
    placeholder?: string;
    error?: string;
    compact?: boolean;
    browseKind?: PathFieldBrowseKind;
    browseLabel?: string;
};

export const PathField: React.FC<PathFieldProps> = ({
    id,
    label,
    help,
    value,
    onChange,
    onSelect,
    onBlur,
    placeholder,
    error,
    compact = false,
    browseKind = 'file',
    browseLabel = `${label} browse`,
}) => {
    const BrowseIcon = browseKind === 'directory' ? Folder : File;

    return (
        <FormField id={id} label={label} help={help} compact={compact}>
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
                    />
                    {error && (
                        <span
                            className="tooltip tooltip-right tooltip-error absolute right-2 top-1/2 z-20 -translate-y-1/2 text-error hover:z-50 focus-within:z-50"
                            data-tip={error}
                            role="img"
                            aria-label={error}
                        >
                            <CircleX size={15} aria-hidden="true" />
                        </span>
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
                    aria-label={browseLabel}
                >
                    <BrowseIcon size={18} aria-hidden="true" />
                </button>
            </div>
        </FormField>
    );
};
