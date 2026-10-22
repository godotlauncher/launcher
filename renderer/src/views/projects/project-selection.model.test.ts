import type { ProjectDetails } from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
    canClearProjectNew,
    getUniqueProjects,
    runProjectBatch,
} from './project-selection.model';

/** Supplies the identity and eligibility fields used by this model.
 * @param path - Registered project identity.
 * @param fields - Optional eligibility overrides.
 */
const project = (path: string, fields: Partial<ProjectDetails> = {}) =>
    ({
        path,
        name: path,
        is_new: true,
        last_opened: null,
        ...fields,
    }) as ProjectDetails;

describe('project selection', () => {
    it('counts each selected path once and drops removed registrations', () => {
        const first = project('/first');
        const second = project('/second');
        expect(
            getUniqueProjects(
                [first, first, second],
                new Set(['/first', '/removed']),
            ),
        ).toEqual([first]);
    });
    it('only clears explicitly new, unopened projects, including pinned projects', () => {
        expect(canClearProjectNew(project('/pinned', { pinned: true }))).toBe(
            true,
        );
        expect(
            canClearProjectNew(project('/opened', { last_opened: new Date() })),
        ).toBe(false);
        expect(canClearProjectNew(project('/old', { is_new: false }))).toBe(
            false,
        );
        expect(
            canClearProjectNew(project('/legacy', { is_new: undefined })),
        ).toBe(false);
    });
    it('keeps successful mutations and named failures, then retries only failures', async () => {
        const first = project('/first');
        const second = project('/second');
        const action = vi
            .fn()
            .mockResolvedValueOnce('saved')
            .mockRejectedValueOnce(new Error('write failed'));
        const result = await runProjectBatch([first, first, second], action);
        expect(action).toHaveBeenCalledTimes(2);
        expect(result.successes).toEqual([{ project: first, value: 'saved' }]);
        expect(result.failures).toEqual([
            { project: second, error: 'write failed' },
        ]);
        action.mockResolvedValueOnce('saved');
        await runProjectBatch(
            result.failures.map((failure) => failure.project),
            action,
        );
        expect(action.mock.calls.map(([item]) => item.path)).toEqual([
            '/first',
            '/second',
            '/second',
        ]);
    });
    it('continues after a failure rather than abandoning later targets', async () => {
        const action = vi
            .fn()
            .mockRejectedValueOnce('unavailable')
            .mockResolvedValueOnce('saved');
        const result = await runProjectBatch(
            [project('/first'), project('/second')],
            action,
        );
        expect(result.failures[0].error).toBe('unavailable');
        expect(result.successes[0].project.path).toBe('/second');
    });
});
