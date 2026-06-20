import type React from 'react';

type CreateProjectActionsProps = {
    error?: string;
    editNow: boolean;
    creating: boolean;
    createDisabled: boolean;
    editNowLabel: string;
    createLabel: string;
    onEditNowChange: (enabled: boolean) => void;
    onCreateProject: () => void;
};

export const CreateProjectActions: React.FC<CreateProjectActionsProps> = ({
    error,
    editNow,
    creating,
    createDisabled,
    editNowLabel,
    createLabel,
    onEditNowChange,
    onCreateProject,
}) => (
    <div className="flex flex-row justify-between items-center gap-4">
        <p className="text-error overflow-auto max-h-20 max-w-[70%] flex-1">
            {error}
        </p>
        <div className="flex gap-4 items-center">
            <label className="flex items-center ">
                <input
                    type="checkbox"
                    className="checkbox checkbox-primary"
                    checked={editNow}
                    onChange={(event) =>
                        onEditNowChange(event.currentTarget.checked)
                    }
                />
                <span className="ml-2">{editNowLabel}</span>
            </label>
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
