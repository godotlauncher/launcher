import clsx from 'clsx';
import { CircleX } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef } from 'react';

type SearchFieldProps = {
    id?: string;
    inputRef?: React.RefObject<HTMLInputElement | null>;
    shortcut?: string;
    ariaKeyShortcuts?: string;
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
    inputRef: externalInputRef,
    shortcut,
    ariaKeyShortcuts,
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
    const localInputRef = useRef<HTMLInputElement>(null);
    const inputRef = externalInputRef ?? localInputRef;

    useEffect(() => {
        if (focusOnMount) {
            inputRef.current?.focus();
        }
    }, [focusOnMount, inputRef]);

    return (
        <div
            className={clsx('group/search relative w-full max-w-xs', className)}
        >
            <input
                ref={inputRef}
                id={id}
                aria-keyshortcuts={ariaKeyShortcuts}
                type="text"
                placeholder={placeholder}
                className={clsx(
                    'input input-sm w-full pr-8 text-base',
                    shortcut && (value.length ? 'pr-28' : 'pr-20'),
                    inputClassName,
                )}
                onChange={(event) => onChange(event.target.value)}
                value={value}
                disabled={disabled}
                data-testid={dataTestId}
            />
            {shortcut && !disabled && (
                <kbd
                    className={clsx(
                        'pointer-events-none absolute top-1/2 -translate-y-1/2 rounded border border-base-content/15 px-1 text-xs text-base-content/50 group-focus-within/search:invisible',
                        value.length ? 'right-9' : 'right-2',
                    )}
                >
                    {shortcut}
                </kbd>
            )}
            {!disabled && value.length > 0 && (
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => onChange('')}
                    className="absolute right-0 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center border-0 bg-transparent p-0 text-base-content/50 shadow-none hover:border-0 hover:bg-transparent hover:text-base-content hover:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary"
                    aria-label={clearLabel}
                >
                    <CircleX size={16} aria-hidden="true" />
                </button>
            )}
        </div>
    );
};
