import type {
    ProjectDetails,
    ProjectTagSelection,
    ProjectTagsSnapshot,
} from '@shared/contracts';
import { isSameProjectRegistration } from './project-selection.model';

type Options = {
    project: ProjectDetails;
    selection: ProjectTagSelection[];
    getProjects: () => Promise<ProjectDetails[]>;
    getSnapshot: () => Promise<ProjectTagsSnapshot>;
    save: (
        path: string,
        selection: ProjectTagSelection[],
    ) => Promise<ProjectTagsSnapshot>;
};

/** Adds staged tags only to the original successful registration, retaining saved memberships.
 * @param options - Registered target, captured choices and existing persistence operations.
 */
export async function saveProjectEntryTags({
    project,
    selection,
    getProjects,
    getSnapshot,
    save,
}: Options): Promise<void> {
    if (!selection.length) return;
    const current = (await getProjects()).find(
        (candidate) => candidate.path === project.path,
    );
    if (!isSameProjectRegistration(current, project))
        throw new Error('invalid-project');
    const snapshot = await getSnapshot();
    const latest = (await getProjects()).find(
        (candidate) => candidate.path === project.path,
    );
    if (!isSameProjectRegistration(latest, project))
        throw new Error('invalid-project');
    await save(project.path, [
        ...(snapshot.assignments[project.path] ?? []).map((id) => ({ id })),
        ...selection,
    ]);
}
