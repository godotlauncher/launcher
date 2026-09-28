import { randomUUID } from 'node:crypto';
import { Injectable } from '@mariodebono/di';
import type {
    ProjectTag,
    ProjectTagErrorCode,
    ProjectTagSelection,
    ProjectTagsSnapshot,
} from '@shared/contracts';
import { getMainWindow } from '../mainWindow.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectsStore } from '../projects/projects.store.js';
import { ipcWebContentsSend } from '../utils.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ProjectTagStore } from './project-tag.store.js';

/** A stable error code that the renderer can translate. */
export class ProjectTagError extends Error {
    /**
     * Creates a project tag error.
     * @param code - Renderer-facing validation code.
     */
    constructor(readonly code: ProjectTagErrorCode) {
        super(code);
        this.name = 'ProjectTagError';
    }
}

/** Coordinates project validation and tag persistence. */
@Injectable()
export class ProjectTagService {
    /**
     * Creates the project tag service.
     * @param store - Atomic tag state.
     * @param projects - Registered project paths.
     */
    constructor(
        private readonly store: ProjectTagStore,
        private readonly projects: ProjectsStore,
    ) {}

    /** Reads the current project tag snapshot. */
    async getSnapshot(): Promise<ProjectTagsSnapshot> {
        const snapshot = await this.store.snapshot();
        const registered = new Set(
            (await this.projects.list()).map((project) => project.path),
        );
        if (
            Object.keys(snapshot.assignments).every((projectPath) =>
                registered.has(projectPath),
            )
        )
            return snapshot;
        // Retry cleanup after an interrupted or failed project-removal write.
        return this.store.update(async (current) => {
            const paths = new Set(
                (await this.projects.list()).map((project) => project.path),
            );
            return {
                tags: current.tags,
                assignments: Object.fromEntries(
                    Object.entries(current.assignments).filter(
                        ([projectPath]) => paths.has(projectPath),
                    ),
                ),
            };
        });
    }

    /**
     * Resolves and saves all tags for a registered project together.
     * @param projectPath - Exact registered project path.
     * @param selection - Existing IDs and names to create or reuse, with optional preset colours.
     */
    async setProjectTags(
        projectPath: string,
        selection: ProjectTagSelection[],
    ): Promise<ProjectTagsSnapshot> {
        if (
            typeof projectPath !== 'string' ||
            !projectPath ||
            !Array.isArray(selection)
        ) {
            throw new ProjectTagError('invalid-selection');
        }
        if (
            !(await this.projects.list()).some(
                (project) => project.path === projectPath,
            )
        ) {
            throw new ProjectTagError('invalid-project');
        }
        const snapshot = await this.store.update(async (current) => {
            // Check again after waiting for earlier tag saves.
            if (
                !(await this.projects.list()).some(
                    (project) => project.path === projectPath,
                )
            ) {
                throw new ProjectTagError('invalid-project');
            }
            const tags = current.tags.map((tag) => ({ ...tag }));
            const ids: string[] = [];
            const selected = new Set<string>();
            for (const item of selection) {
                if (!item || typeof item !== 'object' || Array.isArray(item))
                    throw new ProjectTagError('invalid-selection');
                const keys = Object.keys(item);
                const hasColour = keys.includes('colour');
                if (
                    hasColour &&
                    (!Number.isInteger(item.colour) ||
                        (item.colour as number) < 0 ||
                        (item.colour as number) > 29)
                ) {
                    throw new ProjectTagError('invalid-colour');
                }
                let tag: ProjectTag | undefined;
                if (
                    'id' in item &&
                    keys.includes('id') &&
                    typeof item.id === 'string' &&
                    keys.length === (hasColour ? 2 : 1)
                ) {
                    tag = tags.find((candidate) => candidate.id === item.id);
                    if (!tag) throw new ProjectTagError('unknown-tag');
                } else if (
                    'name' in item &&
                    keys.includes('name') &&
                    typeof item.name === 'string' &&
                    keys.length === (hasColour ? 2 : 1)
                ) {
                    const name = item.name.trim();
                    if (!name) throw new ProjectTagError('blank-name');
                    tag = tags.find(
                        (candidate) =>
                            candidate.name.toLowerCase() === name.toLowerCase(),
                    );
                    if (!tag) {
                        tag = {
                            id: randomUUID(),
                            name,
                            colour: hasColour
                                ? (item.colour as number)
                                : tags.length % 30,
                        };
                        tags.push(tag);
                    }
                } else {
                    throw new ProjectTagError('invalid-selection');
                }
                if (hasColour) tag.colour = item.colour as number;
                if (!selected.has(tag.id)) {
                    selected.add(tag.id);
                    ids.push(tag.id);
                }
            }
            const assignments = Object.fromEntries(
                Object.entries(current.assignments).filter(
                    ([path]) => path !== projectPath,
                ),
            );
            if (ids.length) assignments[projectPath] = ids;
            return { tags, assignments };
        });
        this.publish(snapshot);
        return snapshot;
    }

    /**
     * Removes assignments after a project has been unregistered.
     * @param projectPath - Exact path of the removed project.
     */
    async removeProjectAssignments(projectPath: string): Promise<void> {
        const snapshot = await this.store.update((current) => ({
            tags: current.tags,
            assignments: Object.fromEntries(
                Object.entries(current.assignments).filter(
                    ([path]) => path !== projectPath,
                ),
            ),
        }));
        this.publish(snapshot);
    }

    /**
     * Publishes a persisted tag snapshot to the renderer.
     * @param snapshot - Final persisted state.
     */
    private publish(snapshot: ProjectTagsSnapshot): void {
        const webContents = getMainWindow()?.webContents;
        if (webContents && !webContents.isDestroyed?.()) {
            ipcWebContentsSend('project-tags-updated', webContents, snapshot);
        }
    }
}
