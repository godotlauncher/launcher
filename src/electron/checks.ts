import logger from 'electron-log';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { INSTALLED_RELEASES_FILENAME, PROJECTS_FILENAME } from './constants.js';
import { SetProjectEditorRelease } from './utils/godot.utils.js';
import { getDefaultDirs } from './utils/platform.utils.js';
import {
    getStoredProjectsList,
    storeProjectsList,
} from './utils/projects.utils.js';
import {
    getStoredInstalledReleases,
    saveStoredInstalledReleases,
} from './utils/releases.utils.js';

export async function checkAndUpdateReleases(): Promise<InstalledRelease[]> {
    logger.info('Checking and updating releases');

    const { configDir } = getDefaultDirs();

    // get releases
    const releasesFile = path.resolve(configDir, INSTALLED_RELEASES_FILENAME);
    const releases = await getStoredInstalledReleases(releasesFile);

    // check that release path exist
    for (const release of releases) {
        if (!fs.existsSync(release.editor_path)) {
            logger.warn(`Release '${release.version}' has an invalid path`);
            release.valid = false;
        } else {
            release.valid = true;
        }
    }

    // remove invalid releases and save
    return await saveStoredInstalledReleases(
        releasesFile,
        releases.filter((r) => r.valid)
    );
}

export async function checkAndUpdateProjects(): Promise<ProjectDetails[]> {
    logger.info('Checking and updating projects');

    const { configDir } = getDefaultDirs();
    // get projects
    const projectsFile = path.resolve(configDir, PROJECTS_FILENAME);
    const projects = await getStoredProjectsList(projectsFile);

    // check that project path exist and has a project.godot file
    for (let i = 0; i < projects.length; i++) {
        const project = projects[i];
        projects[i] = await checkProjectValid(project);
    }

    // update the projects file
    return await storeProjectsList(projectsFile, projects);
}

export async function checkProjectValid(
    project: ProjectDetails
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
                project.release
            );
        }
        project.release.valid = true;
    }

    return project;
}
