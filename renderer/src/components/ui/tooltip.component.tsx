import clsx from 'clsx';
import {
    type AriaRole,
    cloneElement,
    type FC,
    isValidElement,
    type ReactElement,
    type ReactNode,
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
    calculateTooltipPosition,
    type TooltipPlacement,
    type TooltipPosition,
} from './tooltip-position.model';

export type { TooltipPlacement } from './tooltip-position.model';
export type TooltipTone =
    | 'default'
    | 'primary'
    | 'secondary'
    | 'error'
    | 'warning'
    | 'info';

type TooltipProps = {
    tip: ReactNode;
    children: ReactNode;
    placement?: TooltipPlacement;
    tone?: TooltipTone;
    delay?: number;
    className?: string;
    ariaLabel?: string;
    role?: AriaRole;
};

const defaultDelay = 500;

const tooltipToneClassNames: Record<TooltipTone, string> = {
    default: '',
    primary: 'tooltip-primary',
    secondary: 'tooltip-secondary',
    error: 'tooltip-error',
    warning: 'tooltip-warning',
    info: 'tooltip-info',
};

const useClientLayoutEffect =
    typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Renders accessible text or rich help content on pointer hover and focus.
 *
 * @param props - Tooltip content, trigger, placement, tone, and accessibility properties.
 * @returns The trigger and its lazily mounted tooltip portal.
 */
