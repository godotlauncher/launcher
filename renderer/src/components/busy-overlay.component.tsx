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
 * @returns A translucent loader overlay.
 */
export const BusyOverlay: React.FC<BusyOverlayProps> = ({
    message,
    className = 'z-10',
}) => (
    <div
        className={clsx(
            'absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-3 bg-base-100/60 text-base',
            className,
        )}
        role="status"
        aria-live="polite"
        aria-busy="true"
    >
        <span
            className="loading loading-spinner loading-md"
            aria-hidden="true"
        />
        <p className="text-base-content/75">{message}</p>
    </div>
);
