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
        <label className="flex items-center">
            <input
                type="checkbox"
                className="checkbox checkbox-primary"
                checked={editNow}
                disabled={creating}
                onChange={(event) =>
                    onEditNowChange(event.currentTarget.checked)
                }
            />
            <span className="ml-2">{editNowLabel}</span>
        </label>
        <div className="flex gap-4 items-center">
            <button
                ref={createButtonRef}
                type="button"
                disabled={creating}
                onClick={onCancel}
                className="btn btn-ghost"
            >
                {cancelLabel}
            </button>
            <button
                type="button"
                disabled={creating || createDisabled}
                data-testid="btnCreateProject"
                onClick={onCreateProject}
                className="btn btn-primary "
            >
                {createLabel}
            </button>
        </div>
    </div>
);
