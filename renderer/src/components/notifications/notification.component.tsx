import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import { type CSSProperties, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
    NotificationAction,
    NotificationOptions,
} from './notification.types';
import {
    getNotificationDuration,
    NotificationTimer,
} from './notification-timer.util';
import './notification.component.css';

type NotificationProps = NotificationOptions & { onDismiss: () => void };
const blockingDialogSelector =
    'dialog[open], [role="dialog"][aria-modal="true"]:not(dialog)';
const icons = {
    neutral: Info,
    success: CircleCheck,
    warning: TriangleAlert,
    error: CircleX,
};
const iconColours = {
    neutral: 'text-base-content/75',
    success: 'text-[#258155] dark:text-[#83cda6]',
    warning: 'text-[color:var(--color-warning-readable)]',
    error: 'text-error-content dark:text-error',
};

/**
 * Renders an accessible, timed notification with caller-owned actions.
 * @param props - Notification text, appearance, actions and dismissal callback.
 */
export function Notification({
    title,
    description,
    tone = 'neutral',
    durationMs,
    actions = [],
    returnFocusElement,
    onDismiss,
}: NotificationProps) {
    const { t } = useTranslation('common');
    const titleId = useId();
    const descriptionId = useId();
    const root = useRef<HTMLElement>(null);
    const originalFocus = useRef<HTMLElement | null>(null);
    const timer = useRef<NotificationTimer | null>(null);
    const dismissRef = useRef(onDismiss);
    dismissRef.current = onDismiss;
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [hidden, setHidden] = useState(
        () => typeof document !== 'undefined' && document.hidden,
    );
    const [modalOpen, setModalOpen] = useState(
        () =>
            typeof document !== 'undefined' &&
            !!document.querySelector(blockingDialogSelector),
    );
    const [pendingAction, setPendingAction] = useState<number | null>(null);
    const actionRunning = useRef(false);
    const mounted = useRef(false);
    const [actionFailed, setActionFailed] = useState(false);
    const paused =
        hovered ||
        focused ||
        hidden ||
        modalOpen ||
        pendingAction !== null ||
        actionFailed;
    const pausedRef = useRef(paused);
    pausedRef.current = paused;
    const duration = getNotificationDuration(durationMs);
    const Icon = icons[tone];

    useEffect(() => {
        mounted.current = true;
        originalFocus.current =
            returnFocusElement ??
            (document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null);
        return () => {
            mounted.current = false;
        };
    }, [returnFocusElement]);
    useEffect(() => {
        const current = new NotificationTimer(duration, () =>
            dismissRef.current(),
        );
        timer.current = current;
        if (!pausedRef.current) current.resume();
        return () => {
            current.dispose();
            timer.current = null;
        };
    }, [duration]);
    useEffect(() => {
        if (paused) timer.current?.pause();
        else timer.current?.resume();
    }, [paused]);
    useEffect(() => {
        /** Updates visibility and dialog pauses when the surrounding application changes. */
        const update = () => {
            setHidden(document.hidden);
            setModalOpen(!!document.querySelector(blockingDialogSelector));
        };
        const observer = new MutationObserver(update);
        observer.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['open', 'role', 'aria-modal'],
        });
        document.addEventListener('visibilitychange', update);
        update();
        return () => {
            observer.disconnect();
            document.removeEventListener('visibilitychange', update);
        };
    }, []);
    /** Dismisses the card and restores focus only if a focused control is removed. */
    const dismiss = () => {
        const restoreFocus = root.current?.contains(document.activeElement);
        dismissRef.current();
        if (restoreFocus)
            requestAnimationFrame(() => {
                const target = originalFocus.current;
                if (
                    document.activeElement === document.body &&
                    target?.isConnected &&
                    !target.matches(':disabled') &&
                    !target.closest('[inert]') &&
                    !document.querySelector(blockingDialogSelector)
                )
                    target.focus({ preventScroll: true });
            });
    };
    /**
     * Runs one action at a time and keeps failures visible for a safe retry.
     * @param action - Caller-provided operation and dismissal policy.
     * @param index - Action position used to show pending state.
     */
    const runAction = async (action: NotificationAction, index: number) => {
        if (actionRunning.current) return;
        actionRunning.current = true;
        setActionFailed(false);
        setPendingAction(index);
        try {
            await action.onClick();
            if (mounted.current && action.dismissOnClick !== false) dismiss();
        } catch {
            if (mounted.current) setActionFailed(true);
        } finally {
            actionRunning.current = false;
            if (mounted.current) setPendingAction(null);
        }
    };
    return (
        <article
            ref={root}
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            className="app-notification pointer-events-auto relative overflow-hidden rounded-lg border p-4"
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            onFocusCapture={() => setFocused(true)}
            onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                    setFocused(false);
            }}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    dismiss();
                }
            }}
        >
            <div className="grid grid-cols-[19px_minmax(0,1fr)_26px] items-start gap-2.5">
                <Icon
                    size={19}
                    className={`mt-0.5 ${iconColours[tone]}`}
                    aria-hidden="true"
                />
                <div className="min-w-0">
                    <h3 id={titleId} className="break-words text-sm font-bold">
                        {title}
                    </h3>
                    {description && (
                        <p
                            id={descriptionId}
                            className="app-notification-description mt-1 break-words text-[13px]"
                        >
                            {description}
                        </p>
                    )}
                    {actions.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {actions.map((action, index) => (
                                <button
                                    key={action.id ?? action.label}
                                    type="button"
                                    disabled={pendingAction !== null}
                                    className={`btn btn-sm min-h-[30px] h-auto px-2.5 py-1 text-xs font-bold ${(action.variant ?? (index === 0 ? 'primary' : 'secondary')) === 'primary' ? 'btn-primary' : 'app-notification-secondary btn-ghost'}`}
                                    onClick={() =>
                                        void runAction(action, index)
                                    }
                                >
                                    {pendingAction === index && (
                                        <span
                                            className="loading loading-spinner loading-xs"
                                            aria-hidden="true"
                                        />
                                    )}
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    )}
                    {actionFailed && (
                        <p role="alert" className="mt-2 text-sm">
                            {t('notifications.actionFailed')}
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    aria-label={t('notifications.dismiss')}
                    className="app-notification-close btn btn-ghost btn-xs btn-square -mt-1 -mr-1"
                    onClick={dismiss}
                >
                    <X size={14} aria-hidden="true" />
                </button>
            </div>
            <div
                className="app-notification-progress absolute inset-x-0 bottom-0 h-0.5"
                aria-hidden="true"
            >
                <span
                    style={
                        {
                            '--notification-duration': `${duration}ms`,
                            animationPlayState: paused ? 'paused' : 'running',
                        } as CSSProperties
                    }
                />
            </div>
        </article>
    );
}
