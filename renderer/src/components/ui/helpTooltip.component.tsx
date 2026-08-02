import clsx from 'clsx';
import { CircleHelp } from 'lucide-react';
import type React from 'react';
import { Tooltip } from './tooltip.component';

export type HelpTooltipProps = {
    help: string;
    className?: string;
};

export const HelpTooltip: React.FC<HelpTooltipProps> = ({
    help,
    className,
}) => (
    <Tooltip
        tip={help}
        tone="info"
        className={clsx('text-info', className)}
        role="img"
        ariaLabel={help}
    >
        <CircleHelp size={15} aria-hidden="true" />
    </Tooltip>
);
