import { TriangleAlert } from 'lucide-react';
import type React from 'react';
import { HelpTooltip } from '../../../../components/ui/help-tooltip.component';
import { StatusBadge } from '../../../../components/ui/status-badge.component';

type CreateProjectUnavailableStatusProps = {
    label: string;
    help: string;
};

/**
 * Renders inline availability guidance for a disabled Create Project option.
 *
 * @param props - Short status label and detailed recovery guidance.
 * @returns An inline warning status with an accessible tooltip.
 */
export const CreateProjectUnavailableStatus: React.FC<
    CreateProjectUnavailableStatusProps
> = ({ label, help }) => (
    <span className="inline-flex items-center gap-1">
        <StatusBadge tone="warning">{label}</StatusBadge>
        <HelpTooltip
            help={help}
            icon={TriangleAlert}
            className="text-warning"
        />
    </span>
);
