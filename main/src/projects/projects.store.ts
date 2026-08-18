import type { CodeEditorId, ProjectDetails } from '@shared/contracts';
import logger from 'electron-log';
import { JsonFileStore } from '../json-store/json-file.store.js';
import type { JsonStoreWriteOptions } from '../json-store/json-store.types.js';
import type { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';

/** Describes the on-disk project shape retained for compatibility. */
export type StoredProjectDetails = Omit<
    ProjectDetails,
    'added_at' | 'codeEditorId' | 'last_opened'
> & {
    added_at?: Date | string;
    codeEditorId?: CodeEditorId | null;
    withVSCode?: boolean;
    last_opened: Date | string | null;
};

/** Contains a normalized project list and its optimistic version. */
export type ProjectsSnapshot = {
    projects: ProjectDetails[];
    version: string;
};

/**
 * Converts one stored project into its application shape.
 *
 * @param storedProject - Stored project to convert.
 * @returns The normalized application project.
 */
export function fromStoredProject(
    storedProject: StoredProjectDetails,
): ProjectDetails {
    const { withVSCode, ...project } = storedProject;

    return {
        ...project,
        added_at: toDate(storedProject.added_at) ?? undefined,
        pinned: storedProject.pinned ?? false,
        pinned_order: storedProject.pinned
            ? normalizePinnedOrder(storedProject.pinned_order)
            : undefined,
        codeEditorId:
            storedProject.codeEditorId !== undefined
                ? storedProject.codeEditorId
                : withVSCode
                  ? 'vscode'
                  : null,
        last_opened: toDate(storedProject.last_opened),
    };
}

/**
 * Converts one project into the existing on-disk shape.
 *
 * @param project - Application project to convert.
 * @returns The compatible stored project.
 */
export function toStoredProject(project: ProjectDetails): StoredProjectDetails {
    return {
        ...project,
        pinned_order: project.pinned
            ? normalizePinnedOrder(project.pinned_order)
            : undefined,
        withVSCode: project.codeEditorId === 'vscode',
    };
}

/**
 * Converts and orders a complete stored project list.
 *
 * @param projects - Stored projects to convert.
 * @returns Normalized application projects.
 */
export function fromStoredProjects(
    projects: StoredProjectDetails[],
): ProjectDetails[] {
    return normalizeProjects(projects.map(fromStoredProject));
}

/**
 * Converts and orders a complete application project list for storage.
 *
 * @param projects - Application projects to convert.
 * @returns Compatible stored projects.
 */
export function toStoredProjects(
    projects: ProjectDetails[],
): StoredProjectDetails[] {
    return normalizeProjects(projects).map(toStoredProject);
}

/** Owns atomic persistence for Launcher projects. */
export class ProjectsStore extends JsonFileStore<StoredProjectDetails[]> {
    /**
     * Creates the project store.
     *
     * @param coordinator - Service that serialises atomic JSON operations.
     * @param filePath - Existing projects.json path.
     */
    constructor(coordinator: JsonStoreCoordinatorService, filePath: string) {
        super(coordinator, {
            pathProvider: () => filePath,
            defaultValue: () => [],
            parse: (raw) => {
                try {
                    const parsed = JSON.parse(raw) as unknown;
                    return Array.isArray(parsed)
                        ? (parsed as StoredProjectDetails[])
                        : [];
                } catch (error) {
                    logger.error('Failed to read stored project list', error);
                    return [];
                }
            },
            normalize: (projects) =>
                toStoredProjects(fromStoredProjects(projects)),
        });
    }

    /** Gets every normalized project. */
    async list(): Promise<ProjectDetails[]> {
        return fromStoredProjects((await this.readValue()).value);
    }

    /** Gets every normalized project with its optimistic version. */
    async snapshot(): Promise<ProjectsSnapshot> {
        const snapshot = await this.readValue();
        return {
            projects: fromStoredProjects(snapshot.value),
            version: snapshot.version,
        };
    }

    /**
     * Replaces the complete project list.
     *
     * @param projects - Complete project list to persist.
     * @param options - Optional optimistic version requirement.
     */
    async replace(
        projects: ProjectDetails[],
        options?: JsonStoreWriteOptions,
    ): Promise<ProjectDetails[]> {
        return fromStoredProjects(
            (await this.replaceValue(toStoredProjects(projects), options))
                .value,
        );
    }

    /**
     * Applies one project-list mutation against the latest stored value.
     *
     * @param mutator - Function that returns the complete updated project list.
     */
    async update(
        mutator: (
            projects: ProjectDetails[],
        ) => ProjectDetails[] | Promise<ProjectDetails[]>,
    ): Promise<ProjectDetails[]> {
        return fromStoredProjects(
            (
                await this.updateValue(async (storedProjects) =>
                    toStoredProjects(
                        await mutator(fromStoredProjects(storedProjects)),
                    ),
                )
            ).value,
        );
    }

    /**
     * Adds or replaces one project by its path.
     *
     * @param project - Project to persist.
     */
    async put(project: ProjectDetails): Promise<ProjectDetails[]> {
        return fromStoredProjects(
            (
                await this.updateValue((storedProjects) => {
                    const projects = fromStoredProjects(storedProjects);
                    const index = projects.findIndex(
                        (candidate) => candidate.path === project.path,
                    );

                    if (index >= 0) {
                        projects[index] = project;
                    } else {
                        projects.push(project);
                    }

                    return toStoredProjects(projects);
                })
            ).value,
        );
    }

    /**
     * Removes one project by its exact path.
     *
     * @param projectPath - Exact stored project path.
     */
    async remove(projectPath: string): Promise<ProjectDetails[]> {
        return fromStoredProjects(
            (
                await this.updateValue((storedProjects) =>
                    toStoredProjects(
                        fromStoredProjects(storedProjects).filter(
                            (project) => project.path !== projectPath,
                        ),
                    ),
                )
            ).value,
        );
    }
}

/**
 * Normalizes dates and preserves the existing ascending last-opened order.
 *
 * @param projects - Projects to normalize.
 * @returns Normalized projects in persisted order.
 */
function normalizeProjects(projects: ProjectDetails[]): ProjectDetails[] {
    return projects
        .map((project) => ({
            ...project,
            last_opened: toDate(project.last_opened),
        }))
        .sort(
            (first, second) =>
                (first.last_opened ?? new Date(0)).getTime() -
                (second.last_opened ?? new Date(0)).getTime(),
        );
}

/**
 * Normalizes a stored pinned order.
 *
 * @param value - Stored pinned order.
 * @returns The valid order, or undefined.
 */
function normalizePinnedOrder(value: number | undefined): number | undefined {
    return Number.isInteger(value) && value !== undefined && value >= 0
        ? value
        : undefined;
}

/**
 * Converts one stored date value into a valid Date or null.
 *
 * @param value - Stored date value.
 * @returns A valid Date, or null.
 */
function toDate(value: Date | string | null | undefined): Date | null {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return value;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
