import clsx from 'clsx';
import { X } from 'lucide-react';
import type React from 'react';
import type {
    ComponentProps,
    CSSProperties,
    MouseEvent as ReactMouseEvent,
    ReactNode,
} from 'react';
import {
    Children,
    createContext,
    isValidElement,
    useCallback,
    useContext,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from 'react';
import './drawer.component.css';

export type DrawerSide = 'left' | 'right' | 'top' | 'bottom';

type DrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    side?: DrawerSide;
    closeOnBackdrop?: boolean;
    closeOnEscape?: boolean;
    ariaLabel?: string;
    children?: ReactNode;
    className?: string;
    panelClassName?: string;
    backdropClassName?: string;
    width?: number | string;
};

type DrawerSlotProps = {
    children?: ReactNode;
    className?: string;
};

type DrawerBodyProps = DrawerSlotProps & {
    scrollable?: boolean;
};

type DrawerCloseButtonProps = ComponentProps<'button'>;

type DrawerContextValue = {
    close: () => void;
    titleId: string;
};

type DrawerComponent = React.FC<DrawerProps> & {
    Header: React.FC<DrawerSlotProps>;
    Title: React.FC<DrawerSlotProps>;
    Body: React.FC<DrawerBodyProps>;
    Footer: React.FC<DrawerSlotProps>;
    CloseButton: React.FC<DrawerCloseButtonProps>;
};

type DrawerBackdropEvent = {
    target: EventTarget | null;
    currentTarget: EventTarget | null;
    defaultPrevented?: boolean;
};

type DrawerEscapeEvent = {
    key: string;
    defaultPrevented?: boolean;
};

type DrawerEscapeOptions = {
    closeOnEscape?: boolean;
    hasOpenPopover?: boolean;
};

const drawerTransitionMs = 200;

const drawerSideClassNames: Record<
    DrawerSide,
    {
        container: string;
        panel: string;
    }
> = {
    left: {
        container: 'items-stretch justify-start',
        panel: 'h-full w-full max-w-md border-r border-base-300',
    },
    right: {
        container: 'items-stretch justify-end',
        panel: 'h-full w-full max-w-md border-l border-base-300',
    },
    top: {
        container: 'items-start justify-stretch',
        panel: 'w-full max-h-[85vh] border-b border-base-300',
    },
    bottom: {
        container: 'items-end justify-stretch',
        panel: 'w-full max-h-[85vh] border-t border-base-300',
    },
};

const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

const DrawerContext = createContext<DrawerContextValue | null>(null);

function useDrawerContext(componentName: string): DrawerContextValue {
    const context = useContext(DrawerContext);

    if (!context) {
        throw new Error(`${componentName} must be used within Drawer.`);
    }

    return context;
}

export function shouldCloseDrawerOnBackdropClick(
    event: DrawerBackdropEvent,
    closeOnBackdrop = true,
): boolean {
    return (
        closeOnBackdrop &&
        !event.defaultPrevented &&
        event.target === event.currentTarget
    );
}

export function shouldCloseDrawerOnEscape(
    event: DrawerEscapeEvent,
    optionsOrCloseOnEscape: DrawerEscapeOptions | boolean = true,
): boolean {
    const options =
        typeof optionsOrCloseOnEscape === 'boolean'
            ? { closeOnEscape: optionsOrCloseOnEscape }
            : optionsOrCloseOnEscape;
    return (
        (options.closeOnEscape ?? true) &&
        !options.hasOpenPopover &&
        !event.defaultPrevented &&
        event.key === 'Escape'
    );
}

function hasOpenPopover(): boolean {
    return (
        typeof document !== 'undefined' &&
        Boolean(document.querySelector(':popover-open'))
    );
}

