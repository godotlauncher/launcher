import type { TFunction } from 'i18next';
import { FolderOpen, Trash2 } from 'lucide-react';
import type { RefObject } from 'react';
import { CopyButton } from '../../../components/ui/copy-button.component';

/** Shows the retained clone and recovery actions.
 * @param props - Clone details and folder action.
 */
export function RemoteProjectCloneRecovery({
    path,
    error,
    busy,
    t,
    onOpen,
}: {
    path: string;
    error: string | null;
    busy: boolean;
    t: TFunction;
    onOpen: () => void;
}) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold">
                    {t('addProject.remote.review.cancelTitle')}
                </h2>
                <p className="text-base text-base-content/75">
                    {t('addProject.remote.review.cancelDescription')}
                </p>
            </div>
            <div className="flex items-center gap-2 rounded-box bg-base-200/60 p-3">
                <code className="min-w-0 flex-1 select-none break-all font-mono text-sm">
                    {path}
                </code>
                <div className="shrink-0">
                    <CopyButton value={path} />
                </div>
            </div>
            <button
                type="button"
                className="btn btn-ghost self-start text-base"
                disabled={busy}
                onClick={onOpen}
            >
                <FolderOpen size={16} aria-hidden="true" />
                {t('addProject.remote.actions.openCloneFolder')}
            </button>
            {error && (
                <p
                    className="alert alert-error alert-soft text-base text-error-content dark:text-error"
                    role="alert"
                >
                    {t(error)}
                </p>
            )}
        </div>
    );
}

/** Keeps the safe exit prominent and deletion explicitly destructive.
 * @param props - Recovery availability and existing workflow callbacks.
 */
export function RemoteProjectCloneRecoveryFooter({
    busy,
    canDelete,
    backRef,
    t,
    onBack,
    onKeep,
    onDelete,
}: {
    busy: boolean;
    canDelete: boolean;
    backRef: RefObject<HTMLButtonElement | null>;
    t: TFunction;
    onBack: () => void;
    onKeep: () => void;
    onDelete: () => void;
}) {
    return (
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <button
                ref={backRef}
                type="button"
                className="btn btn-ghost text-base"
                disabled={busy}
                onClick={onBack}
            >
                {t('common:buttons.back')}
            </button>
            <div className="flex flex-wrap justify-end gap-2">
                {canDelete && (
                    <button
                        type="button"
                        data-testid="btnDeletePreservedClone"
                        className="btn btn-ghost text-base text-error/80 hover:text-error hover:bg-error/20"
                        disabled={busy}
                        onClick={onDelete}
                    >
                        {busy ? (
                            <span className="loading loading-spinner loading-xs" />
                        ) : (
                            <Trash2 size={16} aria-hidden="true" />
                        )}
                        {t('addProject.remote.actions.deleteCloneAndClose')}
                    </button>
                )}
                <button
                    type="button"
                    data-testid="btnKeepPreservedClone"
                    className="btn btn-primary text-base"
                    disabled={busy}
                    onClick={onKeep}
                >
                    {t('addProject.remote.actions.keepCloneAndClose')}
                </button>
            </div>
        </div>
    );
}
