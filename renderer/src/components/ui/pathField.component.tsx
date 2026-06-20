import clsx from 'clsx';
import { File, Folder } from 'lucide-react';
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
        <FormField
            id={id}
            label={label}
            help={help}
            error={error}
            compact={compact}
            errorIconClassName={compact ? 'right-11' : 'right-12'}
        >
            <div className="join w-full">
                <input
                    id={id}
                    type="text"
                    className={clsx(
                        'input input-bordered join-item w-full',
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
                <button
                    type="button"
                    className={clsx('btn btn-outline join-item border-neutral', {
                        'btn-sm': compact,
                    })}
                    onClick={onSelect}
                    aria-label={browseLabel}
                >
                    <BrowseIcon size={18} aria-hidden="true" />
                </button>
            </div>
        </FormField>
    );
};
