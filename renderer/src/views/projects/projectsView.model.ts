import type { ProjectDetails } from '@shared/contracts';

export type ProjectSections = {
    newProjects: ProjectDetails[];
    pinnedProjects: ProjectDetails[];
    recentProjects: ProjectDetails[];
};

export type ProjectsViewState =
    | 'loading'
    | 'empty-without-editor'
    | 'empty-installing-editor'
    | 'empty-with-editor'
    | 'list';

type GetProjectsViewStateOptions = {
    projectCount: number;
    installedReleaseCount: number;
    downloadingReleaseCount: number;
    textSearch: string;
    projectsLoading: boolean;
    releasesLoading: boolean;
    releasesInitialized: boolean;
};

/**
 * Selects the projects content while keeping filtered and loading states
 * separate from the first-project experience.
 *
 * @param options - Project, editor, search, and loading state.
 * @returns The projects content state to render.
 */
export function getProjectsViewState({
    projectCount,
    installedReleaseCount,
    downloadingReleaseCount,
    textSearch,
    projectsLoading,
    releasesLoading,
    releasesInitialized,
}: GetProjectsViewStateOptions): ProjectsViewState {
    if (projectsLoading || (releasesLoading && !releasesInitialized)) {
        return 'loading';
    }

    if (projectCount > 0 || textSearch.trim().length > 0) {
        return 'list';
    }

    if (installedReleaseCount > 0) {
        return 'empty-with-editor';
    }

    return downloadingReleaseCount > 0
        ? 'empty-installing-editor'
        : 'empty-without-editor';
}

export function getInvalidProjectTableKey(project: ProjectDetails): string {
    switch (project.invalid_reason) {
        case 'missing_project_file':
            return 'table.invalidReasons.missingProjectFile';
        case 'missing_editor':
            return 'table.invalidReasons.missingEditor';
        default:
            return 'table.invalidProject';
    }
}

export function getInvalidProjectMessageKey(project: ProjectDetails): string {
    switch (project.invalid_reason) {
        case 'missing_project_file':
            return 'messages.invalidReasons.missingProjectFile';
        case 'missing_editor':
            return 'messages.invalidReasons.missingEditor';
        default:
            return 'messages.projectNotValid';
    }
}

function sortByLastAdded(projects: ProjectDetails[]): ProjectDetails[] {
    return [...projects].sort((a, b) => {
        const dateDifference =
            (b.added_at?.getTime() ?? 0) - (a.added_at?.getTime() ?? 0);

        return dateDifference || a.name.localeCompare(b.name);
    });
}

function sortByLastOpened(projects: ProjectDetails[]): ProjectDetails[] {
    return [...projects].sort((a, b) => {
        const dateDifference =
            (b.last_opened?.getTime() ?? 0) - (a.last_opened?.getTime() ?? 0);

        return dateDifference || a.name.localeCompare(b.name);
    });
}

function isValidPinnedOrder(value: number | undefined): value is number {
    return value !== undefined && Number.isInteger(value) && value >= 0;
}

function sortPinnedProjects(projects: ProjectDetails[]): ProjectDetails[] {
    return [...projects].sort((a, b) => {
        const aOrder = isValidPinnedOrder(a.pinned_order)
            ? a.pinned_order
            : undefined;
        const bOrder = isValidPinnedOrder(b.pinned_order)
            ? b.pinned_order
            : undefined;
        const aHasOrder = aOrder !== undefined;
        const bHasOrder = bOrder !== undefined;

        if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) {
            return aOrder - bOrder;
        }
        if (aHasOrder !== bHasOrder) {
            return aHasOrder ? -1 : 1;
        }

        const dateDifference =
            (b.last_opened?.getTime() ?? 0) - (a.last_opened?.getTime() ?? 0);

        return dateDifference || a.name.localeCompare(b.name);
    });
}

export function getProjectSections(
    projects: ProjectDetails[],
    textSearch: string,
): ProjectSections {
    const normalizedSearch = textSearch.trim().toLocaleLowerCase();
    const filteredProjects =
        normalizedSearch.length === 0
            ? projects
            : projects.filter((project) =>
                  project.name.toLocaleLowerCase().includes(normalizedSearch),
              );

    return {
        newProjects: sortByLastAdded(
            filteredProjects.filter(
                (project) => !project.pinned && !project.last_opened,
            ),
        ),
        pinnedProjects: sortPinnedProjects(
            filteredProjects.filter((project) => project.pinned),
        ),
        recentProjects: sortByLastOpened(
            filteredProjects.filter(
                (project) => !project.pinned && project.last_opened,
            ),
        ),
    };
}
