import * as fs from 'node:fs';
import * as path from 'node:path';
import type { InstalledRelease, ProjectDetails } from '@shared';
import logger from 'electron-log';

import { getCurrentAppConfig } from './config/index.js';
import { PROJECTS_FILENAME } from './constants.js';
import { SetProjectEditorRelease } from './utils/godot.utils.js';
import { parseGodotProjectFile } from './utils/godotProject.utils.js';
import { JsonStoreConflictError } from './utils/jsonStore.js';
import { getDefaultDirs } from './utils/platform.utils.js';
import {
    getProjectsSnapshot,
    storeProjectsList,
} from './utils/projects.utils.js';
import {
    dedupeInstalledReleases,
    getStoredInstalledReleases,
    saveStoredInstalledReleases,
} from './utils/releases.utils.js';

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

export async function checkAndUpdateReleases(): Promise<InstalledRelease[]> {
    logger.info('Checking and updating releases');

    // get releases
    const releases = await getStoredInstalledReleases();

    // check that release path exist
    for (const release of releases) {
        if (getCurrentAppConfig().docsScreenshots) {
            release.valid = true;
            continue;
        }

        const editorPathExists = await pathExistsForValidation(
            release.editor_path,
        );
        if (!editorPathExists) {
            logger.warn(`Release '${release.version}' has an invalid path`);
        }
        release.valid = editorPathExists;
    }

    // persist all unique releases, including invalid ones for recovery scenarios
    return await saveStoredInstalledReleases(dedupeInstalledReleases(releases));
}

export async function checkAndUpdateProjects(
    options: ProjectValidationOptions = {},
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
            validated.push(await checkProjectValid(project, options));
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

export async function checkProjectValid(
    project: ProjectDetails,
    options: ProjectValidationOptions = {},
): Promise<ProjectDetails> {
    if (getCurrentAppConfig().docsScreenshots) {
        return project;
    }

    logger.info(`Checking project '${project.name}'`);

    // check project path
    if (
        !(await pathExistsForValidation(
            path.resolve(project.path, 'project.godot'),
        ))
    ) {
        logger.warn(`Project '${project.name}' has an invalid path`);
        project.valid = false;
    } else {
        project.valid = true;
    }

    // check release
    if (!(await pathExistsForValidation(project.release.editor_path))) {
        logger.warn(`Project '${project.name}' has an invalid release path`);
        project.valid = false;
        project.release.valid = false;
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

    const gitDirPath = path.resolve(project.path, '.git');
    project.withGit = await pathExistsForValidation(gitDirPath);

    const vscodeDirPath = path.resolve(project.path, '.vscode');
    const vscodeDirExists = await pathExistsForValidation(vscodeDirPath);
    let editorSettingsEnableExternal = false;

    if (
        project.editor_settings_file &&
        (await pathExistsForValidation(project.editor_settings_file))
    ) {
        try {
            const editorSettingsContent = await fs.promises.readFile(
                project.editor_settings_file,
                'utf-8',
            );
            const parsedSettings = parseGodotProjectFile(editorSettingsContent);
            const resourceSection = parsedSettings.get('resource');

            const useExternalValue =
                resourceSection?.get(
                    'text_editor/external/use_external_editor',
                ) ?? '';

            editorSettingsEnableExternal =
                useExternalValue.trim().toLowerCase() === 'true';
        } catch (error) {
            logger.warn(
                `Failed to read editor settings for project '${project.name}': ${String(
                    error,
                )}`,
            );
            editorSettingsEnableExternal = false;
        }
    }

    project.withVSCode = vscodeDirExists && editorSettingsEnableExternal;

    return project;
}
