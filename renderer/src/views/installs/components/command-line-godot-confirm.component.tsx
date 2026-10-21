import { useRef, useState } from 'react';
import type { ConfirmLayout } from '../../../components/confirm.component';

/**
 * Locks setup confirmation controls while the terminal command is registered.
 * @param props - Localised copy, setup action and shared confirmation layout.
 */
export function CommandLineGodotConfirm({
    message,
    okLabel,
    cancelLabel,
    onConfirm,
    close,
    renderLayout,
}: {
    message: string;
    okLabel: string;
    cancelLabel: string;
    onConfirm: () => Promise<boolean>;
    close: () => void;
    renderLayout: ConfirmLayout;
}) {
    const [pending, setPending] = useState(false);
    const pendingRef = useRef(false);
    const cancelRef = useRef<HTMLButtonElement>(null);

    /** Runs setup once and keeps the dialog locked until it settles. */
    const confirm = async () => {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setPending(true);
        try {
            if (await onConfirm()) close();
        } finally {
            pendingRef.current = false;
            setPending(false);
        }
    };

    return renderLayout(
        <p className="whitespace-pre-line">{message}</p>,
        <>
            <button
                ref={cancelRef}
                type="button"
                className="btn btn-ghost text-base"
                disabled={pending}
                onClick={close}
            >
                {cancelLabel}
            </button>
            <button
                type="button"
                className="btn btn-primary text-base"
                disabled={pending}
                aria-busy={pending}
                onClick={() => void confirm()}
            >
                {pending && (
                    <span
                        className="loading loading-spinner loading-sm"
                        aria-hidden="true"
                    />
                )}
                {okLabel}
            </button>
        </>,
        {
            initialFocusRef: cancelRef,
            onRequestClose: () => {
                if (!pendingRef.current) close();
            },
        },
    );
}
