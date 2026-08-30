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
 * Renders a keyboard-accessible icon button with a tooltip and no hover surface.
 *
 * @param props - Accessible label, tooltip content, icon, and presentation options.
 * @returns A compact tooltip trigger for an icon.
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
            className={clsx(
                'inline-flex size-6 items-center justify-center rounded-full bg-transparent p-0 shadow-none transition-colors hover:bg-transparent hover:shadow-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
                className,
            )}
            aria-label={label}
        >
            {children}
        </button>
    </Tooltip>
);
