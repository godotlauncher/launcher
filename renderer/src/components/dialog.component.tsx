import { CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react';
import {
    type ReactNode,
    type RefObject,
    useId,
    useLayoutEffect,
    useRef,
} from 'react';
import { OverlayTitle } from './ui/overlay-title.component';

export type DialogTone = 'neutral' | 'success' | 'warning' | 'error';

const dialogTones = {
    neutral: {
        Icon: Info,
        iconClassName: 'text-base-content/75',
        headerClassName: 'bg-base-200/60',
    },
    success: {
        Icon: CircleCheck,
        iconClassName: 'text-success-content dark:text-success',
        headerClassName: 'bg-success/10',
    },
    warning: {
        Icon: TriangleAlert,
        iconClassName: 'text-[color:var(--color-warning-readable)]',
        headerClassName: 'bg-warning/10',
    },
    error: {
        Icon: CircleX,
        iconClassName: 'text-error-content dark:text-error',
        headerClassName: 'bg-error/10',
    },
} satisfies Record<
    DialogTone,
    { Icon: typeof Info; iconClassName: string; headerClassName: string }
>;

export type DialogProps = {
    tone?: DialogTone;
    /** Overrides the tone icon; pass null to omit the icon entirely. */
    icon?: ReactNode;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
    testId?: string;
    panelClassName?: string;
    bodyClassName?: string;
    initialFocusRef?: RefObject<HTMLElement | null>;
    returnFocusRef?: RefObject<HTMLElement | null>;
    /** Used when the original trigger disappears before focus is restored. */
    fallbackReturnFocusRef?: RefObject<HTMLElement | null>;
    onRequestClose?: () => void;
};

/**
 * Renders application content in the browser's modal top layer.
 *
 * @param props - Dialog tone, optional icon override, content, focus target and close callback.
 * @returns The native modal dialog.
 */
export const Dialog: React.FC<DialogProps> = ({
    tone = 'neutral',
    icon,
    title,
    children,
    footer,
    testId,
    panelClassName = '',
    bodyClassName = 'overflow-auto',
    initialFocusRef,
    returnFocusRef,
    fallbackReturnFocusRef,
    onRequestClose,
}) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const onRequestCloseRef = useRef(onRequestClose);
    onRequestCloseRef.current = onRequestClose;
    const titleId = useId();
    const widthClassName = panelClassName ? '' : 'max-w-lg';
    const { Icon, iconClassName, headerClassName } = dialogTones[tone];
    const resolvedIcon =
        icon === undefined ? (
            <Icon className={`size-6 ${iconClassName}`} aria-hidden="true" />
        ) : (
            icon
        );

    useLayoutEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) {
            return;
        }

        if (!dialog.open) {
            dialog.showModal();
        }

        /**
         * Routes native Escape requests through controlled React state.
         *
         * @param event - Native dialog cancellation event.
         */
        const handleCancel = (event: Event): void => {
            event.preventDefault();
            onRequestCloseRef.current?.();
        };
        dialog.addEventListener('cancel', handleCancel);

        const initialFocusTarget = initialFocusRef?.current;
        if (
            initialFocusTarget?.isConnected &&
            dialog.contains(initialFocusTarget) &&
            !initialFocusTarget.matches(':disabled')
        ) {
            initialFocusTarget.focus({ preventScroll: true });
        } else {
            titleRef.current?.focus({ preventScroll: true });
        }

        return () => {
            dialog.removeEventListener('cancel', handleCancel);
            if (dialog.open) {
                dialog.close();
            }
            window.requestAnimationFrame(() => {
                const target = [
                    returnFocusRef?.current,
                    fallbackReturnFocusRef?.current,
                ].find(
                    (element) =>
                        element?.isConnected && !element.matches(':disabled'),
                );
                target?.focus({ preventScroll: true });
            });
        };
    }, [initialFocusRef, returnFocusRef, fallbackReturnFocusRef]);

    return (
        <dialog
            ref={dialogRef}
            data-testid={testId}
            aria-labelledby={titleId}
            className="modal z-60 select-none p-4"
        >
            <section
                className={`modal-box w-full max-h-[85vh] flex flex-col overflow-hidden p-0 ${widthClassName} ${panelClassName}`}
            >
                <header
                    className={`flex shrink-0 items-center gap-3 px-5 py-4 ${headerClassName}`}
                >
                    {resolvedIcon && (
                        <div className="w-6 h-6 shrink-0 flex items-center justify-center">
                            {resolvedIcon}
                        </div>
                    )}
                    <OverlayTitle
                        as="h1"
                        ref={titleRef}
                        id={titleId}
                        className="text-lg font-semibold"
                    >
                        {title}
                    </OverlayTitle>
                </header>
                <div
                    className={`min-h-0 flex-1 px-5 py-4 text-base ${bodyClassName}`}
                >
                    {children}
                </div>
                {footer && (
                    <footer className="shrink-0 bg-base-200/40 px-5 py-4 flex flex-wrap justify-end gap-2">
                        {footer}
                    </footer>
                )}
            </section>
        </dialog>
    );
};
