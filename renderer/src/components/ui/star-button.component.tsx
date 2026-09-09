import { Star } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';

export type StarButtonProps = Omit<
    ComponentPropsWithoutRef<'button'>,
    'children' | 'className' | 'type' | 'aria-pressed' | 'aria-label'
> & {
    selected: boolean;
    'aria-label': string;
};

/**
 * Renders a favourite or default action with a primary filled selected star.
 * @param props - Selected state, accessible label and native button handlers.
 * @returns A small ghost button exposing its pressed state.
 */
export function StarButton({ selected, ...props }: StarButtonProps) {
    return (
        <button
            {...props}
            type="button"
            className="btn btn-sm btn-square btn-ghost"
            aria-pressed={selected}
        >
            <Star
                size={16}
                className={selected ? 'fill-current text-primary' : undefined}
                aria-hidden="true"
            />
        </button>
    );
}
