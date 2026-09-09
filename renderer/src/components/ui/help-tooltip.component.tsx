import { CircleHelp, type LucideIcon } from 'lucide-react';
import type React from 'react';
import { Tooltip } from './tooltip.component';

export type HelpTooltipProps = {
    help: string;
    content?: React.ReactNode;
    className?: string;
    icon?: LucideIcon;
};

/**
 * Renders the shared help icon with an accessible tooltip.
 * @param props - Help text and layout classes.
 */
export const HelpTooltip: React.FC<HelpTooltipProps> = ({
    help,
    content,
    className,
    icon: Icon = CircleHelp,
}) => (
    <Tooltip tip={content ?? help} tone="default" className={className}>
        <button
            type="button"
            aria-label={help}
            className="inline-flex shrink-0 items-center justify-center"
        >
            <Icon size={15} aria-hidden="true" />
        </button>
    </Tooltip>
);
