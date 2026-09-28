import type {
    ProjectTagSelection,
    ProjectTagsSnapshot,
} from './project-tags.types.js';

/** Project tag operations available to the renderer. */
export type ProjectTagsBridge = {
    getSnapshot(): Promise<ProjectTagsSnapshot>;
    setProjectTags(
        projectPath: string,
        selection: ProjectTagSelection[],
    ): Promise<ProjectTagsSnapshot>;
};
