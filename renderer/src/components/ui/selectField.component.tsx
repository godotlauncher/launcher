import clsx from 'clsx';
import type React from 'react';
import { FormField } from './formField.component';

export type SelectFieldProps = {
    id: string;
    label: string;
    help: string;
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    options: Array<[string, string]>;
    error?: string;
    compact?: boolean;
};

export const SelectField: React.FC<SelectFieldProps> = ({
    id,
    label,
    help,
    value,
    onChange,
    onBlur,
    options,
    error,
    compact = false,
}) => (
    <FormField
        id={id}
        label={label}
        help={help}
        error={error}
        compact={compact}
    >
        <select
            id={id}
            className={clsx('select select-bordered w-full', {
                'select-sm': compact,
                'select-error': Boolean(error),
            })}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
        >
            {options.map(([optionValue, optionLabel]) => (
                <option key={optionValue} value={optionValue}>
                    {optionLabel}
                </option>
            ))}
        </select>
    </FormField>
);
