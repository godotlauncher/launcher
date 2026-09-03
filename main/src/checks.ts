import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectDetails } from '@shared/contracts';
import logger from 'electron-log';

import { getCurrentAppConfig } from './config/index.js';
import type { ProjectsStore } from './projects/projects.store.js';
import type {
    GitRepositoryInspector,
    GitService,
} from './tool-integration/integrations/git/git.service.js';
import { SetProjectEditorRelease } from './utils/godot.utils.js';
import {
    getProjectIconPathFromParsed,
    getProjectIconUrlFromParsed,
    parseGodotProjectFile,
    readProjectIconUrl,
} from './utils/godotProject.utils.js';

const VALIDATION_PATH_CHECK_TIMEOUT_MS = 1500;
const PROJECT_VALIDATION_CONCURRENCY = 4;

type FileSignature = {
    mtimeMs: number;
    size: number;
};

type ProjectIconCacheEntry = {
    projectFile: FileSignature;
    iconPath?: string;
    iconFile?: FileSignature;
    iconUrl?: string;
};

const projectIconCache = new Map<string, ProjectIconCacheEntry>();

export type ProjectValidationOptions = {
    repairMissingLaunchPath?: boolean;
    publishResult?: boolean;
};

async function pathExistsForValidation(pathToCheck: string): Promise<boolean> {
    let timeout: NodeJS.Timeout | undefined;

    const exists = fs.promises
        .access(pathToCheck)
        .then(() => true)
        .catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
                return false;
            }

            logger.warn(
                `Failed to validate path '${pathToCheck}': ${error.message}`,
            );
            return false;
        });

    const timedOut = new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => {
            logger.warn(
                `Path validation timed out for '${pathToCheck}' after ${VALIDATION_PATH_CHECK_TIMEOUT_MS}ms`,
            );
            resolve(false);
        }, VALIDATION_PATH_CHECK_TIMEOUT_MS);
    });

    try {
        return await Promise.race([exists, timedOut]);
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Reads a bounded file signature for quick health checks.
 *
 * @param pathToCheck - Exact path to inspect.
 * @returns The file signature, or undefined when missing or unavailable.
 */
async function getFileSignature(
    pathToCheck: string,
): Promise<FileSignature | undefined> {
    let timeout: NodeJS.Timeout | undefined;
    const signature = fs.promises
        .stat(pathToCheck)
        .then(({ mtimeMs, size }) => ({ mtimeMs, size }))
        .catch(() => undefined);
    const timedOut = new Promise<undefined>((resolve) => {
        timeout = setTimeout(
            () => resolve(undefined),
            VALIDATION_PATH_CHECK_TIMEOUT_MS,
        );
    });

    try {
        return await Promise.race([signature, timedOut]);
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Reports whether two file signatures identify unchanged content metadata.
 *
 * @param first - First signature.
 * @param second - Second signature.
 * @returns Whether modification time and size match.
 */
function signaturesMatch(
    first: FileSignature | undefined,
    second: FileSignature | undefined,
): boolean {
    return first?.mtimeMs === second?.mtimeMs && first?.size === second?.size;
}

/**
 * Refreshes one cached project icon only when its source metadata changed.
 *
 * @param project - Project whose icon should be refreshed.
 * @param projectFile - Current project.godot signature.
 * @returns The cached or refreshed renderer-safe icon URL.
 */
async function refreshProjectIcon(
    project: ProjectDetails,
    projectFile: FileSignature,
): Promise<string | undefined> {
    const cached = projectIconCache.get(project.path);
    if (cached && signaturesMatch(cached.projectFile, projectFile)) {
        if (!cached.iconPath) {
            return cached.iconUrl;
        }

        const iconFile = await getFileSignature(cached.iconPath);
        if (signaturesMatch(cached.iconFile, iconFile)) {
            return cached.iconUrl;
        }

        const iconUrl = iconFile
            ? await readProjectIconUrl(cached.iconPath)
            : undefined;
        projectIconCache.set(project.path, {
            ...cached,
            iconFile,
            iconUrl,
        });
        return iconUrl;
    }

    try {
        const projectFileContent = await fs.promises.readFile(
            path.resolve(project.path, 'project.godot'),
            'utf-8',
        );
        const parsedProject = parseGodotProjectFile(projectFileContent);
        const iconPath = getProjectIconPathFromParsed(
            project.path,
            parsedProject,
        );
        const iconFile = iconPath
            ? await getFileSignature(iconPath)
            : undefined;
        const iconUrl =
            iconPath && iconFile
                ? await readProjectIconUrl(iconPath)
                : undefined;
        projectIconCache.set(project.path, {
            projectFile,
            iconPath,
            iconFile,
            iconUrl,
        });
        return iconUrl;
    } catch {
        projectIconCache.set(project.path, { projectFile });
        return undefined;
    }
}

/**
 * Seeds the in-memory icon cache during a full project validation.
 *
 * @param project - Validated project.
 * @param parsedProject - Parsed project.godot contents.
 * @param projectFilePath - Exact project.godot path.
 */
async function cacheValidatedProjectIcon(
    project: ProjectDetails,
    parsedProject: ReturnType<typeof parseGodotProjectFile>,
    projectFilePath: string,
): Promise<void> {
    const projectFile = await getFileSignature(projectFilePath);
    if (!projectFile) {
        projectIconCache.delete(project.path);
        return;
    }

    const iconPath = getProjectIconPathFromParsed(project.path, parsedProject);
    const iconFile = iconPath ? await getFileSignature(iconPath) : undefined;
    projectIconCache.set(project.path, {
        projectFile,
        iconPath,
        iconFile,
        iconUrl: project.icon_path,
    });
}

/**
 * Reports whether renderer-visible project health changed.
 *
 * @param before - Project state before checking.
 * @param after - Project state after checking.
 * @returns Whether health or icon presentation changed.
 */
export function hasProjectHealthChanged(
    before: ProjectDetails,
    after: ProjectDetails,
): boolean {
    return (
        before.valid !== after.valid ||
        before.invalid_reason !== after.invalid_reason ||
        before.release.valid !== after.release.valid ||
        before.icon_path !== after.icon_path
    );
}

/**
 * Revalidates stored projects and persists their current state.
 *
 * @param options - Project validation behavior.
 * @param gitService - Optional Git service for repository inspection.
 * @param projectsStore - Canonical project store.
 * @returns The validated project list.
 */
export async function checkAndUpdateProjects(
    options: ProjectValidationOptions = {},
    gitService: GitService | undefined,
    projectsStore: ProjectsStore,
): Promise<ProjectDetails[]> {
    logger.info('Checking and updating projects');

    return projectsStore.update(async (projects) => {
        const validated = new Array<ProjectDetails>(projects.length);
        const gitInspector =
            gitService && projects.length > 0
                ? await gitService.createRepositoryInspectionSession()
                : undefined;
        let nextIndex = 0;

        /** Validates successive projects until the shared queue is empty. */
        const validateNext = async (): Promise<void> => {
            while (nextIndex < projects.length) {
                const projectIndex = nextIndex;
                nextIndex += 1;
                validated[projectIndex] = await checkProjectValid(
                    projects[projectIndex],
                    options,
                    gitInspector,
                );
            }
        };

        await Promise.all(
            Array.from(
                {
                    length: Math.min(
                        projects.length,
                        PROJECT_VALIDATION_CONCURRENCY,
                    ),
                },
                () => validateNext(),
            ),
        );
        return validated;
    });
}

/**
 * Quickly revalidates project paths and cached icons in parallel.
 *
 * @param projectsStore - Canonical project store.
 * @returns The updated projects and whether renderer-visible health changed.
 */
export async function checkAndUpdateProjectHealth(
    projectsStore: ProjectsStore,
): Promise<{ projects: ProjectDetails[]; changed: boolean }> {
    let changed = false;
    const projects = await projectsStore.update(async (currentProjects) => {
        const currentPaths = new Set(
            currentProjects.map((project) => project.path),
        );
        for (const projectPath of projectIconCache.keys()) {
            if (!currentPaths.has(projectPath)) {
                projectIconCache.delete(projectPath);
            }
        }

        return Promise.all(
            currentProjects.map(async (project) => {
                const checked = await checkProjectHealth(project);
                changed ||= hasProjectHealthChanged(project, checked);
                return checked;
            }),
        );
    });
    return { projects, changed };
}

/**
 * Quickly validates one project without Git inspection or path repair.
 *
 * @param project - Project to check.
 * @returns The project with current path and icon health.
 */
export async function checkProjectHealth(
    project: ProjectDetails,
): Promise<ProjectDetails> {
    if (getCurrentAppConfig().e2eFixtures) {
        return project;
    }

    const checked: ProjectDetails = {
        ...project,
        release: { ...project.release },
    };
    const projectFilePath = path.resolve(project.path, 'project.godot');
    const [projectFile, releaseEditorExists] = await Promise.all([
        getFileSignature(projectFilePath),
        pathExistsForValidation(project.release.editor_path),
    ]);

    checked.valid = Boolean(projectFile) && releaseEditorExists;
    checked.release.valid = releaseEditorExists;
    delete checked.invalid_reason;

    if (!projectFile) {
        checked.icon_path = undefined;
        checked.invalid_reason = 'missing_project_file';
        projectIconCache.delete(project.path);
    } else {
        checked.icon_path = await refreshProjectIcon(checked, projectFile);
    }

    if (!releaseEditorExists) {
        checked.invalid_reason = checked.invalid_reason ?? 'missing_editor';
    }

    return checked;
}

/**
 * Revalidates one project and refreshes its derived metadata.
 *
 * @param project - Project details to validate.
 * @param options - Project validation behavior.
 * @param gitInspector - Optional Git repository inspection boundary.
 * @returns The updated project details.
 */
export async function checkProjectValid(
    project: ProjectDetails,
    options: ProjectValidationOptions = {},
    gitInspector?: GitRepositoryInspector,
): Promise<ProjectDetails> {
    if (getCurrentAppConfig().e2eFixtures) {
        return project;
    }

    logger.info(`Checking project '${project.name}'`);

    // check project path
    const projectFilePath = path.resolve(project.path, 'project.godot');
    const projectFileExists = await pathExistsForValidation(projectFilePath);
    project.valid = projectFileExists;
    project.icon_path = undefined;
    delete project.invalid_reason;

    if (!projectFileExists) {
        logger.warn(`Project '${project.name}' has an invalid path`);
        project.invalid_reason = 'missing_project_file';
        projectIconCache.delete(project.path);
    } else {
        try {
            const projectFileContent = await fs.promises.readFile(
                projectFilePath,
                'utf-8',
            );
            const parsedProject = parseGodotProjectFile(projectFileContent);
            project.icon_path = getProjectIconUrlFromParsed(
                project.path,
                parsedProject,
            );
            await cacheValidatedProjectIcon(
                project,
                parsedProject,
                projectFilePath,
            );
        } catch (error) {
            logger.warn(
                `Failed to read project icon for '${project.name}': ${String(
                    error,
                )}`,
            );
        }
    }

    // check release
    const releaseEditorExists = await pathExistsForValidation(
        project.release.editor_path,
    );
    if (!releaseEditorExists) {
        logger.warn(`Project '${project.name}' has an invalid release path`);
        project.valid = false;
        project.release.valid = false;
        project.invalid_reason = project.invalid_reason ?? 'missing_editor';
    } else {
        if (
            options.repairMissingLaunchPath !== false &&
            !(await pathExistsForValidation(project.launch_path))
        ) {
            logger.warn(`Restoring launch path for Project '${project.name}'`);
            // await setEditorSymlink(path.dirname(project.launch_path), project.release.editor_path);
            await SetProjectEditorRelease(
                path.dirname(project.launch_path),
                project.release,
            );
        }
        project.release.valid = true;
    }

    if (gitInspector) {
        const gitInspection = await gitInspector.inspectRepository(
            project.path,
        );
        if (
            gitInspection.status === 'inside-work-tree' ||
            gitInspection.status === 'not-a-repository'
        ) {
            project.withGit = gitInspection.status === 'inside-work-tree';
        }
    }

    return project;
}
