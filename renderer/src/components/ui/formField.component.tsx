import clsx from 'clsx';
import { CircleX } from 'lucide-react';
import type React from 'react';
import { HelpTooltip } from './helpTooltip.component';
import { Tooltip } from './tooltip.component';

export type FormFieldProps = {
    id: string;
    labelAction?: React.ReactNode;
    label: string;
    help?: string;
    error?: string;
    children: React.ReactNode;
    compact?: boolean;
    errorIconClassName?: string;
};

export const FormField: React.FC<FormFieldProps> = ({
    id,
    labelAction,
    label,
    help,
    error,
    children,
    compact = false,
    errorIconClassName = 'right-2',
}) => (
    <div className={clsx('flex flex-col', compact ? 'gap-0.5' : 'gap-1')}>
        <div className="flex items-start justify-between gap-3">
            <label
                htmlFor={id}
                className={clsx(
                    'flex items-center gap-1.5 font-semibold',
                    compact ? 'text-xs' : 'gap-2',
                )}
            >
                {label}
                {help && <HelpTooltip help={help} />}
            </label>
            {labelAction && <div className="shrink-0">{labelAction}</div>}
        </div>
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
