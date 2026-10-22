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

    /** Selects a visible section, or clears it when all its projects are selected.
     * @param projects - Current visible projects belonging to the section.
     */
    const toggleSection = (projects: ProjectDetails[]) => {
        if (busy || !enabled) return;
        const shownPaths = new Set(shown.map((project) => project.path));
        const targets = getUniqueProjects(projects).filter((project) =>
            shownPaths.has(project.path),
        );
        if (!targets.length) return;
        const clear = targets.every((project) => paths.has(project.path));
        const next = new Set(paths);
        for (const project of targets) {
            if (clear) next.delete(project.path);
            else next.add(project.path);
        }
        setSelection({ filterKey, paths: next });
    };

    /** Drops targets hidden by completed tag edits when their popover closes. */
    const retainShown = () => {
        const visible = new Set(shown.map((project) => project.path));
        setSelection((current) => ({
            filterKey,
            paths: new Set(
                current.filterKey === filterKey
                    ? [...current.paths].filter((path) => visible.has(path))
                    : [],
            ),
        }));
    };

    /** Restores eligible failed removal targets after returning to Projects.
     * @param targets - Original failed registrations from the completed batch.
     */
    const restoreFailed = (targets: ProjectDetails[]) => {
        const eligible = shown.filter((project) =>
            targets.some(
                (target) =>
                    target.path === project.path &&
                    target.added_at?.getTime() === project.added_at?.getTime(),
            ),
        );
        if (!eligible.length) return;
        setEnabled(true);
        setSelection({
            filterKey,
            paths: new Set(eligible.map((project) => project.path)),
        });
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
        toggleSection,
        selectAll: () => select(shown),
        selectNew: () => select(shown.filter(canClearProjectNew)),
        clear: () => select([]),
        retainShown,
        restoreFailed,
    };
}
