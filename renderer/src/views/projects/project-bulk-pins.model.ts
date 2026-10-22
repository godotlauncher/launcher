import type { ProjectDetails } from '@shared/contracts';
import {
    getUniqueProjects,
    type ProjectBatchFailure,
    runProjectBatch,
} from './project-selection.model';
import { getProjectSections } from './projects-view.model';

export type ProjectPinBatch = {
    pinned: boolean;
    orderedTargets: ProjectDetails[];
    completed: ProjectDetails[];
    changed: ProjectDetails[];
    failures: ProjectBatchFailure[];
    orderError: string | null;
};
type PinBatchOptions = {
    state: ProjectPinBatch;
    targets: ProjectDetails[];
    readProjects: () => Promise<ProjectDetails[]>;
    setProjectPinned: (
        project: ProjectDetails,
        pinned: boolean,
    ) => Promise<ProjectDetails[]>;
    reorderPinnedProjects: (paths: string[]) => Promise<ProjectDetails[]>;
    unavailable: string;
};

/** Returns unique projects whose current pin state would change.
 * @param projects - Selected projects in display order.
 * @param pinned - Explicit desired pin state.
 */
export function getEligibleProjectPins(
    projects: readonly ProjectDetails[],
    pinned: boolean,
) {
    return getUniqueProjects(projects).filter(
        (project) => Boolean(project.pinned) !== pinned,
    );
}

/** Checks that a saved record is the original registered project.
 * @param project - Current saved project, if it still exists.
 * @param target - Project captured for the original operation.
 */
function isSameRegistration(
    project: ProjectDetails | undefined,
    target: ProjectDetails,
): project is ProjectDetails {
    return (
        project !== undefined &&
        project.path === target.path &&
        project.added_at?.getTime() === target.added_at?.getTime()
    );
}

/** Keeps this batch's new pins together and preserves all other pins' relative order.
 * @param projects - Complete current saved list, including filtered-out pins.
 * @param state - Original display order and targets actually changed by this batch.
 */
export function getProjectPinBatchOrder(
    projects: ProjectDetails[],
    state: ProjectPinBatch,
): string[] {
    const changed = new Set(state.changed.map((project) => project.path));
    const pinned = getProjectSections(projects, '').pinnedProjects;
    const group = state.orderedTargets
        .filter(
            (target) =>
                changed.has(target.path) &&
                pinned.some((project) => isSameRegistration(project, target)),
        )
        .map((project) => project.path);
    const grouped = new Set(group);
    return [
        ...group,
        ...pinned
            .filter((project) => !grouped.has(project.path))
            .map((project) => project.path),
    ];
}

/** Executes reviewed pin mutations and repairs order without repeating earlier successes.
 * @param options - Original operation state, failed subset and existing persistence APIs.
 */
export async function runProjectPinBatch({
    state,
    targets,
    readProjects,
    setProjectPinned,
    reorderPinnedProjects,
    unavailable,
}: PinBatchOptions): Promise<ProjectPinBatch> {
    const pending = state.pinned ? [...targets].reverse() : targets;
    const result = await runProjectBatch(pending, async (target) => {
        const current = await readProjects();
        const project = current.find(
            (candidate) => candidate.path === target.path,
        );
        if (!isSameRegistration(project, target)) throw new Error(unavailable);
        if (Boolean(project.pinned) === state.pinned)
            return { project: target, changed: false };
        const saved = await setProjectPinned(project, state.pinned);
        const updated = saved.find(
            (candidate) => candidate.path === target.path,
        );
        // The existing single-project API silently ignores removed paths.
        if (
            !isSameRegistration(updated, target) ||
            Boolean(updated.pinned) !== state.pinned
        )
            throw new Error(unavailable);
        return { project: target, changed: true };
    });
    const next: ProjectPinBatch = {
        ...state,
        completed: getUniqueProjects([
            ...state.completed,
            ...result.successes.map(({ value }) => value.project),
        ]),
        changed: getUniqueProjects([
            ...state.changed,
            ...result.successes
                .filter(({ value }) => value.changed)
                .map(({ value }) => value.project),
        ]),
        failures: result.failures,
        orderError: null,
    };
    if (state.pinned && next.changed.length) {
        try {
            const projects = await readProjects();
            const current = getProjectSections(projects, '').pinnedProjects.map(
                (project) => project.path,
            );
            const desired = getProjectPinBatchOrder(projects, next);
            if (current.some((path, index) => path !== desired[index]))
                await reorderPinnedProjects(desired);
        } catch (cause) {
            next.orderError =
                cause instanceof Error ? cause.message : String(cause);
        }
    }
    return next;
}
