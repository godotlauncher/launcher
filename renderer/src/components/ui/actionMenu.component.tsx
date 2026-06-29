import clsx from 'clsx';
import { Check } from 'lucide-react';
import type React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

export type ActionMenuAnchorRect = Pick<
    DOMRect,
    'top' | 'right' | 'bottom' | 'left' | 'width' | 'height'
>;

export type ActionMenuActionItem = {
    type?: 'item';
    key: string;
    label: ReactNode;
    icon?: ReactNode;
    checked?: boolean;
    disabled?: boolean;
    destructive?: boolean;
    testId?: string;
    onSelect: () => void | Promise<void>;
};

export type ActionMenuSeparatorItem = {
    type: 'separator';
    key: string;
};

export type ActionMenuItem = ActionMenuActionItem | ActionMenuSeparatorItem;

type ActionMenuProps = {
    open: boolean;
    anchorRect: ActionMenuAnchorRect | null;
    ariaLabel: string;
    title?: ReactNode;
    items: ActionMenuItem[];
    onClose: () => void;
    className?: string;
};

type MenuPosition = {
    top: number;
    left: number;
    maxHeight: number;
};

const viewportMargin = 8;
const triggerGap = 6;
const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export function getActionMenuAnchorRect(
    element: Element,
): ActionMenuAnchorRect {
    const rect = element.getBoundingClientRect();
    return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
    };
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(
        container.querySelectorAll<HTMLElement>(focusableSelector),
    )
        .filter((element) => element.offsetParent !== null)
        .filter((element) => !element.hasAttribute('disabled'));
}

function trapFocusInMenu(
    event: KeyboardEvent,
    menuPanel: HTMLElement | null,
): void {
    if (event.key !== 'Tab' || event.defaultPrevented || !menuPanel) {
        return;
    }

    const focusableElements = getFocusableElements(menuPanel);
    if (focusableElements.length === 0) {
        event.preventDefault();
        menuPanel.focus();
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

function calculatePosition(
    panel: HTMLElement,
    anchorRect: ActionMenuAnchorRect,
): MenuPosition {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxPanelHeight = viewportHeight - viewportMargin * 2;
    const panelWidth = Math.min(
        panel.offsetWidth,
        viewportWidth - viewportMargin * 2,
    );
    const panelHeight = Math.min(panel.offsetHeight, maxPanelHeight);
    const roomBelow = viewportHeight - anchorRect.bottom - viewportMargin;
    const roomAbove = anchorRect.top - viewportMargin;
    const shouldOpenBelow = roomBelow >= panelHeight || roomBelow >= roomAbove;

    const preferredTop = shouldOpenBelow
        ? anchorRect.bottom + triggerGap
        : anchorRect.top - panelHeight - triggerGap;
    const top = clamp(
        preferredTop,
        viewportMargin,
        viewportHeight - panelHeight - viewportMargin,
    );
    const preferredLeft = anchorRect.right - panelWidth;
    const left = clamp(
        preferredLeft,
        viewportMargin,
        viewportWidth - panelWidth - viewportMargin,
    );

    return {
        top,
        left,
        maxHeight: viewportHeight - top - viewportMargin,
    };
}

export const ActionMenu: React.FC<ActionMenuProps> = ({
    open,
    anchorRect,
    ariaLabel,
    title,
    items,
    onClose,
    className,
}) => {
    const panelRef = useRef<HTMLElement | null>(null);
    const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
    const [position, setPosition] = useState<MenuPosition | null>(null);

    useEffect(() => {
        if (!open || typeof document === 'undefined') {
            return;
        }

        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement) {
            previouslyFocusedElementRef.current = activeElement;
        }

        const animationFrameId = window.requestAnimationFrame(() => {
            const firstFocusableElement = panelRef.current
                ? getFocusableElements(panelRef.current)[0]
                : null;
            (firstFocusableElement ?? panelRef.current)?.focus();
        });

        return () => {
            window.cancelAnimationFrame(animationFrameId);
            previouslyFocusedElementRef.current?.focus();
            previouslyFocusedElementRef.current = null;
        };
    }, [open]);

    useEffect(() => {
        if (!open || !anchorRect || typeof window === 'undefined') {
            return;
        }

        const updatePosition = () => {
            if (panelRef.current) {
                setPosition(calculatePosition(panelRef.current, anchorRect));
            }
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        return () => window.removeEventListener('resize', updatePosition);
    }, [anchorRect, open]);

    useEffect(() => {
        if (!open || typeof window === 'undefined') {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented) {
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }

            trapFocusInMenu(event, panelRef.current);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, open]);

    if (!open) {
        return null;
    }

    const panelStyle: CSSProperties = position
        ? {
              top: position.top,
              left: position.left,
              maxHeight: position.maxHeight,
          }
        : {
              top: 0,
              left: 0,
              visibility: 'hidden',
          };

    return (
        <div className="fixed inset-0 z-50">
            <button
                type="button"
                aria-label="Close menu"
                className="absolute inset-0 border-0 bg-black/40 p-0"
                onClick={onClose}
            />
            <section
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                className={clsx(
                    'fixed z-10 min-w-72 max-w-[calc(100vw-1rem)] overflow-auto rounded-box border border-base-100 bg-base-300 p-1 text-base-content shadow-2xl outline-none',
                    className,
                )}
                style={panelStyle}
            >
                <ul className="menu w-full bg-base-300 p-0">
                    {title && (
                        <li className="menu-title max-w-72 menu-disabled">
                            <span className="truncate">{title}</span>
                        </li>
                    )}
                    {items.map((item) => {
                        if (item.type === 'separator') {
                            return (
                                <li
                                    key={item.key}
                                    aria-hidden="true"
                                    className="my-1 h-px bg-base-content"
                                />
                            );
                        }

                        return (
                            <li key={item.key}>
                                <button
                                    type="button"
                                    aria-pressed={
                                        item.checked === undefined
                                            ? undefined
                                            : item.checked
                                    }
                                    disabled={item.disabled}
                                    data-testid={item.testId}
                                    className={clsx(
                                        'w-full',
                                        item.destructive &&
                                            'text-error hover:bg-error/10',
                                    )}
                                    onClick={() => {
                                        if (item.disabled) {
                                            return;
                                        }

                                        onClose();
                                        void item.onSelect();
                                    }}
                                >
                                    <span
                                        aria-hidden="true"
                                        className="flex h-5 w-5 items-center justify-center"
                                    >
                                        {item.icon}
                                    </span>
                                    <span className="min-w-0 whitespace-normal wrap-break-word">
                                        {item.label}
                                    </span>
                                    <span
                                        aria-hidden="true"
                                        className="flex h-5 w-5 items-center justify-center"
                                    >
                                        {item.checked && (
                                            <Check className="h-4 w-4" />
                                        )}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </section>
        </div>
    );
};
