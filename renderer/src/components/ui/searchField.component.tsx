import clsx from 'clsx';
import { CircleX } from 'lucide-react';
import type React from 'react';

type SearchFieldProps = {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    clearLabel?: string;
    className?: string;
    inputClassName?: string;
    'data-testid'?: string;
};

export const SearchField: React.FC<SearchFieldProps> = ({
    id,
    value,
    onChange,
    placeholder,
    clearLabel = 'Clear search',
    className,
    inputClassName,
    'data-testid': dataTestId,
}) => (
    <div className={clsx('relative w-full max-w-xs', className)}>
        <input
            id={id}
            type="text"
            placeholder={placeholder}
            className={clsx('input input-bordered w-full pr-8', inputClassName)}
            onChange={(event) => onChange(event.target.value)}
            value={value}
            data-testid={dataTestId}
        />
        {value.length > 0 && (
            <button
                type="button"
                tabIndex={-1}
                onClick={() => onChange('')}
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center"
                aria-label={clearLabel}
            >
                <CircleX size={18} aria-hidden="true" />
            </button>
        )}
    </div>
);
