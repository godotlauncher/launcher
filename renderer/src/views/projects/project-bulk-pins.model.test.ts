import type { ProjectDetails } from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
    getEligibleProjectPins,
    getProjectPinBatchOrder,
    type ProjectPinBatch,
    runProjectPinBatch,
} from './project-bulk-pins.model';
import { getProjectSections } from './projects-view.model';

/** Creates a project with stable identity and unrelated metadata.
 * @param name - Project name and fixture path.
 * @param fields - Saved state overrides.
 */
const project = (name: string, fields: Partial<ProjectDetails> = {}) =>
    ({
        name,
        path: `/${name}`,
        added_at: new Date(1),
        is_new: true,
        last_opened: null,
        ...fields,
    }) as ProjectDetails;
const a = project('A');
const b = project('B');
const c = project('C');
const oldA = project('Old A', { pinned: true, pinned_order: 0 });
const oldB = project('Old B', { pinned: true, pinned_order: 1 });

/** Captures initial eligible targets, independent of the stored list order.
 * @param targets - Reviewed selected projects in current display order.
 * @param pinned - Original desired pin state.
 */
const operation = (
    targets: ProjectDetails[] = [a, b, c, oldA],
    pinned = true,
): ProjectPinBatch => ({
    pinned,
    orderedTargets: getEligibleProjectPins(targets, pinned),
    completed: [],
    changed: [],
    failures: [],
    orderError: null,
});

/** Supplies the existing promote-on-pin and complete-order persistence boundaries. */
function fixture() {
    let projects = [c, oldB, a, oldA, b];
    const readProjects = vi.fn(async () => projects);
    const setProjectPinned = vi.fn(
        async (target: ProjectDetails, pinned: boolean) => {
            const paths = getProjectSections(projects, '')
                .pinnedProjects.filter((item) => item.path !== target.path)
                .map((item) => item.path);
            if (pinned) paths.unshift(target.path);
            projects = projects.map((item) => {
                const value =
                    item.path === target.path ? { ...item, pinned } : item;
                return {
                    ...value,
                    pinned_order: value.pinned
                        ? paths.indexOf(item.path)
                        : undefined,
                };
            });
            return projects;
        },
    );
    const reorderPinnedProjects = vi.fn(async (paths: string[]) => {
        projects = projects.map((item) => ({
            ...item,
            pinned_order: item.pinned ? paths.indexOf(item.path) : undefined,
        }));
        return projects;
    });
    return {
        readProjects,
        setProjectPinned,
        reorderPinnedProjects,
        unavailable: 'unavailable',
    };
}

/** Applies an initial operation or a failed-only/ordering-only retry.
 * @param deps - Mocked existing persistence boundaries.
 * @param state - Original operation and cumulative outcomes.
 * @param targets - Initial targets or failed subset.
 */
const run = (
    deps: ReturnType<typeof fixture>,
    state: ProjectPinBatch,
    targets = state.orderedTargets,
) => runProjectPinBatch({ ...deps, state, targets });

/** Reads saved pinned display order.
 * @param deps - Saved list boundary.
 */
const order = async (deps: ReturnType<typeof fixture>) =>
    getProjectSections(await deps.readProjects(), '').pinnedProjects.map(
        (item) => item.name,
    );

