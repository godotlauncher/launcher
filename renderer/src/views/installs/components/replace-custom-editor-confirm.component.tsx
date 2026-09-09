import type { RegisterCustomEngineResult } from '@shared/contracts';
import { useRef, useState } from 'react';
import type { ConfirmLayout } from '../../../components/confirm.component';

type ReplaceCustomEditorConfirmProps = {
    message: string;
    detail: string;
    version: string;
    versionLabel: string;
    cancelLabel: string;
    replaceLabel: string;
    failureMessage: string;
    onReplace: () => Promise<RegisterCustomEngineResult>;
    onSuccess: (result: RegisterCustomEngineResult) => void;
    close: () => void;
    renderLayout: ConfirmLayout;
};

/**
 * Confirms replacement without dismissing pending or failed requests.
 * @param props - Localised copy, replacement actions and shared dialog layout.
 */
export function ReplaceCustomEditorConfirm({
    message,
    detail,
    version,
    versionLabel,
    cancelLabel,
    replaceLabel,
    failureMessage,
    onReplace,
    onSuccess,
    close,
    renderLayout,
}: ReplaceCustomEditorConfirmProps) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string>();
    const pendingRef = useRef(false);
    const cancelRef = useRef<HTMLButtonElement>(null);

    /** Runs one replacement, retaining failures for retry. */
    const replace = async () => {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setPending(true);
        setError(undefined);
        let result: RegisterCustomEngineResult;
        try {
            result = await onReplace();
        } catch (cause) {
            setError(
                cause instanceof Error && cause.message.trim()
                    ? cause.message
                    : failureMessage,
            );
            pendingRef.current = false;
            setPending(false);
            return;
        }
        pendingRef.current = false;
        setPending(false);
        if (!result.success) {
            setError(result.error?.trim() || failureMessage);
            return;
        }
        close();
        onSuccess(result);
    };

    return renderLayout(
        <div className="flex flex-col gap-[12px] text-base">
            <p>{message}</p>
            <div className="flex flex-col gap-1 rounded-box bg-base-200/60 p-3">
                <span className="text-base-content/75">{versionLabel}</span>
                <code className="break-words font-mono">{version}</code>
            </div>
            <p className="text-base-content/75">{detail}</p>
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
                className="btn btn-warning text-base"
                disabled={pending}
                aria-busy={pending}
                onClick={() => void replace()}
            >
                {pending && (
                    <span
                        className="loading loading-spinner loading-sm"
                        aria-hidden="true"
                    />
                )}
                {replaceLabel}
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
