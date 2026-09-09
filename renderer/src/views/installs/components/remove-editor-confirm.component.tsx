import type { RemovedReleaseResult } from '@shared/contracts';
import { useRef, useState } from 'react';
import type { ConfirmLayout } from '../../../components/confirm.component';
import { StatusBadge } from '../../../components/ui/status-badge.component';

type RemoveEditorConfirmProps = {
    message: string;
    detail: string;
    usage: string;
    usageCount: number;
    cancelLabel: string;
    removeLabel: string;
    failureMessage: string;
    onRemove: () => Promise<RemovedReleaseResult | undefined>;
    close: () => void;
    renderLayout: ConfirmLayout;
};

/**
 * Confirms editor removal and keeps recoverable failures inside the dialog.
 * @param props - Localised copy, removal action and shared dialog layout.
 */
export function RemoveEditorConfirm({
    message,
    detail,
    usage,
    usageCount,
    cancelLabel,
    removeLabel,
    failureMessage,
    onRemove,
    close,
    renderLayout,
}: RemoveEditorConfirmProps) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string>();
    const pendingRef = useRef(false);
    const cancelRef = useRef<HTMLButtonElement>(null);

    /** Removes once and closes only after confirmed success. */
    const remove = async () => {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setPending(true);
        setError(undefined);
        try {
            const result = await onRemove();
            if (result?.success) {
                close();
            } else {
                setError(result?.error || failureMessage);
            }
        } catch {
            setError(failureMessage);
        } finally {
            pendingRef.current = false;
            setPending(false);
        }
    };

    return renderLayout(
        <div className="flex flex-col gap-[12px]">
            <p className="font-semibold break-words">{message}</p>
            <p className="text-base-content/75">{detail}</p>
            <div>
                <StatusBadge
                    tone={usageCount > 0 ? 'warning' : 'neutral'}
                    className="h-auto whitespace-normal py-1 text-base font-normal"
                >
                    {usage}
                </StatusBadge>
            </div>
            {error && (
                <div
                    role="alert"
                    className="alert alert-error alert-soft text-error-content dark:text-error"
                >
                    {error}
                </div>
            )}
        </div>,
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
                className="btn btn-error text-base"
                disabled={pending}
                aria-busy={pending}
                onClick={() => void remove()}
            >
                {pending && (
                    <span
                        className="loading loading-spinner loading-sm"
                        aria-hidden="true"
                    />
                )}
                {removeLabel}
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
