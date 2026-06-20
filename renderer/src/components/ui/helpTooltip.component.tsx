import clsx from 'clsx';
import { CircleHelp } from 'lucide-react';
import type React from 'react';

export type HelpTooltipProps = {
    help: string;
    className?: string;
};

export const HelpTooltip: React.FC<HelpTooltipProps> = ({
    help,
    className,
}) => (
    <span
        className={clsx(
            'tooltip tooltip-right relative z-20 text-info hover:z-50 focus-within:z-50',
            className,
        )}
        data-tip={help}
        role="img"
        aria-label={help}
    >
        <CircleHelp size={15} aria-hidden="true" />
    </span>
);
