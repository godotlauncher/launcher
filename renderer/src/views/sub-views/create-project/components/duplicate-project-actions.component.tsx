import { ArrowRight } from 'lucide-react';
import type React from 'react';

type DuplicateProjectActionsProps = {
    step: 1 | 2;
    busy: boolean;
    continueDisabled: boolean;
    createDisabled: boolean;
    editNow: boolean;
    continueLabel: string;
    backLabel: string;
    cancelLabel: string;
    openInGodotLabel: string;
    createLabel: string;
    onContinue: () => void;
    onBack: () => void;
    onCancel: () => void;
    onEditNowChange: (enabled: boolean) => void;
    onCreate: () => void;
    createButtonRef: React.RefObject<HTMLButtonElement | null>;
};

/** Keeps navigation separate from the final creation action.
 * @param props - Step navigation, creation state and translated action labels.
 */
export const DuplicateProjectActions: React.FC<
    DuplicateProjectActionsProps
> = ({
    step,
    busy,
    continueDisabled,
    createDisabled,
    editNow,
    continueLabel,
    backLabel,
    cancelLabel,
    openInGodotLabel,
    createLabel,
    onContinue,
    onBack,
    onCancel,
    onEditNowChange,
    onCreate,
    createButtonRef,
}) => (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
        {step === 1 ? (
            <>
                <button
                    type="button"
                    className="btn btn-ghost text-base"
                    disabled={busy}
                    onClick={onCancel}
                >
                    {cancelLabel}
                </button>
                <button
                    type="button"
                    className="btn btn-primary text-base"
                    data-testid="btnContinueDuplicate"
                    disabled={busy || continueDisabled}
                    onClick={onContinue}
                >
                    {continueLabel}
                    <ArrowRight size={16} aria-hidden="true" />
                </button>
            </>
        ) : (
            <>
                <div className="flex flex-wrap items-center gap-4">
                    <button
                        type="button"
                        className="btn btn-ghost text-base"
                        disabled={busy}
                        onClick={onBack}
                    >
                        {backLabel}
                    </button>
                    <label className="flex items-center gap-2 text-base">
                        <input
                            type="checkbox"
                            className="checkbox checkbox-sm shrink-0"
                            checked={editNow}
                            disabled={busy}
                            onChange={(event) =>
                                onEditNowChange(event.target.checked)
                            }
                        />
                        <span>{openInGodotLabel}</span>
                    </label>
                </div>
                <button
                    type="button"
                    className="btn btn-primary text-base"
                    ref={createButtonRef}
                    data-testid="btnCreateProject"
                    disabled={busy || createDisabled}
                    onClick={onCreate}
                >
                    {createLabel}
                </button>
            </>
        )}
    </div>
);
