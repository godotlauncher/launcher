import clsx from 'clsx';
import { CircleX } from 'lucide-react';
import type React from 'react';
import { HelpTooltip } from './helpTooltip.component';
import { Tooltip } from './tooltip.component';

export type FormFieldProps = {
    id: string;
    labelAction?: React.ReactNode;
    label?: string;
    help?: string;
    error?: string;
    children: React.ReactNode;
    compact?: boolean;
    regularText?: boolean;
    errorIconClassName?: string;
};

/**
 * Renders the shared label, help, spacing, and error presentation for a field.
 *
 * @param props - Field content and presentation options.
 * @returns A consistently sized form field wrapper.
 */
export const FormField: React.FC<FormFieldProps> = ({
    id,
    labelAction,
    label,
    help,
    error,
    children,
    compact = true,
    regularText = true,
    errorIconClassName = 'right-2',
}) => (
    <div className={clsx('flex flex-col', compact ? 'gap-0.5' : 'gap-1')}>
        {(label || labelAction) && (
            <div className="flex items-start justify-between gap-3">
                {label ? (
                    <label
                        htmlFor={id}
                        className={clsx(
                            'flex items-center gap-1.5 font-semibold',
                            compact && !regularText
                                ? 'text-xs'
                                : 'gap-2 text-base',
                        )}
                    >
                        {label}
                        {help && <HelpTooltip help={help} />}
                    </label>
                ) : (
                    <span />
                )}
                {labelAction && <div className="shrink-0">{labelAction}</div>}
            </div>
        )}
        <div className="relative">
            {children}
            {error && (
                <Tooltip
                    tip={error}
                    placement="right"
                    tone="error"
                    className={clsx(
                        'absolute top-1/2 -translate-y-1/2 text-error',
                        errorIconClassName,
                    )}
                    role="img"
                    ariaLabel={error}
                >
                    <CircleX size={15} aria-hidden="true" />
                </Tooltip>
            )}
        </div>
    </div>
);
