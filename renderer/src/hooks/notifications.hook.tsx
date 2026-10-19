import {
    createContext,
    type PropsWithChildren,
    useContext,
    useState,
    useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Notification } from '../components/notifications/notification.component';
import { createNotificationsStore } from '../components/notifications/notification.store';
import type {
    NotificationOptions,
    NotificationPosition,
} from '../components/notifications/notification.types';

type NotificationsContextValue = {
    getNotificationRevision: () => number;
    showNotificationIfUnchanged: (
        revision: number,
        options: NotificationOptions,
    ) => number | null;
    showNotification: (options: NotificationOptions) => number;
    dismissNotification: (id: number) => void;
    replaceNotification: (
        id: number,
        options: NotificationOptions,
    ) => number | null;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(
    null,
);
const placements: Record<NotificationPosition, string> = {
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
};

/** Returns the shared notification operations for any application feature. */
export function useNotifications(): NotificationsContextValue {
    const context = useContext(NotificationsContext);
    if (!context)
        throw new Error(
            'useNotifications must be used within NotificationsProvider',
        );
    return context;
}

/**
 * Hosts a single transient notification, replacing it when a new one is shown.
 * @param props - Application children and optional viewport placement.
 */
export function NotificationsProvider({
    children,
    position = 'bottom-left',
}: PropsWithChildren<{ position?: NotificationPosition }>) {
    const { t } = useTranslation('common');
    const [store] = useState(createNotificationsStore);
    const message = useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getServerSnapshot,
    );
    return (
        <NotificationsContext.Provider value={store}>
            {children}
            <section
                aria-label={t('notifications.label')}
                className={`pointer-events-none fixed z-50 w-[378px] max-w-[calc(100vw-32px)] ${placements[position]}`}
            >
                {message && (
                    <Notification
                        key={message.id}
                        {...message}
                        onDismiss={() => store.dismissNotification(message.id)}
                    />
                )}
            </section>
            <div
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="sr-only"
            >
                {message
                    ? `${message.title}${message.description ? `. ${message.description}` : ''}`
                    : ''}
            </div>
        </NotificationsContext.Provider>
    );
}
