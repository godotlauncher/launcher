import type { ProjectDetails } from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import { runProjectRemoval } from './project-bulk-remove.model';

/** Creates a reviewed registration with stable unrelated metadata.
 * @param name - Project name and fixture path.
 */
const project = (name: string) =>
    ({
        name,
        path: `/${name}`,
        added_at: new Date(1),
        is_new: true,
        last_opened: null,
    }) as ProjectDetails;
const a = project('A');
const b = project('B');
const c = project('C');

/** Supplies a mocked authoritative registration store and removal boundary. */
function fixture() {
    let saved = [a, b, c];
    return {
        targets: [a, b],
        readProjects: vi.fn(async () => saved),
        removeProject: vi.fn(async (target: ProjectDetails) => {
            saved = saved.filter((item) => item.path !== target.path);
            return saved;
        }),
        unavailable: 'unavailable',
    };
}

describe('bulk project removal', () => {
    it('removes each reviewed path once and preserves unrelated registrations', async () => {
        const deps = fixture();
        const result = await runProjectRemoval({ ...deps, targets: [a, b, a] });
        expect(result.successes.map(({ project }) => project)).toEqual([a, b]);
        expect(result.failures).toEqual([]);
        expect(deps.removeProject).toHaveBeenCalledTimes(2);
        expect(await deps.readProjects()).toEqual([c]);
    });
    it('keeps successes and retries only the failed original registration', async () => {
        const deps = fixture();
        deps.removeProject.mockRejectedValueOnce(new Error('write-failed'));
        const result = await runProjectRemoval(deps);
        expect(result.successes.map(({ project }) => project)).toEqual([b]);
        expect(result.failures).toEqual([
            { project: a, error: 'write-failed' },
        ]);
        const retry = await runProjectRemoval({
            ...deps,
            targets: result.failures.map(({ project }) => project),
        });
        expect(retry.failures).toEqual([]);
        expect(
            deps.removeProject.mock.calls.map(([project]) => project.path),
        ).toEqual([a.path, b.path, a.path]);
        expect(await deps.readProjects()).toEqual([c]);
    });
    it('rejects missing and replaced registrations without submitting either', async () => {
        const deps = fixture();
        deps.readProjects.mockResolvedValue([
            { ...a, added_at: new Date(2) },
            c,
        ]);
        const result = await runProjectRemoval(deps);
        expect(result.failures.map(({ error }) => error)).toEqual([
            'unavailable',
            'unavailable',
        ]);
        expect(deps.removeProject).not.toHaveBeenCalled();
    });
    it('passes fresh metadata only for the same reviewed incarnation', async () => {
        const deps = fixture();
        const updated = { ...a, name: 'Updated', pinned: true };
        deps.readProjects.mockResolvedValue([updated, c]);
        await runProjectRemoval({ ...deps, targets: [a] });
        expect(deps.removeProject).toHaveBeenCalledWith(updated);
    });
    it('verifies saved replies instead of claiming a silent no-op succeeded', async () => {
        const deps = fixture();
        deps.removeProject.mockResolvedValue([a, b, c]);
        const result = await runProjectRemoval(deps);
        expect(result.successes).toEqual([]);
        expect(result.failures).toHaveLength(2);
    });
    it('reports read failures independently and does not remove unread targets', async () => {
        const deps = fixture();
        deps.readProjects.mockRejectedValueOnce(new Error('read-failed'));
        const result = await runProjectRemoval(deps);
        expect(result.failures).toEqual([{ project: a, error: 'read-failed' }]);
        expect(deps.removeProject).toHaveBeenCalledTimes(1);
        expect(deps.removeProject).toHaveBeenCalledWith(b);
    });
});
