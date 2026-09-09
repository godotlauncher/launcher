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
 * Renders a compact search input with base-size text and a matching clear action.
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
                    'input input-sm w-full pr-8 text-base',
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
                    className="btn btn-sm btn-ghost btn-circle absolute right-0 top-1/2 -translate-y-1/2"
                    aria-label={clearLabel}
                >
                    <CircleX size={16} aria-hidden="true" />
                </button>
            )}
        </div>
    );
};
