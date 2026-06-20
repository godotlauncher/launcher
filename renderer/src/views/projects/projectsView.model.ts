import type { ProjectDetails } from '@shared';

export type ProjectSortData = {
    field: string;
    order: 'asc' | 'desc';
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

export function sortProjects(
    projects: ProjectDetails[],
    sortData: ProjectSortData,
): ProjectDetails[] {
    return [...projects].sort((a, b) => {
        if (sortData.field === 'name') {
            return sortData.order === 'asc'
                ? a.name.localeCompare(b.name)
                : b.name.localeCompare(a.name);
        }

        if (sortData.field === 'modified') {
            const left = a.last_opened?.getTime() || 0;
            const right = b.last_opened?.getTime() || 0;

            return sortData.order === 'asc' ? left - right : right - left;
        }

        return 0;
    });
}

export function filterAndSortProjects(
    projects: ProjectDetails[],
    textSearch: string,
    sortData: ProjectSortData,
): ProjectDetails[] {
    const normalizedSearch = textSearch.toLowerCase();
    const filteredProjects =
        normalizedSearch.length === 0
            ? projects
            : projects.filter((project) =>
                  project.name.toLowerCase().includes(normalizedSearch),
              );

    return sortProjects(filteredProjects, sortData);
}
