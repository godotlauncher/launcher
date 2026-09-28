import type { ProjectTag, ProjectTagSelection } from '@shared/contracts';

/** Preset swatches shared by pills and, later, compact indicators. */
export const projectTagColours = [
    '#ef4444',
    '#f97316',
    '#eab308',
    '#84cc16',
    '#22c55e',
    '#14b8a6',
    '#06b6d4',
    '#3b82f6',
    '#8b5cf6',
    '#d946ef',
    '#f43f5e',
    '#fb923c',
    '#facc15',
    '#a3e635',
    '#4ade80',
    '#2dd4bf',
    '#22d3ee',
    '#60a5fa',
    '#a78bfa',
    '#e879f9',
    '#b91c1c',
    '#c2410c',
    '#a16207',
    '#4d7c0f',
    '#15803d',
    '#0f766e',
    '#0e7490',
    '#1d4ed8',
    '#6d28d9',
    '#a21caf',
] as const;

/** Stable preset names in the same order as the persisted colour IDs. */
export const projectTagColourNames = [
    'red',
    'orange',
    'yellow',
    'lime',
    'green',
    'teal',
    'cyan',
    'blue',
    'violet',
    'fuchsia',
    'rose',
    'apricot',
    'lemon',
    'lightLime',
    'mint',
    'turquoise',
    'aqua',
    'sky',
    'lavender',
    'orchid',
    'darkRed',
    'rust',
    'ochre',
    'olive',
    'forest',
    'darkTeal',
    'darkCyan',
    'darkBlue',
    'darkViolet',
    'darkFuchsia',
] as const;

/** Resolves staged creations and existing selections for display.
 * @param selection - Ordered draft selections.
 * @param tags - Persisted tag catalogue.
 */
export function getSelectedProjectTags(
    selection: ProjectTagSelection[],
    tags: ProjectTag[],
): ProjectTag[] {
    let created = 0;
    return selection.flatMap((item) => {
        if ('id' in item) {
            const tag = tags.find((candidate) => candidate.id === item.id);
            return tag ? [{ ...tag, colour: item.colour ?? tag.colour }] : [];
        }
        const existing = tags.find(
            (tag) => tag.name.toLowerCase() === item.name.toLowerCase(),
        );
        const tag = existing ?? {
            id: `draft:${item.name.toLowerCase()}`,
            name: item.name,
            colour: (tags.length + created++) % projectTagColours.length,
        };
        return [{ ...tag, colour: item.colour ?? tag.colour }];
    });
}

/** Stages one colour override, omitting a return to the persisted colour.
 * @param item - Existing tag or provisional creation being edited.
 * @param colour - Chosen preset ID.
 * @param tags - Latest persisted catalogue.
 */
export function withProjectTagColour(
    item: ProjectTagSelection,
    colour: number,
    tags: ProjectTag[],
): ProjectTagSelection {
    const existing = tags.find((tag) =>
        'id' in item
            ? tag.id === item.id
            : tag.name.toLowerCase() === item.name.toLowerCase(),
    );
    const identity = 'id' in item ? { id: item.id } : { name: item.name };
    return existing?.colour === colour ? identity : { ...identity, colour };
}

/** Compares membership independently of pill order.
 * @param left - Initial assignment IDs.
 * @param right - Current draft selection.
 * @param tags - Latest catalogue used to compare explicit colour edits.
 */
export function hasProjectTagChanges(
    left: string[],
    right: ProjectTagSelection[],
    tags: ProjectTag[] = [],
): boolean {
    return (
        left.length !== right.length ||
        right.some(
            (item) =>
                !('id' in item) ||
                !left.includes(item.id) ||
                (item.colour !== undefined &&
                    item.colour !==
                        tags.find((tag) => tag.id === item.id)?.colour),
        )
    );
}

/** Builds unselected matches and an optional inline creation choice.
 * @param tags - Existing catalogue.
 * @param selected - Current displayed selections.
 * @param query - Search input, trimmed for matching and creation.
 */
export function getProjectTagOptions(
    tags: ProjectTag[],
    selected: ProjectTag[],
    query: string,
) {
    const name = query.trim();
    const normalized = name.toLowerCase();
    const matches = tags.filter(
        (tag) =>
            !selected.some((item) => item.id === tag.id) &&
            tag.name.toLowerCase().includes(normalized),
    );
    const canCreate =
        Boolean(name) &&
        ![...tags, ...selected].some(
            (tag) => tag.name.toLowerCase() === normalized,
        );
    return { matches, createName: canCreate ? name : null };
}
