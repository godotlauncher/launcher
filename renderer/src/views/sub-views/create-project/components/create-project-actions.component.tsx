import type React from 'react';
import type { Ref } from 'react';

type CreateProjectActionsProps = {
    editNow: boolean;
    creating: boolean;
    createDisabled: boolean;
    editNowLabel: string;
    cancelLabel: string;
    createLabel: string;
    onEditNowChange: (enabled: boolean) => void;
    onCancel: () => void;
    onCreateProject: () => void;
    createButtonRef: Ref<HTMLButtonElement>;
};

/**
 * Renders the Create Project drawer actions.
 *
 * @param props - Action state, callbacks, labels, and Create button ref.
 * @returns The Create Project actions.
 */
export const CreateProjectActions: React.FC<CreateProjectActionsProps> = ({
    editNow,
    creating,
    createDisabled,
    editNowLabel,
    cancelLabel,
    createLabel,
    onEditNowChange,
    onCancel,
    onCreateProject,
    createButtonRef,
}) => (
    <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <label className="flex items-center gap-2 text-base">
            <input
                type="checkbox"
                className="checkbox checkbox-sm shrink-0"
                checked={editNow}
                disabled={creating}
                onChange={(event) =>
                    onEditNowChange(event.currentTarget.checked)
                }
            />
            <span>{editNowLabel}</span>
        </label>
        <div className="flex flex-wrap gap-2 items-center">
            <button
                type="button"
                disabled={creating}
                onClick={onCancel}
                className="btn btn-ghost text-base"
            >
                {cancelLabel}
            </button>
            <button
                type="button"
                disabled={creating || createDisabled}
                ref={createButtonRef}
                data-testid="btnCreateProject"
                onClick={onCreateProject}
                className="btn btn-primary text-base"
            >
                {createLabel}
            </button>
        </div>
    </div>
);
