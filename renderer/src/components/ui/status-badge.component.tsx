import clsx from 'clsx';
import type { PropsWithChildren } from 'react';

const tones = {
    neutral: 'text-base-content',
    success: 'badge-success text-success-content dark:text-success',
    warning: 'badge-warning text-warning-content dark:text-warning',
    error: 'badge-error text-error-content dark:text-error',
    info: 'badge-info text-info-content dark:text-info',
};

type StatusBadgeProps = PropsWithChildren<{
    tone?: keyof typeof tones;
    className?: string;
}>;

/**
 * Renders a small soft status badge with theme-aware text colours.
 * @param props - Status tone, label and optional layout classes.
 * @returns A consistently styled status label.
 */
export function StatusBadge({
    tone = 'neutral',
    className,
    children,
}: StatusBadgeProps) {
    return (
        <span
            className={clsx(
                'badge badge-sm badge-soft shrink-0',
                tones[tone],
                className,
            )}
        >
            {children}
        </span>
    );
}
