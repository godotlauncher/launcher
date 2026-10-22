import type { ProjectDetails } from '@shared/contracts';

export type ProjectBatchFailure = {
    project: ProjectDetails;
    error: string;
};

export type ProjectBatchResult<T> = {
    successes: { project: ProjectDetails; value: T }[];
    failures: ProjectBatchFailure[];
};

/** Checks that a saved record is the original registered project.
 * @param project - Current saved project, if it still exists.
 * @param target - Project captured for the original operation.
 */
export function isSameProjectRegistration(
    project: ProjectDetails | undefined,
    target: ProjectDetails,
): project is ProjectDetails {
    return (
        project !== undefined &&
        project.path === target.path &&
        project.added_at?.getTime() === target.added_at?.getTime()
    );
}

/** Returns one canonical record per selected project path.
 * @param projects - Available project records in display order.
 * @param paths - Optional selected paths; omitted means every project.
 */
export function getUniqueProjects(
    projects: readonly ProjectDetails[],
    paths?: ReadonlySet<string>,
): ProjectDetails[] {
    return [
        ...new Map(
            projects
                .filter((project) => !paths || paths.has(project.path))
                .map((project) => [project.path, project]),
        ).values(),
    ];
}

/** Checks the same New eligibility used by individual project actions.
 * @param project - Current registered project.
 */
export function canClearProjectNew(project: ProjectDetails): boolean {
    return project.is_new === true && !project.last_opened;
}

/** Runs independent project mutations once per path without losing partial results.
 * @param projects - Reviewed targets for this operation.
 * @param action - Mutation that returns a saved result or rejects.
 */
export async function runProjectBatch<T>(
    projects: readonly ProjectDetails[],
    action: (project: ProjectDetails) => Promise<T>,
): Promise<ProjectBatchResult<T>> {
    const result: ProjectBatchResult<T> = { successes: [], failures: [] };
    for (const project of getUniqueProjects(projects)) {
        try {
            result.successes.push({ project, value: await action(project) });
        } catch (cause) {
            result.failures.push({
                project,
                error: cause instanceof Error ? cause.message : String(cause),
            });
        }
    }
    return result;
}
