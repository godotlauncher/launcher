import type { ProjectDetails, ProjectTagsSnapshot } from '@shared/contracts';
import { describe, expect, it, vi } from 'vitest';
import { saveProjectEntryTags } from './project-entry-tags.service';

const project = {
    path: 'registered-project',
    added_at: new Date(1000),
} as ProjectDetails;
/** Supplies isolated saved memberships and a registered project identity. */
function dependencies() {
    return {
        project,
        selection: [{ name: 'Prototype' }],
        getProjects: vi.fn(async () => [project]),
        getSnapshot: vi.fn(
            async (): Promise<ProjectTagsSnapshot> => ({
                tags: [{ id: 'old', name: 'Existing', colour: 0 }],
                assignments: { [project.path]: ['old'], other: ['old'] },
            }),
        ),
        save: vi.fn(
            async (): Promise<ProjectTagsSnapshot> => ({
                tags: [],
                assignments: {},
            }),
        ),
    };
}
describe('saveProjectEntryTags', () => {
    it('preserves memberships and saves only to the registered result path', async () => {
        const deps = dependencies();
        await saveProjectEntryTags(deps);
        expect(deps.save).toHaveBeenCalledExactlyOnceWith(project.path, [
            { id: 'old' },
            { name: 'Prototype' },
        ]);
    });
    it('does not write anything for an empty selection', async () => {
        const deps = { ...dependencies(), selection: [] };
        await saveProjectEntryTags(deps);
        expect(deps.getProjects).not.toHaveBeenCalled();
        expect(deps.save).not.toHaveBeenCalled();
    });
    it('rejects a removed registration before creating new tags', async () => {
        const deps = dependencies();
        deps.getProjects.mockResolvedValue([]);
        await expect(saveProjectEntryTags(deps)).rejects.toThrow(
            'invalid-project',
        );
        expect(deps.getSnapshot).not.toHaveBeenCalled();
        expect(deps.save).not.toHaveBeenCalled();
    });
    it('rejects replacement at the same path while reading tags', async () => {
        const deps = dependencies();
        deps.getProjects
            .mockResolvedValueOnce([project])
            .mockResolvedValueOnce([{ ...project, added_at: new Date(2000) }]);
        await expect(saveProjectEntryTags(deps)).rejects.toThrow(
            'invalid-project',
        );
        expect(deps.save).not.toHaveBeenCalled();
    });
    it('retains choices after failure and reads fresh memberships on retry', async () => {
        const deps = dependencies();
        deps.save.mockRejectedValueOnce(new Error('write failed'));
        await expect(saveProjectEntryTags(deps)).rejects.toThrow(
            'write failed',
        );
        deps.getSnapshot.mockResolvedValue({
            tags: [],
            assignments: { [project.path]: ['old', 'added-elsewhere'] },
        });
        await saveProjectEntryTags(deps);
        expect(deps.save).toHaveBeenLastCalledWith(project.path, [
            { id: 'old' },
            { id: 'added-elsewhere' },
            { name: 'Prototype' },
        ]);
        expect(deps.selection).toEqual([{ name: 'Prototype' }]);
    });
});
