import {
    type ReactNode,
    type RefObject,
    useId,
    useLayoutEffect,
    useRef,
} from 'react';

type DialogProps = {
    icon?: ReactNode;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
    testId?: string;
    panelClassName?: string;
    bodyClassName?: string;
    initialFocusRef?: RefObject<HTMLElement | null>;
    returnFocusRef?: RefObject<HTMLElement | null>;
    onRequestClose?: () => void;
};

/**
 * Renders application content in the browser's modal top layer.
 *
 * @param props - Dialog content, focus target, and controlled close callback.
 * @returns The native modal dialog.
 */
export const Dialog: React.FC<DialogProps> = ({
    icon,
    title,
    children,
    footer,
    testId,
    panelClassName = '',
    bodyClassName = 'overflow-auto',
    initialFocusRef,
    returnFocusRef,
    onRequestClose,
}) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const onRequestCloseRef = useRef(onRequestClose);
    onRequestCloseRef.current = onRequestClose;
    const titleId = useId();
    const widthClassName = panelClassName ? '' : 'max-w-lg';

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
            const returnFocusTarget = returnFocusRef?.current;
            if (returnFocusTarget?.isConnected) {
                window.requestAnimationFrame(() => {
                    returnFocusTarget.focus({ preventScroll: true });
                });
            }
        };
    }, [initialFocusRef, returnFocusRef]);

    return (
        <dialog
            ref={dialogRef}
            data-testid={testId}
            aria-labelledby={titleId}
            className="fixed z-60 inset-0 m-0 h-full w-full max-h-none max-w-none select-none overflow-hidden border-0 bg-transparent p-0 text-inherit backdrop:bg-transparent"
        >
            <div className="h-full w-full bg-black/55 flex items-center justify-center p-4">
                <section
                    className={`bg-base-100 border border-base-300 rounded-lg shadow-2xl w-full max-h-[85vh] flex flex-col overflow-hidden ${widthClassName} ${panelClassName}`}
                >
                    <header className="flex shrink-0 items-center gap-3 px-5 py-4 border-b border-base-300 bg-base-200/60">
                        {icon && (
                            <div className="w-6 h-6 flex items-center justify-center">
                                {icon}
                            </div>
                        )}
                        <h1
                            ref={titleRef}
                            id={titleId}
                            tabIndex={-1}
                            className="dialog-title text-base-content font-bold text-lg leading-tight pt-1"
                        >
                            {title}
                        </h1>
                    </header>
                    <div
                        className={`min-h-0 flex-1 px-5 py-4 leading-6 text-base-content/80 ${bodyClassName}`}
                    >
                        {children}
                    </div>
                    {footer && (
                        <footer className="shrink-0 px-5 py-4 border-t border-base-300 bg-base-200/40 flex flex-wrap justify-end gap-2">
                            {footer}
                        </footer>
                    )}
                </section>
            </div>
        </dialog>
    );
};
