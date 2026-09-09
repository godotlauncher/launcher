import clsx from 'clsx';
import { Check, Copy } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { Tooltip } from './tooltip.component';

export type CopyBadgeProps = {
    value: string;
    label?: string;
    copiedLabel?: string;
    onCopy?: (value: string) => void | Promise<void>;
    className?: string;
    'data-testid'?: string;
};

/**
 * Renders a subdued pill with non-selectable text and a separate copy button.
 * @param props - Copy value, labels, action and layout options.
 */
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
        <span
            className={clsx(
                'group/copy inline-flex h-7 min-w-0 max-w-full items-center gap-1 rounded-full bg-base-100 py-0 pl-3 pr-0 text-sm text-left font-normal transition-colors hover:bg-base-300 focus-within:bg-base-300',
                className,
            )}
        >
            <span
                className="min-w-0 flex-1 select-none truncate font-mono opacity-60 transition-opacity group-hover/copy:opacity-100 group-focus-within/copy:opacity-100"
                title={value}
            >
                {value}
            </span>
            <Tooltip
                tip={copied ? copiedLabel : label}
                placement="top"
                className="h-full shrink-0"
            >
                <button
                    type="button"
                    onClick={(event) => void handleCopy(event)}
                    className="group btn h-full min-h-0 w-10 rounded-full border-0 bg-transparent p-0 shadow-none hover:bg-transparent hover:shadow-none focus:not-focus-visible:outline-none focus-visible:bg-transparent focus-visible:outline-1 focus-visible:shadow-none"
                    aria-label={copied ? copiedLabel : label}
                    data-testid={dataTestId}
                >
                    <Icon
                        size={13}
                        className={clsx(
                            'opacity-60 transition-opacity group-hover/copy:opacity-100 group-focus-within/copy:opacity-100 group-hover:stroke-3 group-focus-visible:stroke-3',
                            { 'text-success': copied },
                        )}
                        aria-hidden="true"
                    />
                </button>
            </Tooltip>
        </span>
    );
};
