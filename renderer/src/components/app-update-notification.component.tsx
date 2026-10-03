import type { AppUpdateMessage } from '@shared/contracts';
import {
    ArrowDownToLine,
    Check,
    ChevronRight,
    RefreshCw,
    TriangleAlert,
    X,
} from 'lucide-react';
import {
    type KeyboardEvent,
    type ToggleEvent,
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { AppUpdateContent } from './app-update-content.component';

type AppUpdateNotificationProps = {
    updateAvailable: AppUpdateMessage | undefined;
    pathname: string;
    installAndRelaunch: () => Promise<void>;
    downloadAppUpdate: () => Promise<void>;
    retryAppUpdate: () => Promise<void>;
    skipAppUpdate: (version: string) => Promise<void>;
    openUpdateUrl: (url: string) => Promise<void>;
};

/**
 * Shows a compact status trigger and a dismissible, non-modal update panel.
 *
 * @param props - Shared update state, existing actions and current route.
 */
export function AppUpdateNotification({
    updateAvailable,
    pathname,
    ...actions
}: AppUpdateNotificationProps) {
    const { t } = useTranslation('common');
    const id = useId();
    const titleId = `${id}-title`;
    const trigger = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    const restoreFocus = useRef(true);
    const previousPathname = useRef(pathname);
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ left: 0, top: 0 });
    const visible =
        updateAvailable &&
        updateAvailable.type !== 'none' &&
        updateAvailable.type !== 'checking';

    /** Keeps the panel beside its trigger and inside the current window. */
    const reposition = useCallback(() => {
        if (!trigger.current || !panel.current) return;
        const anchor = trigger.current.getBoundingClientRect();
        const popup = panel.current.getBoundingClientRect();
        setPosition({
            left: Math.max(
                12,
                Math.min(
                    anchor.right + 12,
                    window.innerWidth - popup.width - 12,
                ),
            ),
            top: Math.max(
                12,
                Math.min(
                    anchor.bottom - popup.height,
                    window.innerHeight - popup.height - 12,
                ),
            ),
        });
    }, []);

    /**
     * Dismisses presentation without changing update state or cancelling work.
     *
     * @param returnFocus - Whether dismissal should return focus to the trigger.
     */
    const dismiss = useCallback((returnFocus = true) => {
        restoreFocus.current = returnFocus;
        panel.current?.hidePopover();
        setOpen(false);
        if (returnFocus) trigger.current?.focus({ preventScroll: true });
    }, []);

    useEffect(() => {
        if (previousPathname.current !== pathname) {
            previousPathname.current = pathname;
            dismiss(false);
        }
    }, [pathname, dismiss]);
    useEffect(() => {
        if (!visible) dismiss(false);
    }, [visible, dismiss]);
    useLayoutEffect(() => {
        if (!open) return;
        reposition();
        closeButton.current?.focus({ preventScroll: true });
        const observer = new ResizeObserver(reposition);
        if (panel.current) observer.observe(panel.current);
        if (trigger.current) observer.observe(trigger.current);
        window.addEventListener('resize', reposition);
        window.addEventListener('scroll', reposition, true);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
        };
    }, [open, reposition]);

    /**
     * Synchronises native light dismissal with the trigger's accessible state.
     *
     * @param event - Native popover state transition.
     */
    const handleToggle = (event: ToggleEvent<HTMLDivElement>) => {
        const nextOpen = event.newState === 'open';
        setOpen(nextOpen);
        if (nextOpen) restoreFocus.current = true;
        else if (restoreFocus.current) {
            const focused = document.activeElement;
            if (
                focused === document.body ||
                focused === trigger.current ||
                (focused && panel.current?.contains(focused))
            )
                trigger.current?.focus({ preventScroll: true });
        }
    };

    /**
     * Handles Escape and lets Tab leave the non-modal panel normally.
     *
     * @param event - Key pressed in the update panel.
     */
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            dismiss();
        } else if (event.key === 'Tab') {
            window.requestAnimationFrame(() => {
                if (!panel.current?.contains(document.activeElement))
                    dismiss(false);
            });
        }
    };

    if (!visible || !updateAvailable) return null;
    const status =
        updateAvailable.type === 'manual' ? 'available' : updateAvailable.type;
    const percent = Number.isFinite(updateAvailable.progressPercent)
        ? Math.round(
              Math.min(100, Math.max(0, updateAvailable.progressPercent ?? 0)),
          )
        : undefined;
    const label =
        status === 'downloading'
            ? percent === undefined
                ? t('app.update.notification.downloading')
                : t('app.update.notification.downloadingProgress', { percent })
            : t('app.update.notification.update');
    const Icon =
        status === 'error'
            ? TriangleAlert
            : status === 'ready'
              ? Check
              : status === 'downloading'
                ? ArrowDownToLine
                : RefreshCw;

    return (
        <>
            <ul className="menu w-full gap-1 text-base">
                <li>
                    <button
                        ref={trigger}
                        type="button"
                        data-testid="btnAppUpdateNotification"
                        popoverTarget={id}
                        aria-haspopup="dialog"
                        aria-label={
                            status === 'downloading'
                                ? label
                                : t(`app.update.notification.${status}`)
                        }
                        aria-expanded={open}
                        aria-controls={id}
                        className={`gap-2 border border-primary/25 text-primary ${open ? 'bg-primary/10' : ''}`}
                    >
                        <Icon className="size-5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1 whitespace-nowrap text-sm">
                            {label}
                        </span>
                        <ChevronRight
                            className="size-4 shrink-0"
                            aria-hidden="true"
                        />
                    </button>
                </li>
            </ul>
            <div
                ref={panel}
                id={id}
                data-testid="appUpdatePopover"
                popover="auto"
                role="dialog"
                aria-labelledby={titleId}
                className="fixed m-0 w-max min-w-[26rem] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-auto rounded-lg border border-base-content/20 bg-base-100 p-5 text-base-content shadow-xl"
                style={position}
                onToggle={handleToggle}
                onKeyDown={handleKeyDown}
            >
                <button
                    ref={closeButton}
                    type="button"
                    data-testid="btnAppUpdateClose"
                    aria-label={t('app.update.panel.close')}
                    onClick={() => dismiss()}
                    className="btn btn-ghost btn-xs absolute right-3 top-3 size-7 p-1"
                >
                    <X className="size-4" aria-hidden="true" />
                </button>
                <AppUpdateContent
                    updateAvailable={updateAvailable}
                    titleId={titleId}
                    onLater={dismiss}
                    {...actions}
                />
            </div>
        </>
    );
}
