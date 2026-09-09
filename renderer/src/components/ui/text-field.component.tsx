import clsx from 'clsx';
import type React from 'react';
import { FormField } from './form-field.component';

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
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
    placeholder?: string;
    error?: string;
    disabled?: boolean;
    type?: 'text' | 'url';
};

/**
 * Renders a controlled text-like input using the shared field presentation.
 *
 * @param props - Input content, state, interaction callbacks, and presentation.
 * @returns A reusable text or URL form field.
 */
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
    onKeyDown,
    placeholder,
    error,
    disabled = false,
    type = 'text',
}) => (
    <FormField
        id={id}
        label={label}
        labelAction={labelAction}
        help={help}
        error={error}
    >
        <input
            ref={inputRef}
            id={id}
            data-testid={testId}
            type={type}
            className={clsx('input input-sm w-full pr-8 text-base', {
                'input-error': Boolean(error),
            })}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label={ariaLabel}
            title={title}
            disabled={disabled}
        />
    </FormField>
);
