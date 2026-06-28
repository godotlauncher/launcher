import type React from 'react';
import { CopyBadge } from '../../../components/ui/copyBadge.component';
import { SearchField } from '../../../components/ui/searchField.component';

type ProjectsHeaderProps = {
    title: string;
    projectsLocation?: string;
    searchPlaceholder: string;
    searchValue: string;
    onSearchChange: (value: string) => void;
    onAddProject: () => void;
    onCreateProject: () => void;
    createDisabled: boolean;
    addLabel: string;
    createLabel: string;
    copyPathLabel: string;
    copiedLabel: string;
};

export const ProjectsHeader: React.FC<ProjectsHeaderProps> = ({
    title,
    projectsLocation,
    searchPlaceholder,
    searchValue,
    onSearchChange,
    onAddProject,
    onCreateProject,
    createDisabled,
    addLabel,
    createLabel,
    copyPathLabel,
    copiedLabel,
}) => (
    <div className="flex flex-col gap-2 w-full">
        <div className="flex flex-row justify-between items-start">
            <div className="flex flex-col gap-1">
                <h1 data-testid="projectsTitle" className="text-2xl">
                    {title}
                </h1>
                {projectsLocation && (
                    <CopyBadge
                        value={projectsLocation}
                        label={copyPathLabel}
                        copiedLabel={copiedLabel}
                        data-testid="btnCopyProjectsLocation"
                    />
                )}
            </div>
            <div className="flex gap-2">
                <button
                    type="button"
                    data-testid="btnProjectAdd"
                    onClick={onAddProject}
                    className="btn btn-neutral"
                >
                    {addLabel}
                </button>
                <button
                    type="button"
                    disabled={createDisabled}
                    data-testid="btnProjectCreate"
                    className="btn btn-primary"
                    onClick={onCreateProject}
                >
                    {createLabel}
                </button>
            </div>
        </div>
        <div className="flex flex-row justify-end my-2 items-center">
            <SearchField
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={onSearchChange}
            />
        </div>
    </div>
);
