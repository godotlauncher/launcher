import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
import type {
    ProjectTagSelection,
    ProjectTagsBridge,
    ProjectTagsSnapshot,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectTagService } from './project-tag.service.js';

const ProjectTagsHandler = createIpcHandleTyped<ProjectTagsBridge>();

/** Handles project tag requests from the renderer. */
@BridgeController({ namespace: 'projectTags' })
export class ProjectTagsController implements ProjectTagsBridge {
    /**
     * Creates the project tag controller.
     * @param tags - Project tag service.
     */
    constructor(private readonly tags: ProjectTagService) {}

    /** Returns the current catalogue and assignments. */
    @ProjectTagsHandler('getSnapshot')
    getSnapshot(): Promise<ProjectTagsSnapshot> {
        return this.tags.getSnapshot();
    }

    /**
     * Saves one project's selected tags.
     * @param projectPath - Exact registered project path.
     * @param selection - IDs and new names selected by the user.
     */
    @ProjectTagsHandler('setProjectTags')
    setProjectTags(
        projectPath: string,
        selection: ProjectTagSelection[],
    ): Promise<ProjectTagsSnapshot> {
        return this.tags.setProjectTags(projectPath, selection);
    }
    /** Saves a catalogue tag independently of project membership.
     * @param id - Existing ID, or null for a new tag.
     * @param name - Requested display name.
     * @param colour - Preset colour index.
     */
    @ProjectTagsHandler('saveTag')
    saveTag(
        id: string | null,
        name: string,
        colour: number,
    ): Promise<ProjectTagsSnapshot> {
        return this.tags.saveTag(id, name, colour);
    } /** Deletes a tag and removes it from assigned projects.
     * @param id - Catalogue tag ID.
     */
    @ProjectTagsHandler('deleteTag')
    deleteTag(id: string): Promise<ProjectTagsSnapshot> {
        return this.tags.deleteTag(id);
    }
}
