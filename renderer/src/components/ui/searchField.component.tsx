import clsx from 'clsx';
import { CircleX } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';

type SearchFieldProps = {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    clearLabel?: string;
    className?: string;
    inputClassName?: string;
    focusOnMount?: boolean;
    disabled?: boolean;
    'data-testid'?: string;
};

/**
 * Renders a search input with a clear action.
 *
 * @param props - The search value, labels, and change action.
 * @returns The search field.
 */
export const SearchField: React.FC<SearchFieldProps> = ({
    id,
    value,
    onChange,
    placeholder,
    clearLabel = 'Clear search',
    className,
    inputClassName,
    focusOnMount = false,
    disabled = false,
    'data-testid': dataTestId,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (focusOnMount) {
            inputRef.current?.focus();
        }
    }, [focusOnMount]);

    return (
        <div className={clsx('relative w-full max-w-xs', className)}>
            <input
                ref={inputRef}
                id={id}
                type="text"
                placeholder={placeholder}
                className={clsx(
                    'input input-bordered w-full pr-8',
                    inputClassName,
                )}
                onChange={(event) => onChange(event.target.value)}
                value={value}
                disabled={disabled}
                data-testid={dataTestId}
            />
            {!disabled && value.length > 0 && (
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
};