export function createDrawerCloseButtonClickHandler(
    close: () => void,
    onClick?: DrawerCloseButtonProps['onClick'],
): DrawerCloseButtonProps['onClick'] {
    return (event) => {
        onClick?.(event);

        if (!event.defaultPrevented) {
            close();
        }
    };
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(
        container.querySelectorAll<HTMLElement>(focusableSelector),
    )
        .filter((element) => element.offsetParent !== null)
        .filter((element) => !element.hasAttribute('disabled'));
}

function focusFirstDrawerElement(panel: HTMLElement): void {
    const firstFocusableElement = getFocusableElements(panel)[0];
    (firstFocusableElement ?? panel).focus();
}

function trapFocusInDrawer(
    event: KeyboardEvent,
    panel: HTMLElement | null,
): void {
    if (event.key !== 'Tab' || event.defaultPrevented || !panel) {
        return;
    }

    const focusableElements = getFocusableElements(panel);

    if (focusableElements.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
    }

    const firstFocusableElement = focusableElements[0];
    const lastFocusableElement =
        focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstFocusableElement) {
        event.preventDefault();
        lastFocusableElement.focus();
        return;
    }

    if (!event.shiftKey && document.activeElement === lastFocusableElement) {
        event.preventDefault();
        firstFocusableElement.focus();
    }
}

const DrawerHeader: React.FC<DrawerSlotProps> = ({ children, className }) => (
    <header
        className={clsx(
            'flex shrink-0 items-start justify-between gap-3 border-b border-base-300 bg-base-200/60 px-5 py-4',
            className,
        )}
    >
        {children}
    </header>
);

const DrawerTitle: React.FC<DrawerSlotProps> = ({ children, className }) => {
    const { titleId } = useDrawerContext('Drawer.Title');

    return (
        <h2
            id={titleId}
            className={clsx(
                'text-lg font-bold leading-tight text-base-content',
                className,
            )}
        >
            {children}
        </h2>
    );
};

const DrawerBody: React.FC<DrawerBodyProps> = ({
    children,
    className,
    scrollable = true,
}) => (
    <div
        className={clsx(
            'px-5 py-4 text-sm leading-6 text-base-content/80',
            scrollable ? 'min-h-0 flex-1 overflow-y-auto' : 'flex-1',
            className,
        )}
    >
        {children}
    </div>
);

const DrawerFooter: React.FC<DrawerSlotProps> = ({ children, className }) => (
    <footer
        className={clsx(
            'flex shrink-0 justify-end gap-2 border-t border-base-300 bg-base-200/40 px-5 py-4',
            className,
        )}
    >
        {children}
    </footer>
);

const DrawerCloseButton: React.FC<DrawerCloseButtonProps> = ({
    children,
    className,
    onClick,
    'aria-label': ariaLabel = 'Close drawer',
    ...buttonProps
}) => {
    const { close } = useDrawerContext('Drawer.CloseButton');

    return (
        <button
            {...buttonProps}
            type="button"
            aria-label={ariaLabel}
            onClick={createDrawerCloseButtonClickHandler(close, onClick)}
            className={clsx('btn btn-ghost btn-square btn-sm', className)}
        >
            {children ?? <X aria-hidden="true" size={18} />}
        </button>
    );
};

function containsDrawerTitle(children: ReactNode): boolean {
    let hasTitle = false;

    Children.forEach(children, (child) => {
        if (hasTitle || !isValidElement<{ children?: ReactNode }>(child)) {
            return;
        }

        if (child.type === DrawerTitle) {
            hasTitle = true;
            return;
        }

        if (containsDrawerTitle(child.props.children)) {
            hasTitle = true;
        }
    });

    return hasTitle;
}