describe('bulk project pins', () => {
    it('counts unique eligible targets and treats missing pinned state as unpinned', () => {
        expect(getEligibleProjectPins([a, a, oldA], true)).toEqual([a]);
        expect(getEligibleProjectPins([a, oldA, oldA], false)).toEqual([oldA]);
        expect(getEligibleProjectPins([oldA], true)).toEqual([]);
        expect(getEligibleProjectPins([a], false)).toEqual([]);
    });
    it('groups new pins in reviewed order, preserving old pins and unrelated fields', async () => {
        const deps = fixture();
        const before = await deps.readProjects();
        const result = await run(deps, operation());
        expect(
            deps.setProjectPinned.mock.calls.map(([item]) => item.name),
        ).toEqual(['C', 'B', 'A']);
        expect(await order(deps)).toEqual(['A', 'B', 'C', 'Old A', 'Old B']);
        expect(deps.reorderPinnedProjects).not.toHaveBeenCalled();
        expect(result.failures).toEqual([]);
        expect(
            (await deps.readProjects()).map((item) => [
                item.name,
                item.is_new,
                item.last_opened,
                item.added_at,
            ]),
        ).toEqual(
            before.map((item) => [
                item.name,
                item.is_new,
                item.last_opened,
                item.added_at,
            ]),
        );
    });
    it('uses captured display order rather than storage order', async () => {
        const deps = fixture();
        await run(deps, operation([b, c, a, oldA]));
        expect(await order(deps)).toEqual(['B', 'C', 'A', 'Old A', 'Old B']);
    });
    it('retries only a failed middle target, repairing the group without repinning successes', async () => {
        const deps = fixture();
        const real = deps.setProjectPinned.getMockImplementation();
        if (!real) throw new Error('Missing persistence fixture');
        deps.setProjectPinned
            .mockImplementationOnce(real)
            .mockRejectedValueOnce(new Error('write-failed'));
        const partial = await run(deps, operation());
        expect(await order(deps)).toEqual(['A', 'C', 'Old A', 'Old B']);
        const completed = await run(
            deps,
            partial,
            partial.failures.map((failure) => failure.project),
        );
        expect(
            deps.setProjectPinned.mock.calls.map(([item]) => item.name),
        ).toEqual(['C', 'B', 'A', 'B']);
        expect(await order(deps)).toEqual(['A', 'B', 'C', 'Old A', 'Old B']);
        expect(completed.completed).toHaveLength(3);
        expect(completed.failures).toEqual([]);
    });
    it('retries a failed order write without repeating completed pin mutations', async () => {
        const deps = fixture();
        const real = deps.setProjectPinned.getMockImplementation();
        if (!real) throw new Error('Missing persistence fixture');
        deps.setProjectPinned
            .mockImplementationOnce(real)
            .mockRejectedValueOnce(new Error('write-failed'));
        const partial = await run(deps, operation());
        deps.reorderPinnedProjects.mockRejectedValueOnce(
            new Error('order-failed'),
        );
        const unordered = await run(
            deps,
            partial,
            partial.failures.map((failure) => failure.project),
        );
        expect(unordered.orderError).toBe('order-failed');
        expect(unordered.failures).toEqual([]);
        expect(unordered.completed).toHaveLength(3);
        const complete = await run(deps, unordered, []);
        expect(deps.setProjectPinned).toHaveBeenCalledTimes(4);
        expect(deps.reorderPinnedProjects).toHaveBeenCalledTimes(2);
        expect(complete.orderError).toBeNull();
        expect(await order(deps)).toEqual(['A', 'B', 'C', 'Old A', 'Old B']);
    });
    it('unpins only pinned targets and never reorders the remaining pins', async () => {
        const deps = fixture();
        await run(deps, operation([a, oldA], false));
        expect(
            deps.setProjectPinned.mock.calls.map(([item, pinned]) => [
                item.name,
                pinned,
            ]),
        ).toEqual([['Old A', false]]);
        expect(await order(deps)).toEqual(['Old B']);
        expect(deps.reorderPinnedProjects).not.toHaveBeenCalled();
    });
    it('skips a target pinned elsewhere without promoting it into this batch group', async () => {
        const deps = fixture();
        const state = operation([a, oldA]);
        await deps.setProjectPinned(a, true);
        await deps.reorderPinnedProjects([oldA.path, oldB.path, a.path]);
        deps.setProjectPinned.mockClear();
        deps.reorderPinnedProjects.mockClear();
        const result = await run(deps, state);
        expect(deps.setProjectPinned).not.toHaveBeenCalled();
        expect(deps.reorderPinnedProjects).not.toHaveBeenCalled();
        expect(result.changed).toEqual([]);
        expect(await order(deps)).toEqual(['Old A', 'Old B', 'A']);
    });
    it('rejects removed or re-registered targets and detects the backend silent no-op', async () => {
        const deps = fixture();
        deps.readProjects.mockResolvedValue([{ ...a, added_at: new Date(2) }]);
        const result = await run(deps, operation([a, b]));
        expect(result.failures.map((failure) => failure.error)).toEqual([
            'unavailable',
            'unavailable',
        ]);
        expect(deps.setProjectPinned).not.toHaveBeenCalled();
        deps.readProjects.mockResolvedValue([a]);
        deps.setProjectPinned.mockResolvedValue([]);
        expect((await run(deps, operation([a]))).failures[0].error).toBe(
            'unavailable',
        );
    });
    it('keeps filtered-out and unrelated pins in their current relative order', () => {
        const outsider = project('Outside', { pinned: true, pinned_order: 0 });
        const changedA = { ...a, pinned: true, pinned_order: 2 };
        const state = { ...operation([a]), changed: [a] };
        expect(
            getProjectPinBatchOrder([oldA, oldB, outsider, changedA], state),
        ).toEqual([a.path, oldA.path, outsider.path, oldB.path]);
    });
});
