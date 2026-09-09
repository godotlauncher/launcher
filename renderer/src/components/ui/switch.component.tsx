import clsx from 'clsx';
import type { ComponentPropsWithoutRef } from 'react';

export type SwitchProps = Omit<
    ComponentPropsWithoutRef<'input'>,
    'type' | 'className' | 'checked' | 'defaultChecked'
> & {
    checked: boolean;
};

/**
 * Renders a small switch with primary on and muted neutral off styling.
 * @param props - Checked state, accessible labelling and native input handlers.
 * @returns A styled checkbox retaining native keyboard and disabled behaviour.
 */
export function Switch({ checked, ...props }: SwitchProps) {
    return (
        <input
            {...props}
            type="checkbox"
            checked={checked}
            className={clsx(
                'toggle toggle-sm shrink-0',
                checked ? 'toggle-primary' : 'text-base-content/50',
            )}
        />
    );
}
