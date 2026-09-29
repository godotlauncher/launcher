import { TriangleAlert } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Tooltip } from '../../../components/ui/tooltip.component';

type ProjectStatusTooltipProps = Omit<
    ComponentProps<typeof Tooltip>,
    'tip' | 'tone' | 'variant'
> & {
    tip: string;
    warning?: boolean;
};

/**
 * Shows project warnings in a neutral panel with a warning icon.
 * @param props - Status message, warning state, trigger and tooltip options.
 */
export function ProjectStatusTooltip({
    tip,
    warning = false,
    delay = warning ? 1000 : undefined,
    ...props
}: ProjectStatusTooltipProps) {
    return (
        <Tooltip
            {...props}
            delay={delay}
            variant={warning ? 'panel' : 'default'}
            tip={
                warning ? (
                    <div className="flex items-start gap-2 text-left">
                        <TriangleAlert
                            className="mt-0.5 size-4 shrink-0 text-warning"
                            aria-hidden="true"
                        />
                        <span>{tip}</span>
                    </div>
                ) : (
                    tip
                )
            }
        />
    );
}