export const Tooltip: FC<TooltipProps> = ({
    tip,
    children,
    placement = 'right',
    tone = 'default',
    delay = defaultDelay,
    className,
    ariaLabel,
    role,
}) => {
    const tooltipId = useId();
    const triggerRef = useRef<HTMLSpanElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const animationFrameRef = useRef<number | null>(null);
    const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pointerInsideRef = useRef(false);
    const focusInsideRef = useRef(false);
    const previousTipRef = useRef<ReactNode>(tip);
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState<TooltipPosition | null>(null);
    const accessibilityProps =
        role && ariaLabel ? { role, 'aria-label': ariaLabel } : { role };

    const clearOpenTimer = useCallback(() => {
        if (openTimerRef.current !== null) {
            clearTimeout(openTimerRef.current);
            openTimerRef.current = null;
        }
    }, []);

    const requestOpen = useCallback(() => {
        if (open || openTimerRef.current !== null) {
            return;
        }

        if (delay <= 0) {
            setOpen(true);
            return;
        }

        openTimerRef.current = setTimeout(() => {
            openTimerRef.current = null;
            setOpen(true);
        }, delay);
    }, [delay, open]);

    const closeTooltip = useCallback(() => {
        clearOpenTimer();
        setOpen(false);
    }, [clearOpenTimer]);

    const updatePosition = useCallback(() => {
        const trigger = triggerRef.current;
        const tooltip = tooltipRef.current;
        if (!trigger || !tooltip) {
            return;
        }

        const triggerRect = trigger.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        setPosition(
            calculateTooltipPosition({
                triggerRect,
                tooltipSize: {
                    width: tooltipRect.width,
                    height: tooltipRect.height,
                },
                viewport: {
                    width: window.innerWidth,
                    height: window.innerHeight,
                },
                preferredSide: placement,
            }),
        );
    }, [placement]);

    const schedulePositionUpdate = useCallback(() => {
        if (animationFrameRef.current !== null) {
            return;
        }

        animationFrameRef.current = window.requestAnimationFrame(() => {
            animationFrameRef.current = null;
            updatePosition();
        });
    }, [updatePosition]);

    useClientLayoutEffect(() => {
        if (!open) {
            setPosition(null);
            return;
        }

        updatePosition();
        const resizeObserver = new ResizeObserver(schedulePositionUpdate);
        if (triggerRef.current) {
            resizeObserver.observe(triggerRef.current);
        }
        if (tooltipRef.current) {
            resizeObserver.observe(tooltipRef.current);
        }
        window.addEventListener('resize', schedulePositionUpdate);
        const scrollAncestors: HTMLElement[] = [];
        let scrollAncestor = triggerRef.current?.parentElement ?? null;
        while (scrollAncestor) {
            scrollAncestor.addEventListener('scroll', schedulePositionUpdate);
            scrollAncestors.push(scrollAncestor);
            scrollAncestor = scrollAncestor.parentElement;
        }
        window.addEventListener('scroll', schedulePositionUpdate);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', schedulePositionUpdate);
            for (const ancestor of scrollAncestors) {
                ancestor.removeEventListener('scroll', schedulePositionUpdate);
            }
            window.removeEventListener('scroll', schedulePositionUpdate);
            if (animationFrameRef.current !== null) {
                window.cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [open, schedulePositionUpdate, updatePosition]);

    useEffect(() => {
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeTooltip();
            }
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [closeTooltip]);

    useEffect(() => {
        return () => clearOpenTimer();
    }, [clearOpenTimer]);

    useEffect(() => {
        const previousTip = previousTipRef.current;
        previousTipRef.current = tip;
        if (
            previousTip === tip ||
            typeof previousTip !== 'string' ||
            typeof tip !== 'string'
        ) {
            return;
        }

        closeTooltip();
    }, [tip, closeTooltip]);

    const child = isValidElement(children)
        ? (children as ReactElement<{ 'aria-describedby'?: string }>)
        : null;
    const describedChild = child
        ? cloneElement(child, {
              'aria-describedby': open
                  ? [child.props['aria-describedby'], tooltipId]
                        .filter(Boolean)
                        .join(' ')
                  : child.props['aria-describedby'],
          })
        : children;
    const portalHost =
        typeof document === 'undefined'
            ? null
            : (triggerRef.current?.closest('dialog') ?? document.body);

    return (
        <>
            <span
                ref={triggerRef}
                className={clsx(
                    'inline-flex [&>:disabled]:pointer-events-none',
                    className,
                )}
                data-tooltip-trigger=""
                onPointerEnter={() => {
                    pointerInsideRef.current = true;
                    requestOpen();
                }}
                onPointerMove={() => {
                    if (!pointerInsideRef.current) {
                        pointerInsideRef.current = true;
                        requestOpen();
                    }
                }}
                onPointerLeave={() => {
                    pointerInsideRef.current = false;
                    if (!focusInsideRef.current) {
                        closeTooltip();
                    }
                }}
                onFocusCapture={(event) => {
                    if (
                        event.target instanceof HTMLElement &&
                        event.target.hasAttribute('data-suppress-tooltip-focus')
                    ) {
                        focusInsideRef.current = false;
                        if (!pointerInsideRef.current) {
                            closeTooltip();
                        }
                        return;
                    }
                    const focusVisible =
                        event.target instanceof HTMLElement &&
                        event.target.matches(':focus-visible');
                    focusInsideRef.current = focusVisible;
                    if (focusVisible) {
                        requestOpen();
                    } else if (!pointerInsideRef.current) {
                        closeTooltip();
                    }
                }}
                onBlurCapture={(event) => {
                    if (
                        event.relatedTarget instanceof Node &&
                        event.currentTarget.contains(event.relatedTarget)
                    ) {
                        return;
                    }
                    focusInsideRef.current = false;
                    if (!pointerInsideRef.current) {
                        closeTooltip();
                    }
                }}
                onClickCapture={() => {
                    // A clicked control can become disabled before it sends leave or blur.
                    pointerInsideRef.current = false;
                    focusInsideRef.current = false;
                    closeTooltip();
                }}
                {...accessibilityProps}
            >
                {describedChild}
            </span>
            {open &&
                portalHost &&
                createPortal(
                    <div
                        ref={tooltipRef}
                        id={tooltipId}
                        role="tooltip"
                        data-side={position?.side ?? placement}
                        className={clsx(
                            'tooltip tooltip-open pointer-events-none fixed z-70 w-max after:hidden',
                            tooltipToneClassNames[tone],
                        )}
                        style={{
                            left: position?.x ?? 0,
                            top: position?.y ?? 0,
                            maxWidth: 'min(20rem, calc(100vw - 1rem))',
                            visibility: position ? 'visible' : 'hidden',
                        }}
                    >
                        <div className="tooltip-content relative inset-auto max-w-full transform-none text-base leading-normal">
                            {tip}
                        </div>
                        {position && (
                            <span
                                aria-hidden="true"
                                className="absolute size-2 rotate-45 bg-[var(--tt-bg)]"
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
                    </div>,
                    portalHost,
                )}
        </>
    );
};
