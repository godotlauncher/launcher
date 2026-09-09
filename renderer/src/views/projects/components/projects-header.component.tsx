import { ChevronDown } from 'lucide-react';
import type React from 'react';
import { CopyBadge } from '../../../components/ui/copy-badge.component';
import { SearchField } from '../../../components/ui/search-field.component';

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
    <div className="flex w-full shrink-0 flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                <h1
                    data-testid="projectsTitle"
                    className="pl-3 text-[20px] font-semibold"
                >
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
                <div className="flex shrink-0 items-center gap-2">
                    <button
                        type="button"
                        data-testid="btnProjectAdd"
                        onClick={onAddProject}
                        className="btn btn-ghost text-base"
                    >
                        {addLabel}
                        <ChevronDown
                            data-testid="iconProjectAddMenu"
                            size={16}
                            aria-hidden="true"
                        />
                    </button>
                    <button
                        type="button"
                        disabled={createDisabled}
                        data-testid="btnProjectCreate"
                        className="btn btn-primary text-base"
                        onClick={onCreateProject}
                    >
                        {createLabel}
                    </button>
                </div>
            )}
        </div>
        {showControls && (
            <div className="flex items-center justify-between gap-4">
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
                    data-testid="inputProjectSearch"
                />
            </div>
        )}
    </div>
);
