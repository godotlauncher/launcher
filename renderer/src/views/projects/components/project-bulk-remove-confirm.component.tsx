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

/** Keeps removal context and actions visible while the reviewed names scroll.
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
            bodyClassName="flex flex-col gap-4 overflow-hidden"
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
            <div className="shrink-0 space-y-2">
                <p>{t('selection.removeMessage', { count: targets.length })}</p>
                <p className="text-base-content/75">
                    {t('selection.removeDetail')}
                </p>
            </div>
            <ul
                // biome-ignore lint/a11y/noNoninteractiveTabindex: The scrolling list needs keyboard access to review every project name.
                tabIndex={0}
                aria-label={t('selection.removeMessage', {
                    count: targets.length,
                })}
                className="min-h-0 list-disc space-y-1 overflow-y-auto overscroll-contain pl-6 pr-2 focus-visible:outline-2 focus-visible:outline-primary"
            >
                {targets.map((project) => (
                    <li className="break-words" key={project.path}>
                        {project.name}
                    </li>
                ))}
            </ul>
        </Dialog>
    );
}
