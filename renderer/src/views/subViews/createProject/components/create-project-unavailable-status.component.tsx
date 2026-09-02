import { TriangleAlert } from 'lucide-react';
import type React from 'react';
import { TooltipIconButton } from '../../../../components/ui/tooltip-icon-button.component';

type CreateProjectUnavailableStatusProps = {
    label: string;
    help: string;
};

/**
 * Renders compact inline availability guidance for a disabled Create Project option.
 *
 * @param props - Short status label and detailed recovery guidance.
 * @returns An inline warning status with an accessible tooltip.
 */
export const CreateProjectUnavailableStatus: React.FC<
    CreateProjectUnavailableStatusProps
> = ({ label, help }) => (
    <span className="inline-flex items-center gap-0.5 text-sm text-warning">
        <span>{label}</span>
        <TooltipIconButton
            label={help}
            tip={help}
            placement="bottom"
            delay={150}
            className="text-warning hover:text-warning"
        >
            <TriangleAlert className="size-4" aria-hidden="true" />
        </TooltipIconButton>
    </span>
);
