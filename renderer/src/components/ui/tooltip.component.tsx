import clsx from 'clsx';
import type React from 'react';

export type TooltipPlacement = 'top' | 'right' | 'bottom' | 'left';
export type TooltipTone =
    | 'default'
    | 'primary'
    | 'secondary'
    | 'error'
    | 'warning'
    | 'info';

type TooltipProps = {
    tip: string;
    children: React.ReactNode;
    placement?: TooltipPlacement;
    tone?: TooltipTone;
    className?: string;
    ariaLabel?: string;
    role?: React.AriaRole;
};

const tooltipToneClassNames: Record<TooltipTone, string | undefined> = {
    default: undefined,
    primary: 'tooltip-primary',
    secondary: 'tooltip-secondary',
    error: 'tooltip-error',
    warning: 'tooltip-warning',
    info: 'tooltip-info',
};

export const Tooltip: React.FC<TooltipProps> = ({
    tip,
    children,
    placement = 'right',
    tone = 'default',
    className,
    ariaLabel,
    role,
}) => {
    const accessibilityProps =
        role && ariaLabel ? { role, 'aria-label': ariaLabel } : { role };

    return (
        <span
            className={clsx(
                'tooltip relative',
                `tooltip-${placement}`,
                tooltipToneClassNames[tone],
                className,
            )}
            data-tip={tip}
            {...accessibilityProps}
        >
            {children}
        </span>
    );
};
