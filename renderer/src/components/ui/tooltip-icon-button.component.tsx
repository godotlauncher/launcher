import clsx from 'clsx';
import type React from 'react';
import {
    Tooltip,
    type TooltipPlacement,
    type TooltipTone,
} from './tooltip.component';

export type TooltipIconButtonProps = {
    label: string;
    tip: React.ReactNode;
    children: React.ReactNode;
    placement?: TooltipPlacement;
    tone?: TooltipTone;
    delay?: number;
    className?: string;
};

/**
 * Renders a keyboard-accessible ghost icon button with a tooltip.
 *
 * @param props - Accessible label, tooltip content, icon, and presentation options.
 * @returns A tooltip trigger for an icon.
 */
export const TooltipIconButton: React.FC<TooltipIconButtonProps> = ({
    label,
    tip,
    children,
    placement = 'right',
    tone,
    delay,
    className,
}) => (
    <Tooltip tip={tip} placement={placement} tone={tone} delay={delay}>
        <button
            type="button"
            className={clsx('btn btn-circle btn-ghost ', className)}
            aria-label={label}
        >
            {children}
        </button>
    </Tooltip>
);