const DrawerRoot: React.FC<DrawerProps> = ({
    open,
    onOpenChange,
    side = 'right',
    closeOnBackdrop = true,
    closeOnEscape = true,
    ariaLabel,
    children,
    className,
    panelClassName,
    backdropClassName,
    width,
}) => {
    const titleId = useId();
    const panelRef = useRef<HTMLElement | null>(null);
    const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
    const [shouldRender, setShouldRender] = useState(open);
    const [visible, setVisible] = useState(open);
    const sideClassNames = drawerSideClassNames[side];
    const hasTitle = useMemo(() => containsDrawerTitle(children), [children]);

    const close = useCallback(() => {
        onOpenChange(false);
    }, [onOpenChange]);

    const contextValue = useMemo(
        () => ({
            close,
            titleId,
        }),
        [close, titleId],
    );

    useEffect(() => {
        if (open) {
            setShouldRender(true);
            setVisible(true);
            return;
        }

        if (!shouldRender) {
            return;
        }

        setVisible(false);

        if (typeof window === 'undefined') {
            setShouldRender(false);
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setShouldRender(false);
        }, drawerTransitionMs);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [open, shouldRender]);

    useEffect(() => {
        if (
            !open ||
            typeof window === 'undefined' ||
            typeof document === 'undefined'
        ) {
            return;
        }

        const activeElement = document.activeElement;

        if (activeElement instanceof HTMLElement) {
            previouslyFocusedElementRef.current = activeElement;
        }

        const animationFrameId = window.requestAnimationFrame(() => {
            if (panelRef.current) {
                focusFirstDrawerElement(panelRef.current);
            }
        });

        return () => {
            window.cancelAnimationFrame(animationFrameId);
            previouslyFocusedElementRef.current?.focus();
            previouslyFocusedElementRef.current = null;
        };
    }, [open]);

    useEffect(() => {
        if (!open || typeof window === 'undefined') {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (
                shouldCloseDrawerOnEscape(event, {
                    closeOnEscape,
                    hasOpenPopover: hasOpenPopover(),
                })
            ) {
                event.preventDefault();
                onOpenChange(false);
                return;
            }

            trapFocusInDrawer(event, panelRef.current);
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [closeOnEscape, onOpenChange, open]);

    const handleBackdropClick = useCallback(
        (event: ReactMouseEvent<HTMLButtonElement>) => {
            if (shouldCloseDrawerOnBackdropClick(event, closeOnBackdrop)) {
                onOpenChange(false);
            }
        },
        [closeOnBackdrop, onOpenChange],
    );

    if (!shouldRender) {
        return null;
    }

    const drawerState = visible ? 'open' : 'closed';
    const panelStyle: CSSProperties | undefined =
        width === undefined
            ? undefined
            : {
                  width: typeof width === 'number' ? `${width}px` : width,
                  maxWidth: '100vw',
              };

    return (
        <div
            className={clsx(
                'fixed inset-0 z-50 flex overflow-hidden',
                sideClassNames.container,
                className,
            )}
        >
            <button
                type="button"
                aria-label="Close drawer"
                tabIndex={-1}
                className={clsx(
                    'drawer-backdrop absolute inset-0 border-0 bg-black/80 p-0',
                    closeOnBackdrop ? 'cursor-pointer' : 'cursor-default',
                    backdropClassName,
                )}
                data-state={drawerState}
                data-testid="drawerBackdrop"
                onClick={handleBackdropClick}
            />
            <section
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel ?? (hasTitle ? undefined : 'Drawer')}
                aria-labelledby={!ariaLabel && hasTitle ? titleId : undefined}
                className={clsx(
                    'drawer-panel relative z-10 flex flex-col overflow-hidden bg-base-100 text-base-content shadow-2xl outline-none',
                    sideClassNames.panel,
                    panelClassName,
                )}
                data-side={side}
                data-state={drawerState}
                style={panelStyle}
            >
                <DrawerContext.Provider value={contextValue}>
                    {children}
                </DrawerContext.Provider>
            </section>
        </div>
    );
};

export const Drawer = Object.assign(DrawerRoot, {
    Header: DrawerHeader,
    Title: DrawerTitle,
    Body: DrawerBody,
    Footer: DrawerFooter,
    CloseButton: DrawerCloseButton,
}) satisfies DrawerComponent;
