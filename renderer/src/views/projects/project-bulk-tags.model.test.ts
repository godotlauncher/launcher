import type {
    ProjectDetails,
    ProjectTagSelection,
    ProjectTagsSnapshot,
} from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
    getBulkTagMembership,
    runProjectTagBatch,
} from './project-bulk-tags.model';

/** Creates a registered project incarnation for membership operations.
 * @param path - Unique project path.
 * @param added - Registration time.
 */
const project = (path: string, added = 1) =>
    ({ path, name: path, added_at: new Date(added) }) as ProjectDetails;
const first = project('/first');
const second = project('/second');

/** Supplies saved state and a backend boundary that preserves other projects. */
function fixture() {
    let snapshot: ProjectTagsSnapshot = {
        tags: [
            { id: 'shared', name: 'Shared', colour: 0 },
            { id: 'other', name: 'Other', colour: 2 },
            { id: 'none', name: 'None', colour: 3 },
        ],
        assignments: {
            '/first': ['shared', 'other'],
            '/second': ['other'],
            '/outside': ['shared'],
        },
    };
    const getSnapshot = vi.fn(async () => snapshot);
    const save = vi.fn(async (path: string, tags: ProjectTagSelection[]) => {
        const ids = tags.map((tag) => {
            if ('id' in tag) return tag.id;
            const existing = snapshot.tags.find(
                (item) => item.name.toLowerCase() === tag.name.toLowerCase(),
            );
            if (existing) return existing.id;
            snapshot = {
                ...snapshot,
                tags: [
                    ...snapshot.tags,
                    { id: 'created', name: tag.name, colour: 3 },
                ],
            };
            return 'created';
        });
        snapshot = {
            ...snapshot,
            assignments: { ...snapshot.assignments, [path]: ids },
        };
        return snapshot;
    });
    return {
        getSnapshot,
        save,
        getProjects: () => [first, second],
        unavailable: 'removed',
        unknownTag: 'missing-tag',
    };
}

describe('bulk tag membership', () => {
    it('counts unique frozen targets and exposes none, some and all', async () => {
        const snapshot = await fixture().getSnapshot();
        expect(
            getBulkTagMembership([first, first, second], snapshot, 'shared'),
        ).toEqual({ count: 1, total: 2, state: 'some' });
        expect(getBulkTagMembership([first, second], snapshot, 'none')).toEqual(
            { count: 0, total: 2, state: 'none' },
        );
        expect(
            getBulkTagMembership([first, second], snapshot, 'other'),
        ).toEqual({ count: 2, total: 2, state: 'all' });
    });
    it('adds only missing memberships, preserves unrelated tags and skips duplicate targets', async () => {
        const deps = fixture();
        await runProjectTagBatch({
            ...deps,
            targets: [first, first, second],
            intent: { tag: { id: 'shared' }, add: true },
        });
        expect(deps.save.mock.calls).toEqual([
            ['/second', [{ id: 'other' }, { id: 'shared' }]],
        ]);
        expect((await deps.getSnapshot()).assignments).toEqual({
            '/first': ['shared', 'other'],
            '/second': ['other', 'shared'],
            '/outside': ['shared'],
        });
    });
    it('removes only the clicked tag and retries the failed subset in its original direction', async () => {
        const deps = fixture();
        deps.save.mockRejectedValueOnce(new Error('write-failed'));
        const result = await runProjectTagBatch({
            ...deps,
            targets: [first, second],
            intent: { tag: { id: 'other' }, add: false },
        });
        expect(result.failures.map((failure) => failure.project)).toEqual([
            first,
        ]);
        expect(
            getBulkTagMembership(
                [first, second],
                await deps.getSnapshot(),
                'other',
            ).state,
        ).toBe('some');
        await runProjectTagBatch({
            ...deps,
            targets: result.failures.map((failure) => failure.project),
            intent: result.intent,
        });
        expect(deps.save.mock.calls.map(([path]) => path)).toEqual([
            '/first',
            '/second',
            '/first',
        ]);
        expect((await deps.getSnapshot()).assignments['/first']).toEqual([
            'shared',
        ]);
        expect((await deps.getSnapshot()).assignments['/second']).toEqual([]);
    });
    it('reuses one created identity after a failed first target and across retries', async () => {
        const deps = fixture();
        deps.save.mockRejectedValueOnce(new Error('write-failed'));
        const result = await runProjectTagBatch({
            ...deps,
            targets: [first, second],
            intent: { tag: { name: 'Created' }, add: true },
        });
        expect(result.intent).toEqual({ tag: { id: 'created' }, add: true });
        await runProjectTagBatch({
            ...deps,
            targets: result.failures.map((failure) => failure.project),
            intent: result.intent,
        });
        expect(
            (await deps.getSnapshot()).tags.filter(
                (tag) => tag.name === 'Created',
            ),
        ).toHaveLength(1);
        expect(deps.save.mock.calls[2][1]).toEqual([
            { id: 'shared' },
            { id: 'other' },
            { id: 'created' },
        ]);
    });
    it('rejects removed and re-registered targets without substituting matching projects', async () => {
        const deps = fixture();
        const result = await runProjectTagBatch({
            ...deps,
            getProjects: () => [project('/first', 2), project('/new-match')],
            targets: [first, second],
            intent: { tag: { id: 'other' }, add: false },
        });
        expect(result.failures.map((failure) => failure.error)).toEqual([
            'removed',
            'removed',
        ]);
        expect(deps.save).not.toHaveBeenCalled();
    });
    it('rejects a target removed while the authoritative snapshot is loading', async () => {
        const deps = fixture();
        let projects = [first];
        const snapshot = await deps.getSnapshot();
        deps.getSnapshot.mockImplementation(async () => {
            projects = [];
            return snapshot;
        });
        const result = await runProjectTagBatch({
            ...deps,
            getProjects: () => projects,
            targets: [first],
            intent: { tag: { id: 'none' }, add: true },
        });
        expect(result.failures[0].error).toBe('removed');
        expect(deps.save).not.toHaveBeenCalled();
    });
    it('reads fresh memberships for each target and does not recreate deleted known tags', async () => {
        const deps = fixture();
        const current = await deps.getSnapshot();
        deps.getSnapshot.mockResolvedValueOnce({
            ...current,
            assignments: { ...current.assignments, '/first': ['other'] },
        });
        await runProjectTagBatch({
            ...deps,
            targets: [first],
            intent: { tag: { id: 'shared' }, add: true },
        });
        expect(deps.save.mock.calls[0][1]).toEqual([
            { id: 'other' },
            { id: 'shared' },
        ]);
        deps.getSnapshot.mockResolvedValue({ tags: [], assignments: {} });
        const result = await runProjectTagBatch({
            ...deps,
            targets: [second],
            intent: { tag: { id: 'shared' }, add: true },
        });
        expect(result.failures[0].error).toBe('missing-tag');
        expect(deps.save).toHaveBeenCalledTimes(1);
    });
});
