import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectDetails } from '@shared/contracts';
import logger from 'electron-log';

import { getCurrentAppConfig } from './config/index.js';
import type { ProjectsStore } from './projects/projects.store.js';
import type { GitService } from './tool-integration/integrations/git/git.service.js';
import { SetProjectEditorRelease } from './utils/godot.utils.js';
import {
    getProjectIconUrlFromParsed,
    parseGodotProjectFile,
} from './utils/godotProject.utils.js';

const VALIDATION_PATH_CHECK_TIMEOUT_MS = 1500;

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
        const validated: ProjectDetails[] = [];

        for (const project of projects) {
            validated.push(
                await checkProjectValid(project, options, gitService),
            );
        }
        return validated;
    });
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
