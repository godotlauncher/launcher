import type React from 'react';

type WaitingForDialogOverlayProps = {
    message: React.ReactNode;
    className?: string;
};

export const WaitingForDialogOverlay: React.FC<
    WaitingForDialogOverlayProps
> = ({ message, className = 'z-10' }) => (
    <div
        className={`absolute inset-0 ${className} w-full h-full bg-black/80 flex flex-col items-center justify-center gap-4`}
    >
        <p className="loading loading-infinity loading-lg"></p>
        <p className="text-white text-xl font-semibold">{message}</p>
    </div>
);
