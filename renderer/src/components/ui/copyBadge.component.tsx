import clsx from 'clsx';
import { Check, Copy } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';

export type CopyBadgeProps = {
    value: string;
    label?: string;
    copiedLabel?: string;
    onCopy?: (value: string) => void | Promise<void>;
    className?: string;
    'data-testid'?: string;
};

export const CopyBadge: React.FC<CopyBadgeProps> = ({
    value,
    label = 'Copy',
    copiedLabel = 'Copied',
    onCopy,
    className,
    'data-testid': dataTestId,
}) => {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) {
            return;
        }

        const timeoutId = window.setTimeout(() => setCopied(false), 1600);
        return () => window.clearTimeout(timeoutId);
    }, [copied]);

    const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();

        if (onCopy) {
            await onCopy(value);
        } else {
            await window.navigator.clipboard.writeText(value);
        }

        setCopied(true);
    };

    const Icon = copied ? Check : Copy;

    return (
        <button
            type="button"
            onClick={(event) => void handleCopy(event)}
            className={clsx(
                'inline-flex min-w-0 max-w-full items-center gap-1 rounded-full bg-base-100 pl-2 pr-1 py-1 text-left text-xs text-base-content/50 hover:text-base-content/80',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info',
                className,
            )}
            aria-label={copied ? copiedLabel : label}
            title={value}
            data-testid={dataTestId}
        >
            <span className="min-w-0 flex-1 truncate font-mono leading-4">
                {value}
            </span>
            <span
                className={clsx(
                    'grid h-5 w-5 shrink-0 place-items-center',
                    {
                        'text-success': copied,
                    }
                )}
                aria-hidden="true"
            >
                <Icon size={13} strokeWidth={2.2} />
            </span>
        </button>
    );
};
