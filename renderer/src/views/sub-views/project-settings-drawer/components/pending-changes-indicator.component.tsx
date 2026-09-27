import { useTranslation } from 'react-i18next';
import { Tooltip } from '../../../../components/ui/tooltip.component';

/** Shows an accessible indicator for an unsaved field or section. */
export function PendingChangesIndicator() {
    const { t } = useTranslation('exportTemplates');
    const label = t('project.pending');
    return (
        <Tooltip
            tip={label}
            placement="top"
            role="img"
            ariaLabel={label}
            className="inline-flex shrink-0 items-center"
        >
            <span
                className="size-2 rounded-full bg-warning"
                aria-hidden="true"
            />
        </Tooltip>
    );
}
