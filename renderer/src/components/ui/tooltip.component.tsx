import clsx from 'clsx';
import {
    type AriaRole,
    type CSSProperties,
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
} from './tooltipPosition.model';

export type { TooltipPlacement } from './tooltipPosition.model';
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
    default: 'bg-neutral text-neutral-content',
    primary: 'bg-primary text-primary-content',
    secondary: 'bg-secondary text-secondary-content',
    error: 'bg-error text-error-content',
    warning: 'bg-warning text-warning-content',
    info: 'bg-info text-info-content',
};

const useClientLayoutEffect =
    typeof window === 'undefined' ? useEffect : useLayoutEffect;

const getArrowStyle = (position: TooltipPosition): CSSProperties => {
    switch (position.side) {
        case 'top':
            return {
                bottom: '-0.25rem',
                left: position.arrowX,
                transform: 'translateX(-50%) rotate(45deg)',
            };
        case 'right':
            return {
                left: '-0.25rem',
                top: position.arrowY,
                transform: 'translateY(-50%) rotate(45deg)',
            };
        case 'bottom':
            return {
                left: position.arrowX,
                top: '-0.25rem',
                transform: 'translateX(-50%) rotate(45deg)',
            };
        case 'left':
            return {
                right: '-0.25rem',
                top: position.arrowY,
                transform: 'translateY(-50%) rotate(45deg)',
            };
    }
};

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
                onFocusCapture={() => {
                    focusInsideRef.current = true;
                    requestOpen();
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
                typeof document !== 'undefined' &&
                createPortal(
                    <div
                        ref={tooltipRef}
                        id={tooltipId}
                        role="tooltip"
                        data-side={position?.side ?? placement}
                        className={clsx(
                            'pointer-events-none fixed z-70 w-max whitespace-normal rounded-field px-2 py-1 text-center text-sm leading-tight shadow-md',
                            tooltipToneClassNames[tone],
                        )}
                        style={{
                            left: position?.x ?? 0,
                            top: position?.y ?? 0,
                            maxWidth: 'min(20rem, calc(100vw - 1rem))',
                            visibility: position ? 'visible' : 'hidden',
                        }}
                    >
                        {tip}
                        {position && (
                            <span
                                aria-hidden="true"
                                className="absolute size-2 bg-inherit"
                                style={getArrowStyle(position)}
                            />
                        )}
                    </div>,
                    document.body,
                )}
        </>
    );
};
