import type {
    ProjectTagSelection,
    ProjectTagsSnapshot,
} from './project-tags.types.js';

/** Project tag operations available to the renderer. */
export type ProjectTagsBridge = {
    saveTag(
        id: string | null,
        name: string,
        colour: number,
    ): Promise<ProjectTagsSnapshot>;
    deleteTag(id: string): Promise<ProjectTagsSnapshot>;
    getSnapshot(): Promise<ProjectTagsSnapshot>;
    setProjectTags(
        projectPath: string,
        selection: ProjectTagSelection[],
    ): Promise<ProjectTagsSnapshot>;
};
