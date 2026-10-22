import type { ProjectDetails } from '@shared/contracts';
import { useEffect, useState } from 'react';
import {
    canClearProjectNew,
    getUniqueProjects,
} from '../project-selection.model';

type ProjectSelectionOptions = {
    projects: ProjectDetails[];
    shownProjects: ProjectDetails[];
    filterKey: string;
    busy: boolean;
};

/** Keeps temporary selection across presentation changes, pruning removed records.
 * @param options - Canonical projects, current filtered display and pending state.
 */
export function useProjectSelection({
    projects,
    shownProjects,
    filterKey,
    busy,
}: ProjectSelectionOptions) {
    const [enabled, setEnabled] = useState(false);
    const [selection, setSelection] = useState({
        filterKey,
        paths: new Set<string>(),
    });
    const selectedPaths =
        selection.filterKey === filterKey ? selection.paths : new Set<string>();
    const selectedProjects = getUniqueProjects(projects, selectedPaths);
    const paths = new Set(selectedProjects.map((project) => project.path));
    const shown = getUniqueProjects(shownProjects);

    useEffect(() => {
        setSelection((current) => {
            if (current.filterKey !== filterKey)
                return { filterKey, paths: new Set() };
            const registered = new Set(projects.map((project) => project.path));
            if ([...current.paths].every((path) => registered.has(path)))
                return current;
            return {
                filterKey,
                paths: new Set(
                    [...current.paths].filter((path) => registered.has(path)),
                ),
            };
        });
    }, [projects, filterKey]);

    /** Replaces the selection without leaving selection mode.
     * @param targets - Visible projects to select.
     */
    const select = (targets: ProjectDetails[]) => {
        if (!busy)
            setSelection({
                filterKey,
                paths: new Set(targets.map((project) => project.path)),
            });
    };
    /** Toggles mode and discards the previous temporary selection. */
    const toggleEnabled = () => {
        if (busy) return;
        setEnabled((current) => !current);
        select([]);
    };
    /** Toggles one current visible project.
     * @param project - Project whose checkbox was activated.
     */
    const toggleProject = (project: ProjectDetails) => {
        if (
            busy ||
            !enabled ||
            !shown.some((item) => item.path === project.path)
        )
            return;
        const next = new Set(paths);
        if (next.has(project.path)) next.delete(project.path);
        else next.add(project.path);
        setSelection({ filterKey, paths: next });
    };

    return {
        enabled,
        selectedPaths: paths,
        selectedProjects,
        shownCount: shown.length,
        newCount: shown.filter(canClearProjectNew).length,
        eligibleNew: selectedProjects.filter(canClearProjectNew),
        toggleEnabled,
        toggleProject,
        selectAll: () => select(shown),
        selectNew: () => select(shown.filter(canClearProjectNew)),
        clear: () => select([]),
    };
}
