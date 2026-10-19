import type { DialogTone } from '../dialog.component';

export type NotificationAction = {
    id?: string;
    label: string;
    onClick: () => void | Promise<void>;
    variant?: 'primary' | 'secondary';
    /** Successful actions dismiss by default; callers can keep the card visible. */
    dismissOnClick?: boolean;
};

export type NotificationOptions = {
    title: string;
    description?: string;
    durationMs?: number;
    tone?: DialogTone;
    actions?: readonly NotificationAction[];
    returnFocusElement?: HTMLElement | null;
};

export type NotificationPosition =
    | 'bottom-left'
    | 'bottom-right'
    | 'top-left'
    | 'top-right';

export type NotificationMessage = NotificationOptions & { id: number };
