import clsx from 'clsx';
import { CircleX } from 'lucide-react';
import type React from 'react';
import { HelpTooltip } from './helpTooltip.component';

export type FormFieldProps = {
    id: string;
    label: string;
    help?: string;
    error?: string;
    children: React.ReactNode;
    compact?: boolean;
    errorIconClassName?: string;
};

export const FormField: React.FC<FormFieldProps> = ({
    id,
    label,
    help,
    error,
    children,
    compact = false,
    errorIconClassName = 'right-2',
}) => (
    <div className={clsx('flex flex-col', compact ? 'gap-0.5' : 'gap-1')}>
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
        <div className="relative">
            {children}
            {error && (
                <span
                    className={clsx(
                        'tooltip tooltip-right tooltip-error absolute top-1/2 z-20 -translate-y-1/2 text-error hover:z-50 focus-within:z-50',
                        errorIconClassName,
                    )}
                    data-tip={error}
                    role="img"
                    aria-label={error}
                >
                    <CircleX size={15} aria-hidden="true" />
                </span>
            )}
        </div>
    </div>
);
