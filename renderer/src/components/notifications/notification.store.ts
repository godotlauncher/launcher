import type {
    NotificationMessage,
    NotificationOptions,
} from './notification.types';

/** Creates isolated notification state for one application viewport. */
export function createNotificationsStore() {
    let current: NotificationMessage | null = null;
    let sequence = 0;
    const listeners = new Set<() => void>();
    /** Publishes a changed snapshot to the mounted viewport. */
    const emit = () => {
        for (const listener of listeners) listener();
    };
    /**
     * Replaces the visible message with a new notification.
     * @param options - Caller-owned text, timing and actions.
     */
    const showNotification = (options: NotificationOptions): number => {
        const id = ++sequence;
        current = { ...options, id };
        emit();
        return id;
    };
    /**
     * Dismisses only the notification owned by the caller.
     * @param id - Identity returned when the notification was shown.
     */
    const dismissNotification = (id: number): void => {
        if (current?.id !== id) return;
        current = null;
        emit();
    };
    /**
     * Updates an action result only while its original notification is current.
     * @param id - Notification that owns the completing action.
     * @param options - Replacement text and actions after success.
     */
    const replaceNotification = (
        id: number,
        options: NotificationOptions,
    ): number | null => (current?.id === id ? showNotification(options) : null);
    /**
     * Subscribes a viewport to changes.
     * @param listener - Callback to read the latest snapshot after a change.
     */
    const subscribe = (listener: () => void) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    };
    /** Returns the current immutable message snapshot. */
    const getSnapshot = () => current;
    /** Returns an empty viewport during server rendering. */
    const getServerSnapshot = () => null;
    return {
        showNotification,
        dismissNotification,
        replaceNotification,
        subscribe,
        getSnapshot,
        getServerSnapshot,
    };
}
