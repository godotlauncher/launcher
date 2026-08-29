import clsx from 'clsx';
import type React from 'react';
import { FormField } from './formField.component';

export type TextFieldProps = {
    id: string;
    label?: string;
    labelAction?: React.ReactNode;
    help?: string;
    ariaLabel?: string;
    testId?: string;
    inputRef?: React.Ref<HTMLInputElement>;
    title?: string;
    value: string;
    onChange: (value: string) => void;
    onBlur?: () => void;
    placeholder?: string;
    error?: string;
    disabled?: boolean;
    compact?: boolean;
    regularText?: boolean;
};

export const TextField: React.FC<TextFieldProps> = ({
    id,
    label,
    labelAction,
    help,
    ariaLabel,
    testId,
    inputRef,
    title,
    value,
    onChange,
    onBlur,
    placeholder,
    error,
    disabled = false,
    compact = false,
    regularText = false,
}) => (
    <FormField
        id={id}
        label={label}
        labelAction={labelAction}
        help={help}
        error={error}
        compact={compact}
        regularText={regularText}
    >
        <input
            ref={inputRef}
            id={id}
            data-testid={testId}
            type="text"
            className={clsx('input input-bordered w-full pr-8', {
                'input-sm': compact,
                'text-sm': regularText,
                'input-error': Boolean(error),
            })}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            placeholder={placeholder}
            aria-label={ariaLabel}
            title={title}
            disabled={disabled}
        />
    </FormField>
);
