import { ChevronDown } from 'lucide-react';
import type React from 'react';
import { CopyBadge } from '../../../components/ui/copyBadge.component';
import { SearchField } from '../../../components/ui/searchField.component';

import type { ProjectViewMode } from '../project-view.types';
import { ProjectViewToggle } from './project-view-toggle.component';

type ProjectsHeaderProps = {
    viewMode: ProjectViewMode;
    viewModeDisabled?: boolean;
    onViewModeChange: (mode: ProjectViewMode) => void;
    cardsViewLabel: string;
    listViewLabel: string;
    title: string;
    projectsLocation?: string;
    searchPlaceholder: string;
    searchValue: string;
    onSearchChange: (value: string) => void;
    onAddProject: React.MouseEventHandler<HTMLButtonElement>;
    onCreateProject: () => void;
    createDisabled: boolean;
    addLabel: string;
    createLabel: string;
    copyPathLabel: string;
    copiedLabel: string;
    showControls?: boolean;
};

/**
 * Renders the projects title, location, and optional list controls.
 *
 * @param props - Header content, control visibility, and actions.
 * @returns The projects header.
 */
export const ProjectsHeader: React.FC<ProjectsHeaderProps> = ({
    viewMode,
    viewModeDisabled,
    onViewModeChange,
    cardsViewLabel,
    listViewLabel,
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
    showControls = true,
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
            {showControls && (
                <div className="flex gap-2">
                    <button
                        type="button"
                        data-testid="btnProjectAdd"
                        onClick={onAddProject}
                        className="btn btn-neutral"
                    >
                        {addLabel}
                        <ChevronDown
                            data-testid="iconProjectAddMenu"
                            size={14}
                            aria-hidden="true"
                        />
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
            )}
        </div>
        {showControls && (
            <div className="flex flex-row justify-between gap-4 mt-2 items-center">
                <ProjectViewToggle
                    disabled={viewModeDisabled}
                    mode={viewMode}
                    onChange={onViewModeChange}
                    cardsLabel={cardsViewLabel}
                    listLabel={listViewLabel}
                />
                <SearchField
                    placeholder={searchPlaceholder}
                    value={searchValue}
                    onChange={onSearchChange}
                    focusOnMount
                    compact
                    data-testid="inputProjectSearch"
                />
            </div>
        )}
    </div>
);
