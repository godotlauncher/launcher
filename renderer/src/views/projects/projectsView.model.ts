import type { ProjectDetails } from '@shared/contracts';

export type ProjectSections = {
    newProjects: ProjectDetails[];
    pinnedProjects: ProjectDetails[];
    recentProjects: ProjectDetails[];
};

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
            filteredProjects.filter((project) => !project.last_opened),
        ),
        pinnedProjects: sortByLastOpened(
            filteredProjects.filter((project) => project.pinned),
        ),
        recentProjects: sortByLastOpened(
            filteredProjects.filter((project) => project.last_opened),
        ),
    };
}
