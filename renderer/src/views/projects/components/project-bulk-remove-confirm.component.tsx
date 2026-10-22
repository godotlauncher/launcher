import type { ProjectDetails } from '@shared/contracts';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../../../components/dialog.component';

type BulkRemoveConfirmProps = {
    targets: ProjectDetails[];
    pending: boolean;
    onCancel: () => void;
    onConfirm: () => Promise<void>;
};

/** Confirms a fixed removal list without changing individual confirmation preferences.
 * @param props - Reviewed targets, pending state and guarded batch actions.
 */
export function ProjectBulkRemoveConfirm({
    targets,
    pending,
    onCancel,
    onConfirm,
}: BulkRemoveConfirmProps) {
    const { t } = useTranslation(['projects', 'common']);
    const cancelRef = useRef<HTMLButtonElement>(null);
    return (
        <Dialog
            title={t('selection.removeTitle')}
            tone="warning"
            initialFocusRef={cancelRef}
            onRequestClose={onCancel}
            footer={
                <>
                    <button
                        ref={cancelRef}
                        type="button"
                        className="btn btn-ghost text-base"
                        disabled={pending}
                        onClick={onCancel}
                    >
                        {t('common:buttons.cancel')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-error text-base"
                        disabled={pending}
                        aria-busy={pending}
                        onClick={() => void onConfirm()}
                    >
                        {pending && (
                            <span
                                className="loading loading-spinner loading-sm"
                                aria-hidden="true"
                            />
                        )}
                        {t('common:buttons.remove')}
                    </button>
                </>
            }
        >
            <div className="flex flex-col gap-4 text-base">
                <p>{t('selection.removeMessage', { count: targets.length })}</p>
                <ul className="list-disc space-y-1 pl-6">
                    {targets.map((project) => (
                        <li className="break-words" key={project.path}>
                            {project.name}
                        </li>
                    ))}
                </ul>
                <p className="text-base-content/75">
                    {t('selection.removeDetail')}
                </p>
            </div>
        </Dialog>
    );
}
