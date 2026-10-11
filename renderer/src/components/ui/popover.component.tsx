import clsx from 'clsx';
import {
    type KeyboardEvent,
    type ReactNode,
    type RefObject,
    type ToggleEvent,
    useCallback,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import {
    calculatePopoverPosition,
    type PopoverBoundary,
} from './popover-position.util';
import type { TooltipPlacement } from './tooltip-position.model';

export type PopoverProps = {
    id: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    triggerRef: RefObject<HTMLElement | null>;
    initialFocusRef?: RefObject<HTMLElement | null>;
    ariaLabel?: string;
    ariaLabelledBy?: string;
    placement?: TooltipPlacement;
    getBoundary?: () => PopoverBoundary;
    header?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    className?: string;
    showArrow?: boolean;
};

const arrowBorders = {
    left: 'border-r border-t',
    right: 'border-b border-l',
    top: 'border-b border-r',
    bottom: 'border-l border-t',
};

/** Renders an interactive anchored panel in the native popover top layer.
 * The caller owns the trigger and content; the panel owns layout and dismissal.
 * @param props - Controlled visibility, anchor, accessible name and panel content.
 */
export function Popover({
    id,
    open,
    onOpenChange,
    triggerRef,
    initialFocusRef,
    ariaLabel,
    ariaLabelledBy,
    placement = 'bottom',
    getBoundary,
    header,
    footer,
    children,
    className = 'w-80',
    showArrow = true,
}: PopoverProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const frameRef = useRef<number | null>(null);
    const tabFrameRef = useRef<number | null>(null);
    const changeRef = useRef(onOpenChange);
    changeRef.current = onOpenChange;
    const restoreFocusRef = useRef(true);
    const [position, setPosition] = useState<ReturnType<
        typeof calculatePopoverPosition
    > | null>(null);

    /** Restores focus without interrupting an outside control the user selected. */
    const restoreFocus = useCallback(() => {
        const focused = document.activeElement;
        if (
            restoreFocusRef.current &&
            (focused === document.body ||
                focused === triggerRef.current ||
                (focused && panelRef.current?.contains(focused)))
        )
            triggerRef.current?.focus({ preventScroll: true });
    }, [triggerRef]);

    /** Closes the panel, optionally returning focus after keyboard dismissal.
     * @param returnFocus - Whether dismissal should restore the trigger's focus.
     */
    const dismiss = useCallback(
        (returnFocus: boolean) => {
            if (!panelRef.current?.matches(':popover-open')) return;
            restoreFocusRef.current = returnFocus;
            panelRef.current?.hidePopover();
            changeRef.current(false);
            if (returnFocus) restoreFocus();
        },
        [restoreFocus],
    );

    /** Measures the current anchor and clamps the panel and arrow to its boundary. */
    const updatePosition = useCallback(() => {
        const panel = panelRef.current;
        const anchor = triggerRef.current;
        if (!panel?.matches(':popover-open') || !anchor) return;
        setPosition(
            calculatePopoverPosition({
                anchor: anchor.getBoundingClientRect(),
                panelSize: {
                    width: panel.offsetWidth,
                    height: panel.offsetHeight,
                },
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight,
                },
                boundary: getBoundary?.(),
                placement,
            }),
        );
    }, [getBoundary, placement, triggerRef]);

    /** Batches resize and scroll measurements into one update before painting. */
    const schedulePosition = useCallback(() => {
        if (frameRef.current !== null) return;
        frameRef.current = window.requestAnimationFrame(() => {
            frameRef.current = null;
            updatePosition();
        });
    }, [updatePosition]);

    /** Cancels pending keyboard dismissal when this opening ends. */
    const cancelTabDismissal = useCallback(() => {
        if (tabFrameRef.current === null) return;
        window.cancelAnimationFrame(tabFrameRef.current);
        tabFrameRef.current = null;
    }, []);

    useLayoutEffect(() => {
        const panel = panelRef.current;
        const trigger = triggerRef.current;
        if (!panel || !trigger) return;
        if (!open) {
            if (panel.matches(':popover-open')) {
                panel.hidePopover();
                restoreFocus();
            }
            setPosition(null);
            return;
        }
        restoreFocusRef.current = true;
        if (!panel.matches(':popover-open'))
            panel.showPopover({ source: trigger });
        const focusFrame = window.requestAnimationFrame(() => {
            if (!panel.matches(':popover-open')) return;
            const target = initialFocusRef?.current;
            if (
                target?.isConnected &&
                panel.contains(target) &&
                !target.matches(':disabled')
            )
                target.focus({ preventScroll: true });
            else panel.focus({ preventScroll: true });
        });
        return () => window.cancelAnimationFrame(focusFrame);
    }, [initialFocusRef, open, restoreFocus, triggerRef]);

    useLayoutEffect(() => {
        if (open) updatePosition();
    }, [open, updatePosition]);

    useLayoutEffect(() => {
        if (!open) cancelTabDismissal();
        return cancelTabDismissal;
    }, [cancelTabDismissal, open]);

    useLayoutEffect(() => {
        const panel = panelRef.current;
        const trigger = triggerRef.current;
        if (!open || !panel || !trigger) return;
        const resize = new ResizeObserver(schedulePosition);
        resize.observe(panel);
        // Content can grow while the panel stays at its maximum height.
        for (const child of panel.children) resize.observe(child);
        let ancestor: HTMLElement | null = trigger;
        while (ancestor) {
            resize.observe(ancestor);
            ancestor = ancestor.parentElement;
        }
        /** Closes the panel when scrolling hides its trigger.
         * @param entries - Current visibility of the observed trigger.
         */
        const onVisibility = (entries: IntersectionObserverEntry[]) => {
            if (entries[0] && !entries[0].isIntersecting) dismiss(false);
        };
        const visibility = new IntersectionObserver(onVisibility);
        visibility.observe(trigger);
        /** Follows surrounding scrolling without reacting to the panel's own body.
         * @param event - Captured scroll event.
         */
        const onScroll = (event: Event) => {
            if (event.target instanceof Node && panel.contains(event.target))
                return;
            schedulePosition();
        };
        window.addEventListener('resize', schedulePosition);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            resize.disconnect();
            visibility.disconnect();
            window.removeEventListener('resize', schedulePosition);
            window.removeEventListener('scroll', onScroll, true);
            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current);
                frameRef.current = null;
            }
        };
    }, [dismiss, open, schedulePosition, triggerRef]);

    /** Synchronises native outside dismissal with the caller's controlled state.
     * @param event - Native panel visibility change.
     */
    const handleToggle = (event: ToggleEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget) return;
        const visible = event.newState === 'open';
        if (!visible) restoreFocus();
        if (visible !== open) changeRef.current(visible);
    };

    /** Dismisses only this panel on Escape or after Tab leaves its content.
     * @param event - Keyboard input inside the popover.
     */
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            dismiss(true);
        }
        if (event.key === 'Tab') {
            cancelTabDismissal();
            tabFrameRef.current = window.requestAnimationFrame(() => {
                tabFrameRef.current = null;
                const panel = panelRef.current;
                if (
                    panel?.matches(':popover-open') &&
                    !panel.contains(document.activeElement)
                )
                    dismiss(false);
            });
        }
    };

    return (
        <div
            ref={panelRef}
            id={id}
            popover="auto"
            role="dialog"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            tabIndex={-1}
            data-side={position?.side}
            className={clsx(
                'fixed m-0 overflow-visible rounded-md border border-base-content/20 bg-base-100 p-3 text-base text-base-content shadow-lg open:flex open:flex-col',
                className,
            )}
            style={{
                left: position?.left ?? 0,
                top: position?.top ?? 0,
                maxWidth: position?.maxWidth ?? 'calc(100vw - 20px)',
                maxHeight: position?.maxHeight ?? 'calc(100vh - 20px)',
                visibility: position ? 'visible' : 'hidden',
            }}
            onToggle={handleToggle}
            onKeyDown={handleKeyDown}
        >
            {header && <div className="shrink-0 break-words">{header}</div>}
            <div className="min-h-0 overflow-y-auto" data-popover-body>
                <div>{children}</div>
            </div>
            {footer && (
                <div className="mt-3 flex shrink-0 justify-end gap-2 border-t border-base-content/10 pt-2">
                    {footer}
                </div>
            )}
            {showArrow && position && (
                <span
                    aria-hidden="true"
                    data-popover-arrow
                    className={clsx(
                        'pointer-events-none absolute size-[10px] rotate-45 border-base-content/20 bg-base-100',
                        arrowBorders[position.side],
                    )}
                    style={{
                        left:
                            position.side === 'left'
                                ? '100%'
                                : position.side === 'right'
                                  ? 0
                                  : position.arrowX,
                        top:
                            position.side === 'top'
                                ? '100%'
                                : position.side === 'bottom'
                                  ? 0
                                  : position.arrowY,
                        translate: '-50% -50%',
                    }}
                />
            )}
        </div>
    );
}
