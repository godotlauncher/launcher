import { useEffect, useState } from 'react';
import type { ProjectSortData } from '../projectsView.model';

const projectsSortStorageKey = 'projectsSortData';
const defaultProjectsSortData: ProjectSortData = {
    field: 'modified',
    order: 'desc',
};

export function useProjectsSort(): [
    ProjectSortData,
    (sortData: ProjectSortData) => void,
] {
    const [sortData, setSortData] = useState<ProjectSortData>(() => {
        const saved = localStorage.getItem(projectsSortStorageKey);
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch {
                return defaultProjectsSortData;
            }
        }

        return defaultProjectsSortData;
    });

    useEffect(() => {
        localStorage.setItem(projectsSortStorageKey, JSON.stringify(sortData));
    }, [sortData]);

    return [sortData, setSortData];
}
