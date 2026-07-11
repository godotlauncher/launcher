import clsx from 'clsx';
import type React from 'react';
import { FormField } from './formField.component';

export type TextFieldProps = {
    id: string;
    label: string;
    help: string;
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    placeholder?: string;
    error?: string;
    compact?: boolean;
};

export const TextField: React.FC<TextFieldProps> = ({
    id,
    label,
    help,
    value,
    onChange,
    onBlur,
    placeholder,
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
        <input
            id={id}
            type="text"
            className={clsx('input input-bordered w-full pr-8', {
                'input-sm': compact,
                'input-error': Boolean(error),
            })}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            placeholder={placeholder}
        />
    </FormField>
);
