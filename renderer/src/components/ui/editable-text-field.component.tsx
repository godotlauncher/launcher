import clsx from 'clsx';
import { Check, Pencil, X } from 'lucide-react';
import type React from 'react';

export type EditableTextFieldProps = {
    value: string;
    draft: string;
    editing: boolean;
    ariaLabel: string;
    editLabel: string;
    saveLabel: string;
    cancelLabel: string;
    placeholder?: string;
    maxLength?: number;
    disabled?: boolean;
    invalid?: boolean;
    className?: string;
    onEdit: () => void;
    onDraftChange: (value: string) => void;
    onSave: () => void;
    onCancel: () => void;
};

/**
 * Renders a controlled text value with inline edit, save and cancel actions.
 *
 * @param props - Display value, edit state, accessible labels and change callbacks.
 * @returns The display value or its active inline editor.
 */
export const EditableTextField: React.FC<EditableTextFieldProps> = ({
    value,
    draft,
    editing,
    ariaLabel,
    editLabel,
    saveLabel,
    cancelLabel,
    placeholder = '',
    maxLength,
    disabled = false,
    invalid = false,
    className,
    onEdit,
    onDraftChange,
    onSave,
    onCancel,
}) => (
    <div className={clsx('flex min-w-0 items-center gap-1', className)}>
        {editing ? (
            <>
                <input
                    className={clsx(
                        'input input-sm min-w-0 flex-1 text-base',
                        invalid && 'input-error',
                    )}
                    aria-label={ariaLabel}
                    aria-invalid={invalid}
                    maxLength={maxLength}
                    value={draft}
                    ref={(input) => input?.focus()}
                    onChange={(event) => onDraftChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            onSave();
                        } else if (event.key === 'Escape') {
                            event.preventDefault();
                            event.stopPropagation();
                            onCancel();
                        }
                    }}
                />
                <button
                    type="button"
                    className="btn btn-sm btn-ghost btn-square text-success hover:bg-success/10"
                    aria-label={saveLabel}
                    onClick={onSave}
                >
                    <Check size={16} aria-hidden="true" />
                </button>
                <button
                    type="button"
                    className="btn btn-sm btn-ghost btn-square text-error hover:bg-error/10"
                    aria-label={cancelLabel}
                    onClick={onCancel}
                >
                    <X size={16} aria-hidden="true" />
                </button>
            </>
        ) : (
            <>
                <span
                    className={clsx('truncate text-base font-semibold', {
                        'text-error': invalid,
                        'opacity-50': disabled,
                    })}
                    title={value}
                >
                    {value || placeholder}
                </span>
                <button
                    type="button"
                    className="btn btn-sm btn-ghost btn-square shrink-0"
                    disabled={disabled}
                    aria-label={editLabel}
                    onClick={onEdit}
                >
                    <Pencil size={16} aria-hidden="true" />
                </button>
            </>
        )}
    </div>
);
