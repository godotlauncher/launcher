import type React from 'react';
import { BusyOverlay } from './busy-overlay.component';

type WaitingForDialogOverlayProps = {
    message: React.ReactNode;
    className?: string;
};

export const WaitingForDialogOverlay: React.FC<
    WaitingForDialogOverlayProps
> = ({ message, className = 'z-10' }) => (
    <BusyOverlay message={message} className={className} />
);
