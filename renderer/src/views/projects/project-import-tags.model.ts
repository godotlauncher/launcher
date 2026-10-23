import type {
    ProjectTag,
    ProjectTagSelection,
    ProjectTagsSnapshot,
} from '@shared/contracts';
import {
    getSelectedProjectTags,
    projectTagColours,
} from '../../components/project-tags/project-tag.model';
import type { ProjectTagIntent } from './project-bulk-tags.model';

/** Resolves staged names into a display-only catalogue for shared bulk membership controls.
 * @param tags - Saved catalogue, which is never changed by this adapter.
 * @param selections - Draft selections keyed by stable import row identity.
 */
export function getImportTagSnapshot(
    tags: ProjectTag[],
    selections: Record<string, ProjectTagSelection[]>,
): ProjectTagsSnapshot {
    const catalogue = [...tags];
    const assignments: Record<string, string[]> = {};
    for (const [path, selection] of Object.entries(selections)) {
        const selected = getSelectedProjectTags(selection, catalogue);
        for (const tag of selected)
            if (!catalogue.some((candidate) => candidate.id === tag.id))
                catalogue.push(tag);
        assignments[path] = [...new Set(selected.map((tag) => tag.id))];
    }
    return { tags: catalogue, assignments };
}

/** Applies one bulk add/remove intent while retaining unrelated drafts and explicit colours.
 * @param tags - Saved catalogue used to distinguish real IDs from staged names.
 * @param selections - Current per-project draft selections.
 * @param targets - Checked eligible row identities captured for this action.
 * @param intent - One tag membership change from the shared bulk picker.
 */
export function changeImportTags(
    tags: ProjectTag[],
    selections: Record<string, ProjectTagSelection[]>,
    targets: readonly string[],
    intent: ProjectTagIntent,
): Record<string, ProjectTagSelection[]> {
    const snapshot = getImportTagSnapshot(tags, selections);
    const tag = snapshot.tags.find((candidate) =>
        'id' in intent.tag
            ? candidate.id === intent.tag.id
            : candidate.name.toLowerCase() ===
              intent.tag.name.trim().toLowerCase(),
    );
    if ('id' in intent.tag && !tag) return {};
    const choice: ProjectTagSelection = tag
        ? tags.some((saved) => saved.id === tag.id)
            ? { id: tag.id }
            : { name: tag.name, colour: tag.colour }
        : {
              name: 'name' in intent.tag ? intent.tag.name.trim() : '',
              colour:
                  intent.tag.colour ??
                  snapshot.tags.length % projectTagColours.length,
          };
    const updates: Record<string, ProjectTagSelection[]> = {};
    for (const id of new Set(targets)) {
        const current = selections[id];
        if (!current) continue;
        /** Compares saved IDs and case-insensitive staged names as one tag identity.
         * @param item - One staged selection to compare with the bulk intent.
         */
        const matches = (item: ProjectTagSelection) => {
            if (tag)
                return getSelectedProjectTags([item], snapshot.tags).some(
                    (candidate) => candidate.id === tag.id,
                );
            return (
                'name' in item &&
                'name' in choice &&
                item.name.trim().toLowerCase() === choice.name.toLowerCase()
            );
        };
        const present = current.some(matches);
        updates[id] = intent.add
            ? present
                ? current
                : [...current, choice]
            : present
              ? current.filter((item) => !matches(item))
              : current;
    }
    return updates;
}
