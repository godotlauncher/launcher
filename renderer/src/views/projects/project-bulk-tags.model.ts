import type {
    ProjectDetails,
    ProjectTagSelection,
    ProjectTagsSnapshot,
} from '@shared/contracts';
import { getUniqueProjects, runProjectBatch } from './project-selection.model';

export type ProjectTagIntent = { tag: ProjectTagSelection; add: boolean };

type TagBatchOptions = {
    targets: ProjectDetails[];
    intent: ProjectTagIntent;
    getProjects: () => ProjectDetails[];
    getSnapshot: () => Promise<ProjectTagsSnapshot>;
    save: (
        path: string,
        tags: ProjectTagSelection[],
    ) => Promise<ProjectTagsSnapshot>;
    unavailable: string;
    unknownTag: string;
};

/** Counts saved membership against the original unique target set.
 * @param targets - Projects captured when the popover opened.
 * @param snapshot - Authoritative tag catalogue and assignments.
 * @param tagId - Catalogue tag whose membership is displayed.
 */
export function getBulkTagMembership(
    targets: ProjectDetails[],
    snapshot: ProjectTagsSnapshot,
    tagId: string,
) {
    const unique = getUniqueProjects(targets);
    const count = unique.filter((project) =>
        snapshot.assignments[project.path]?.includes(tagId),
    ).length;
    return {
        count,
        total: unique.length,
        state: count === 0 ? 'none' : count === unique.length ? 'all' : 'some',
    } as const;
}

/** Changes one tag per target without replacing unrelated saved memberships.
 * @param options - Frozen targets, original direction and existing persistence operations.
 */
export async function runProjectTagBatch({
    targets,
    intent,
    getProjects,
    getSnapshot,
    save,
    unavailable,
    unknownTag,
}: TagBatchOptions) {
    let tag = intent.tag;
    /** Rejects removed or replaced registrations before reading or saving tags.
     * @param target - Original project incarnation captured by the popover.
     */
    const validateTarget = (target: ProjectDetails) => {
        const latest = getProjects().find(
            (project) => project.path === target.path,
        );
        if (
            !latest ||
            latest.added_at?.getTime() !== target.added_at?.getTime()
        )
            throw new Error(unavailable);
    };
    const result = await runProjectBatch(targets, async (target) => {
        validateTarget(target);
        const snapshot = await getSnapshot();
        validateTarget(target);
        const existing = snapshot.tags.find((candidate) =>
            'id' in tag
                ? candidate.id === tag.id
                : candidate.name.toLowerCase() === tag.name.toLowerCase(),
        );
        // A known ID must not recreate a tag deleted elsewhere.
        if ('id' in tag && !existing) throw new Error(unknownTag);
        if (existing) tag = { id: existing.id };
        const ids = snapshot.assignments[target.path] ?? [];
        if (existing && ids.includes(existing.id) === intent.add)
            return snapshot;
        const selection: ProjectTagSelection[] = ids
            .filter((id) => intent.add || id !== existing?.id)
            .map((id) => ({ id }));
        if (intent.add) selection.push(tag);
        const saved = await save(target.path, selection);
        if (!('id' in tag)) {
            const name = tag.name;
            const created = saved.tags.find(
                (candidate) =>
                    candidate.name.toLowerCase() === name.toLowerCase(),
            );
            if (created) tag = { id: created.id };
        }
        return saved;
    });
    return { ...result, intent: { add: intent.add, tag } };
}
