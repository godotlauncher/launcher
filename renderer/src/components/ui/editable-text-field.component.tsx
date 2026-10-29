import clsx from 'clsx';
import { Check, type LucideIcon, Pencil, X } from 'lucide-react';
import type React from 'react';
import { useCallback } from 'react';

export type EditableTextFieldProps = {
    value: string;
    draft: string;
    editing: boolean;
    showActions?: boolean;
    leadingIcon?: LucideIcon;
    inputClassName?: string;
    ariaLabel: string;
    ariaDescribedBy?: string;
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
    showActions = true,
    leadingIcon: LeadingIcon,
    inputClassName,
    ariaLabel,
    ariaDescribedBy,
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
}) => {
    const focusInput = useCallback(
        (input: HTMLInputElement | null) => input?.focus(),
        [],
    );
    return (
        <div className={clsx('flex min-w-0 items-center gap-1', className)}>
            {editing ? (
                <>
                    <div
                        className={clsx(
                            'flex min-w-0 flex-1',
                            LeadingIcon && 'join',
                        )}
                    >
                        {LeadingIcon && (
                            <span
                                aria-hidden="true"
                                className="join-item flex shrink-0 items-center border border-base-content/20 bg-base-200 px-2 text-base-content/35"
                            >
                                <LeadingIcon size={16} />
                            </span>
                        )}
                        <input
                            className={clsx(
                                'input input-sm min-w-0 flex-1 text-base',
                                invalid && 'input-error',
                                LeadingIcon && 'join-item',
                                inputClassName,
                            )}
                            aria-label={ariaLabel}
                            aria-describedby={ariaDescribedBy}
                            aria-invalid={invalid}
                            disabled={disabled}
                            maxLength={maxLength}
                            value={draft}
                            ref={focusInput}
                            onChange={(event) =>
                                onDraftChange(event.target.value)
                            }
                            onKeyDown={(event) => {
                                if (disabled) return;
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
                    </div>
                    {showActions && (
                        <>
                            <button
                                type="button"
                                className="btn btn-sm btn-ghost btn-square text-success hover:bg-success/10"
                                disabled={disabled}
                                aria-label={saveLabel}
                                onClick={onSave}
                            >
                                <Check size={16} aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                className="btn btn-sm btn-ghost btn-square text-error hover:bg-error/10"
                                disabled={disabled}
                                aria-label={cancelLabel}
                                onClick={onCancel}
                            >
                                <X size={16} aria-hidden="true" />
                            </button>
                        </>
                    )}
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
                        aria-describedby={ariaDescribedBy}
                        onClick={onEdit}
                    >
                        <Pencil size={16} aria-hidden="true" />
                    </button>
                </>
            )}
        </div>
    );
};
