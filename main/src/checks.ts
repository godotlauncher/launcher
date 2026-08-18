import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectDetails } from '@shared/contracts';
import logger from 'electron-log';

import { getCurrentAppConfig } from './config/index.js';
import { PROJECTS_FILENAME } from './constants.js';
import type { GitService } from './tool-integration/integrations/git/git.service.js';
import { SetProjectEditorRelease } from './utils/godot.utils.js';
import {
    getProjectIconUrlFromParsed,
    parseGodotProjectFile,
} from './utils/godotProject.utils.js';
import { JsonStoreConflictError } from './utils/jsonStore.js';
import { getDefaultDirs } from './utils/platform.utils.js';
import {
    getProjectsSnapshot,
    storeProjectsList,
} from './utils/projects.utils.js';

const PROJECT_VALIDATION_MAX_ATTEMPTS = 2;
const VALIDATION_PATH_CHECK_TIMEOUT_MS = 1500;

type ProjectValidationOptions = {
    repairMissingLaunchPath?: boolean;
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
 * Revalidates stored projects and persists their current state.
 *
 * @param options - Project validation behavior.
 * @param gitService - Optional Git service for repository inspection.
 * @returns The validated project list.
 */
export async function checkAndUpdateProjects(
    options: ProjectValidationOptions = {},
    gitService?: GitService,
): Promise<ProjectDetails[]> {
    logger.info('Checking and updating projects');

    const { configDir } = getDefaultDirs();
    // get projects
    const projectsFile = path.resolve(configDir, PROJECTS_FILENAME);
    for (
        let attempt = 0;
        attempt < PROJECT_VALIDATION_MAX_ATTEMPTS;
        attempt++
    ) {
        const { projects, version } = await getProjectsSnapshot(projectsFile);
        const validated: ProjectDetails[] = [];

        for (const project of projects) {
            validated.push(
                await checkProjectValid(project, options, gitService),
            );
        }

        try {
            return await storeProjectsList(projectsFile, validated, {
                expectedVersion: version,
            });
        } catch (error) {
            if (
                error instanceof JsonStoreConflictError &&
                attempt < PROJECT_VALIDATION_MAX_ATTEMPTS - 1
            ) {
                logger.warn('Project list changed during validation, retrying');
                continue;
            }
            throw error;
        }
    }

    throw new Error(
        'Failed to validate project list due to concurrent modifications',
    );
}

/**
 * Revalidates one project and refreshes its derived metadata.
 *
 * @param project - Project details to validate.
 * @param options - Project validation behavior.
 * @param gitService - Optional Git service for repository inspection.
 * @returns The updated project details.
 */
export async function checkProjectValid(
    project: ProjectDetails,
    options: ProjectValidationOptions = {},
    gitService?: GitService,
): Promise<ProjectDetails> {
    if (getCurrentAppConfig().docsScreenshots) {
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

    if (gitService) {
        const gitInspection = await gitService.inspectRepository(project.path);
        if (
            gitInspection.status === 'inside-work-tree' ||
            gitInspection.status === 'not-a-repository'
        ) {
            project.withGit = gitInspection.status === 'inside-work-tree';
        }
    }

    return project;
}
