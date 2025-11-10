import * as fs from 'node:fs';
import * as path from 'node:path';
import logger from 'electron-log';

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
    getStoredInstalledReleases,
    saveStoredInstalledReleases,
} from './utils/releases.utils.js';

const PROJECT_VALIDATION_MAX_ATTEMPTS = 2;

export async function checkAndUpdateReleases(): Promise<InstalledRelease[]> {
    logger.info('Checking and updating releases');

    // get releases
    const releases = await getStoredInstalledReleases();

    // check that release path exist
    for (const release of releases) {
        const editorPathExists = fs.existsSync(release.editor_path);
        if (!editorPathExists) {
            logger.warn(`Release '${release.version}' has an invalid path`);
        }
        release.valid = editorPathExists;
    }

    // persist all releases, including invalid ones for recovery scenarios
    return await saveStoredInstalledReleases(releases);
}

export async function checkAndUpdateProjects(): Promise<ProjectDetails[]> {
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
            validated.push(await checkProjectValid(project));
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
): Promise<ProjectDetails> {
    logger.info(`Checking project '${project.name}'`);

    // check project path
    if (!fs.existsSync(path.resolve(project.path, 'project.godot'))) {
        logger.warn(`Project '${project.name}' has an invalid path`);
        project.valid = false;
    } else {
        project.valid = true;
    }

    // check release
    if (!fs.existsSync(project.release.editor_path)) {
        logger.warn(`Project '${project.name}' has an invalid release path`);
        project.valid = false;
        project.release.valid = false;
    } else {
        if (!fs.existsSync(project.launch_path)) {
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
    project.withGit = fs.existsSync(gitDirPath);

    const vscodeDirPath = path.resolve(project.path, '.vscode');
    const vscodeDirExists = fs.existsSync(vscodeDirPath);
    let editorSettingsEnableExternal = false;

    if (
        project.editor_settings_file &&
        fs.existsSync(project.editor_settings_file)
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
