import * as path from 'node:path';
import logger from 'electron-log';
import { PROJECTS_FILENAME } from '../constants.js';
import { __resetJsonStoreForTesting } from './jsonStore.js';
import {
    __resetJsonStoreFactoryForTesting,
    createTypedJsonStore,
    type TypedJsonStore,
} from './jsonStoreFactory.js';
import { getDefaultDirs } from './platform.utils.js';

let projectsStore: TypedJsonStore<ProjectDetails[]> | null = null;
let projectsPath: string | null = null;

export type ProjectsWriteOptions = {
    expectedVersion?: string;
};

function resolveProjectsPath(pathOverride?: string): string {
    if (pathOverride) {
        projectsPath = pathOverride;
        return pathOverride;
    }

    if (!projectsPath) {
        const { configDir } = getDefaultDirs();
        projectsPath = path.resolve(configDir, PROJECTS_FILENAME);
    }

    return projectsPath;
}

function normalizeProjects(projects: ProjectDetails[]): ProjectDetails[] {
    return projects
        .map((project) => ({
            ...project,
            last_opened: project.last_opened
                ? new Date(project.last_opened)
                : null,
        }))
        .sort(
            (a, b) =>
                (a.last_opened ?? new Date(0)).getTime() -
                (b.last_opened ?? new Date(0)).getTime(),
        );
}

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

function ensureProjectsStore(
    pathOverride?: string,
): TypedJsonStore<ProjectDetails[]> {
    const resolvedPath = resolveProjectsPath(pathOverride);
    if (projectsStore && projectsPath === resolvedPath) {
        return projectsStore;
    }

    projectsStore = createTypedJsonStore<ProjectDetails[]>({
        id: `projects:${resolvedPath}`,
        logLabel: 'projects list',
        pathProvider: () => resolvedPath,
        defaultValue: async () => [],
        normalize: async (projects) => normalizeProjects(projects),
        onParseError: (error) => {
            logger.error('Failed to read stored project list', error);
            return [];
        },
    });

    return projectsStore;
}

/**
 * Stores a list of projects to a JSON file.
 *
 * @param storeDir - The file path where project data will be stored
 * @param projects - The array of ProjectDetails to store
 * @returns A Promise that resolves to the same projects array that was provided
 */
export async function storeProjectsList(
    storeDir: string,
    projects: ProjectDetails[],
    options?: ProjectsWriteOptions,
): Promise<ProjectDetails[]> {
    const store = ensureProjectsStore(storeDir);
    const persisted = await store.write(projects, options);
    return normalizeProjects(persisted);
}

export async function getProjectsSnapshot(
    storeDir: string,
): Promise<{ projects: ProjectDetails[]; version: string }> {
    const store = ensureProjectsStore(storeDir);
    const snapshot = await store.readSnapshot();
    return {
        projects: normalizeProjects(snapshot.value),
        version: snapshot.version,
    };
}

/**
 * Retrieves a list of stored projects from a JSON file.
 *
 * @param storeDir - The file path where project data is stored
 * @returns A Promise that resolves to an array of ProjectDetails
 * @throws Will throw an error if the file cannot be read
 * @throws Will throw an error if the file cannot be parsed
 * @throws Will throw an error if the file does not exist
 */
export async function getStoredProjectsList(
    storeDir: string,
): Promise<ProjectDetails[]> {
    const { projects } = await getProjectsSnapshot(storeDir);
    return projects;
}

/**
 * Removes a project from the stored projects list based on its path.
 *
 * @param storeDir - The directory path where project data is stored
 * @param projectPath - The path of the project to be removed from the list
 * @returns A Promise that resolves to the updated array of ProjectDetails after removal
 */
export async function removeProjectFromList(
    storeDir: string,
    projectPath: string,
): Promise<ProjectDetails[]> {
    const store = ensureProjectsStore(storeDir);
    const updated = await store.update((projects) =>
        projects.filter((p) => p.path !== projectPath),
    );
    return normalizeProjects(updated);
}

/**
 * Adds a project to the stored projects list.
 *
 * If the project already exists in the list (identified by its path), it will be replaced with the new project details.
 * Otherwise, the project will be added to the end of the list.
 * The list is then sorted by the last opened date, and stored.
 *
 * @async
 * @param {string} storeDir - The directory where the projects list is stored.
 * @param {ProjectDetails} project - The project details to add or update.
 * @returns {Promise<ProjectDetails[]>} A promise that resolves to the updated list of project details.
 */
export async function addProjectToList(
    storeDir: string,
    project: ProjectDetails,
): Promise<ProjectDetails[]> {
    const store = ensureProjectsStore(storeDir);

    const updated = await store.update((projects) => {
        const list = [...projects];
        const incoming = {
            ...project,
            last_opened: toDate(project.last_opened),
        };

        const existingIndex = list.findIndex((p) => p.path === incoming.path);

        if (existingIndex !== -1) {
            list[existingIndex] = incoming;
        } else {
            list.push(incoming);
        }

        list.sort(
            (a, b) =>
                (toDate(a.last_opened)?.getTime() ?? 0) -
                (toDate(b.last_opened)?.getTime() ?? 0),
        );

        return list;
    });

    return normalizeProjects(updated);
}

export function __resetProjectsStoreForTesting(): void {
    projectsStore = null;
    projectsPath = null;
    __resetJsonStoreFactoryForTesting();
    __resetJsonStoreForTesting();
}
