import logger from 'electron-log';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { getDefaultDirs } from '../utils/platform.utils.js';
import { getStoredProjectsList, removeProjectFromList, storeProjectsList } from '../utils/projects.utils.js';
import { getUserPreferences } from './userPreferences.js';

import { ChildProcess, ChildProcessByStdio, spawn } from 'node:child_process';
import { checkProjectValid } from '../checks.js';
import { PROJECTS_FILENAME, TEMPLATE_DIR_NAME } from '../constants.js';
import { updateLinuxTray } from '../helpers/tray.helper.js';
import { getMainWindow } from '../main.js';
import { ipcWebContentsSend } from '../utils.js';
import { removeProjectEditor, getProjectDefinition, DEFAULT_PROJECT_DEFINITION } from '../utils/godot.utils.js';
import { createNewEditorSettings, updateEditorSettings } from '../utils/godotProject.utils.js';
import { addVSCodeNETLaunchConfig, addOrUpdateVSCodeRecommendedExtensions, updateVSCodeSettings } from '../utils/vscode.utils.js';
import { getAssetPath } from '../pathResolver.js';
import { t } from '../i18n/index.js';
import { getCachedTools } from '../services/toolCache.js';


export async function getProjectsDetails(): Promise<ProjectDetails[]> {
    const defaultDirs = getDefaultDirs();
    const { configDir } = defaultDirs;

    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);

    const projects = await getStoredProjectsList(projectListPath);
    return projects;
}

export async function storeProjectsDetails(projects: ProjectDetails[]): Promise<ProjectDetails[]> {
    const defaultDirs = getDefaultDirs();
    const { configDir } = defaultDirs;
    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);
    const storedProjects = await storeProjectsList(projectListPath, projects);

    return storedProjects;
}

export async function removeProject(project: ProjectDetails): Promise<ProjectDetails[]> {
    const defaultDirs = getDefaultDirs();
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
    const defaultDirs = getDefaultDirs();
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

    if (process.platform === 'linux') {
        // Linux, get the saved project as the tray does not update correctly
        project = projects.find(p => p.path === project.path) || project;
    }

    if (process.platform === 'darwin') {
        // macOS
        const options = ['-a', command, '--args', '--path', project.path, '-e'];
        if (project.open_windowed) {
            options.push('-w');
        }

        editor = spawn('open', options, { detached: true, stdio: 'ignore' });
    }
    else {
        const options = ['--path', project.path, '-e'];
        if (project.open_windowed) {
            options.push('-w');
        }
        editor = spawn(command, options, { detached: true, stdio: 'ignore' });
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

export async function setProjectVSCode(project: ProjectDetails, enable: boolean): Promise<ProjectDetails> {
    const { configDir } = getDefaultDirs();
    const projectListPath = path.resolve(configDir, PROJECTS_FILENAME);

    const projects = await getStoredProjectsList(projectListPath);
    const projectIndex = projects.findIndex(p => p.path === project.path);

    if (projectIndex === -1) {
        throw new Error(t('projects:toggleVSCode.errors.projectNotFound'));
    }

    const targetProject = projects[projectIndex];

    if (targetProject.withVSCode === enable) {
        return targetProject;
    }

    if (enable) {
        const cachedTools = await getCachedTools();
        const vsCodeTool = cachedTools.find(t => t.name === 'VSCode' && t.verified);

        if (!vsCodeTool) {
            throw new Error(t('projects:toggleVSCode.errors.vscodeNotInstalled'));
        }

        if (!targetProject.launch_path) {
            throw new Error(t('projects:toggleVSCode.errors.missingLaunchPath'));
        }

        const projectDefinition = getProjectDefinition(
            targetProject.release.version_number,
            DEFAULT_PROJECT_DEFINITION
        );

        if (!projectDefinition) {
            throw new Error(t('projects:toggleVSCode.errors.invalidProjectDefinition'));
        }

        const templatesDir = path.resolve(getAssetPath(), TEMPLATE_DIR_NAME);

        let vscodeExecPath = vsCodeTool.path;
        if (process.platform === 'darwin') {
            vscodeExecPath = path.resolve(vscodeExecPath, 'Contents', 'MacOS', 'Electron');
        }

        const editorSettingsFilename = projectDefinition.editorConfigFilename(targetProject.release.version_number);
        let editorSettingsFile = targetProject.editor_settings_file;

        if (!editorSettingsFile) {
            editorSettingsFile = path.resolve(
                path.dirname(targetProject.launch_path),
                'editor_data',
                editorSettingsFilename
            );
        }

        if (fs.existsSync(editorSettingsFile)) {
            await updateEditorSettings(editorSettingsFile, {
                execPath: vscodeExecPath,
                execFlags: '{project} --goto {file}:{line}:{col}',
                useExternalEditor: true,
                isMono: targetProject.release.mono,
            });
        }
        else {
            const createdEditorSettings = await createNewEditorSettings(
                templatesDir,
                targetProject.launch_path,
                editorSettingsFilename,
                projectDefinition.editorConfigFormat,
                true,
                vscodeExecPath,
                '{project} --goto {file}:{line}:{col}',
                targetProject.release.mono,
            );
            editorSettingsFile = createdEditorSettings;
        }

        targetProject.editor_settings_file = editorSettingsFile;
        targetProject.editor_settings_path = path.dirname(editorSettingsFile);

        await updateVSCodeSettings(
            targetProject.path,
            targetProject.launch_path,
            targetProject.release.version_number,
            targetProject.release.mono,
        );
        await addOrUpdateVSCodeRecommendedExtensions(targetProject.path, targetProject.release.mono);

        if (targetProject.release.mono) {
            await addVSCodeNETLaunchConfig(targetProject.path, targetProject.launch_path);
        }
    }
    else if (targetProject.editor_settings_file && fs.existsSync(targetProject.editor_settings_file)) {
        await updateEditorSettings(targetProject.editor_settings_file, {
            useExternalEditor: false,
        });
    }

    targetProject.withVSCode = enable;

    projects[projectIndex] = targetProject;
    const storedProjects = await storeProjectsList(projectListPath, projects);
    ipcWebContentsSend('projects-updated', getMainWindow()?.webContents, storedProjects);

    project.withVSCode = enable;
    project.editor_settings_file = targetProject.editor_settings_file;
    project.editor_settings_path = targetProject.editor_settings_path;

    return targetProject;
}
