import type { ExportTemplateSet } from '@shared/contracts';
import { useTranslation } from 'react-i18next';
import { Dialog } from '../../../components/dialog.component';
import { formatTemplateBytes } from '../template-format.util';

type TemplateRemoveDialogProps = {
    remove: ExportTemplateSet;
    pending: boolean;
    onClose: () => void;
    onRemove: (setId: string) => void;
};
/** Requires a fresh confirmation before removing a shared set.
 * @param props - Selected set, operation availability and dialog actions.
 */
export function TemplateRemoveDialog({
    remove,
    pending,
    onClose,
    onRemove,
}: TemplateRemoveDialogProps) {
    const { t, i18n } = useTranslation('exportTemplates');
    /** Formats the selected set size.
     * @param value - Installed bytes.
     */
    const bytes = (value: number) => formatTemplateBytes(value, i18n.language);
    return (
        <Dialog
            tone="warning"
            title={`${t('remove')} ${remove.id}`}
            onRequestClose={() => {
                if (!pending) onClose();
            }}
            footer={
                <>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={pending}
                        onClick={() => onClose()}
                    >
                        {t('cancel')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-error"
                        disabled={pending}
                        onClick={() => {
                            onRemove(remove.id);
                        }}
                    >
                        {t('remove')}
                    </button>
                </>
            }
        >
            <div className="space-y-4">
                <p>
                    {t('removeDetail', {
                        size: bytes(remove.sizeBytes),
                    })}
                </p>
                <p>{t('usage', { number: remove.projects.length })}</p>
                {!!remove.projects.length && (
                    <p>{remove.projects.join(', ')}</p>
                )}
            </div>
        </Dialog>
    );
}
