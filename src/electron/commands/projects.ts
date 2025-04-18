import * as path from 'node:path';
import logger from 'electron-log';

import { getDefaultDirs } from '../utils/platform.utils.js';
import { getStoredProjectsList, removeProjectFromList, storeProjectsList } from '../utils/projects.utils.js';
import { getUserPreferences } from './userPreferences.js';

import { getMainWindow } from '../main.js';
import { checkProjectValid } from '../checks.js';
import { PROJECTS_FILENAME } from '../constants.js';
import { ipcWebContentsSend } from '../utils.js';
import { removeProjectEditor } from '../utils/godot.utils.js';
import { ChildProcess, ChildProcessByStdio, spawn } from 'node:child_process';
import { updateLinuxTray } from '../helpers/tray.helper.js';


const defaultDirs = getDefaultDirs();

export async function getProjectsDetails(): Promise<ProjectDetails[]> {

    const { configDir } = defaultDirs;

    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);

    const projects = await getStoredProjectsList(projectListPath);
    return projects;
}

export async function storeProjectsDetails(projects: ProjectDetails[]): Promise<ProjectDetails[]> {
    const { configDir } = defaultDirs;
    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);
    const storedProjects = await storeProjectsList(projectListPath, projects);

    return storedProjects;
}

export async function removeProject(project: ProjectDetails): Promise<ProjectDetails[]> {
    const { configDir } = defaultDirs;
    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);

    // remove .editor_settings link to godot
    // await removeEditorSymlink(project.launch_path);
    await removeProjectEditor(project);


    const projects = await removeProjectFromList(projectListPath, project.path);
    if (process.platform === 'linux') {
        await updateLinuxTray();
    }

    return projects;
}

export async function launchProject(project: ProjectDetails): Promise<void> {
    const { configDir } = defaultDirs;
    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);

    const prefs = await getUserPreferences();
    const command = project.launch_path;

    let projects = await getProjectsDetails();

    // update last opened
    const projectIndex = projects.findIndex(p => p.path === project.path);
    if (projectIndex !== -1) {
        projects[projectIndex].last_opened = new Date();
    }

    projects = await storeProjectsList(projectListPath, projects);

    let editor: ChildProcess | ChildProcessByStdio<null, null, null> | null = null;

    // const stdio = ['ignore', 'inherit', 'inherit'];

    if (process.platform === 'darwin') {
        editor = spawn('open', ['-a', command, '--args', '--path', project.path, '-e', '-w'], { detached: true, stdio: 'ignore' });
    }
    else {
        editor = spawn(command, ['--path', project.path, '-e', '-w'], { detached: true, stdio: 'ignore' });
    }

    editor.on('error', (err: Error) => {
        logger.error(`Failed to start process: ${err.message}`);
    });

    editor.on('exit', (code: number, signal: NodeJS.Signals | null) => {
        if (code !== 0 && code !== null) {
            logger.error(`Editor exited with error code ${code}`);
            logger.error(editor.stderr);
        } else if (signal) {
            logger.error(`Editor was killed by signal: ${signal}`);
        }
    });

    editor.unref();

    const currentMainWindow = getMainWindow();

    switch (prefs.post_launch_action) {
        case 'minimize':
            currentMainWindow?.minimize();
            break;
        case 'close_to_tray':
            currentMainWindow?.close();
            break;
    }

    if (process.platform === 'linux') {
        await updateLinuxTray();
    }

    ipcWebContentsSend('projects-updated', currentMainWindow?.webContents, projects);
}

export async function checkProjectIsValid(project: ProjectDetails): Promise<ProjectDetails> {
    return await checkProjectValid(project);
}

export async function setProjectWindowed(project: ProjectDetails, openWindowed: boolean): Promise<ProjectDetails> {

    project.open_windowed = openWindowed;


    const projects = await getProjectsDetails();
    const projectIndex = projects.findIndex(p => p.path === project.path);

    if (projectIndex !== -1) {
        projects[projectIndex].open_windowed = openWindowed;
        const updated = await storeProjectsDetails(projects);
        ipcWebContentsSend('projects-updated', getMainWindow()?.webContents, updated);
    }

    return project;
}
