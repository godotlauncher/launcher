import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConfirmLayout } from '../../../components/confirm.component';

type RemoveProjectConfirmProps = {
    projectName: string;
    onRemove: () => Promise<unknown>;
    onSkipConfirmation: () => void;
    close: () => void;
    renderLayout: ConfirmLayout;
};

/**
 * Confirms list removal and retains the dialog if removal fails.
 * @param props - Project name, actions and shared dialog layout.
 */
export function RemoveProjectConfirm({
    projectName,
    onRemove,
    onSkipConfirmation,
    close,
    renderLayout,
}: RemoveProjectConfirmProps) {
    const { t } = useTranslation(['dialogs', 'common']);
    const [skipConfirmation, setSkipConfirmation] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string>();
    const pendingRef = useRef(false);
    const cancelRef = useRef<HTMLButtonElement>(null);

    /** Removes the entry once and saves the preference after success. */
    const remove = async () => {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setPending(true);
        setError(undefined);
        try {
            await onRemove();
        } catch (cause) {
            setError(
                cause instanceof Error && cause.message
                    ? cause.message
                    : t('common:error'),
            );
            pendingRef.current = false;
            setPending(false);
            return;
        }
        close();
        if (skipConfirmation) onSkipConfirmation();
    };

    return renderLayout(
        <div className="flex flex-col gap-4 text-base">
            <p className="break-words font-semibold">
                {t('removeProject.message', { projectName })}
            </p>
            <p className="text-base-content/75">{t('removeProject.detail')}</p>
            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={skipConfirmation}
                    disabled={pending}
                    onChange={(event) =>
                        setSkipConfirmation(event.currentTarget.checked)
                    }
                />
                <span>{t('removeProject.doNotAskAgain')}</span>
            </label>
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
                {t('common:buttons.cancel')}
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
                {t('common:buttons.remove')}
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
