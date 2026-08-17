import clsx from 'clsx';
import type React from 'react';

type BusyOverlayProps = {
    message: React.ReactNode;
    className?: string;
};

/**
 * Blocks an active surface with an accessible loading state.
 *
 * @param props - Loading message and optional stacking classes.
 * @returns A darkened loader overlay.
 */
export const BusyOverlay: React.FC<BusyOverlayProps> = ({
    message,
    className = 'z-10',
}) => (
    <div
        className={clsx(
            'absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-4 bg-black/80 backdrop-blur-sm',
            className,
        )}
        role="status"
        aria-live="polite"
        aria-busy="true"
    >
        <span className="loading loading-circle loading-lg"></span>
        <p className="text-xl font-semibold text-white">{message}</p>
    </div>
);
