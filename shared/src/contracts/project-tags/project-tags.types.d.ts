/** One reusable Launcher-owned project tag. */
export type ProjectTag = {
    id: string;
    name: string;
    colour: number;
};

/** Selects an existing tag or creates/reuses one by name. */
export type ProjectTagSelection = ({ id: string } | { name: string }) & {
    colour?: number;
};

/** The catalogue and project-path assignments from one persisted revision. */
export type ProjectTagsSnapshot = {
    tags: ProjectTag[];
    assignments: Record<string, string[]>;
};

export type ProjectTagErrorCode =
    | 'invalid-project'
    | 'invalid-selection'
    | 'invalid-colour'
    | 'blank-name'
    | 'unknown-tag';
