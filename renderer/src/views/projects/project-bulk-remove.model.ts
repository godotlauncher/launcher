import type { ProjectDetails } from '@shared/contracts';
import { runProjectBatch } from './project-selection.model';

type RemovalOptions = {
    targets: ProjectDetails[];
    readProjects: () => Promise<ProjectDetails[]>;
    removeProject: (project: ProjectDetails) => Promise<ProjectDetails[]>;
    unavailable: string;
};

/** Removes only reviewed registrations, keeping each failure independent.
 * @param options - Captured targets and existing authoritative persistence APIs.
 */
export function runProjectRemoval({
    targets,
    readProjects,
    removeProject,
    unavailable,
}: RemovalOptions) {
    return runProjectBatch(targets, async (target) => {
        const projects = await readProjects();
        const current = projects.find(
            (project) => project.path === target.path,
        );
        if (
            !current ||
            current.added_at?.getTime() !== target.added_at?.getTime()
        )
            throw new Error(unavailable);
        const saved = await removeProject(current);
        if (saved.some((project) => project.path === target.path))
            throw new Error(unavailable);
    });
}
