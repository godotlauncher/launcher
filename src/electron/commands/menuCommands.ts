import * as fs from 'node:fs';
import * as os from 'os';
import * as path from 'node:path';

import { dialog, Menu, shell } from 'electron';
import { getMainWindow } from '../main.js';
import { getThemedMenuIcon, ipcWebContentsSend } from '../utils.js';
import { removeProject, setProjectWindowed } from './projects.js';
import { getUserPreferences, setUserPreferences } from './userPreferences.js';
import { removeRelease } from './removeRelease.js';
import { openProjectManager } from './releases.js';




export async function showProjectMenu(project: ProjectDetails): Promise<void> {
    const mainWindow = getMainWindow();

    const menu = Menu.buildFromTemplate([
        {
            icon: getThemedMenuIcon('open-folder'),
            label: 'Open Project Folder',
            enabled: project.path.length > 0,
            click: () => {
                shell.openPath(project.path);
            }
        },
        {
            icon: getThemedMenuIcon('open-folder'),
            label: 'Open Editor Settings Folder',
            enabled: (project.editor_settings_path && project.editor_settings_path.length > 0) || false,
            click: () => {
                shell.openPath(project.editor_settings_path);
            }
        },
        {
            type: 'separator'
        },
        {
            icon: getThemedMenuIcon(project.open_windowed ? 'checkbox-checked' : 'checkbox'),
            label: 'Open Windowed',
            toolTip: 'When this option is checked, Godot will launch in windowed mode.',
            type: 'normal',
            checked: project.open_windowed,
            click: async () => {
                project = await setProjectWindowed(project, !project.open_windowed);
            }
        },
        {
            type: 'separator'
        },
        {
            // export editor settings
            icon: getThemedMenuIcon('file-export'),
            label: 'Export Editor Settings to File',
            enabled: (project.editor_settings_path.length > 0),
            click: async () => {
                const result = await dialog.showSaveDialog(mainWindow, {
                    title: 'Export Editor Settings to File',
                    defaultPath: path.resolve(os.homedir(), `${path.basename(project.editor_settings_file)}`),

                    filters: [
                        { name: 'All Files', extensions: ['*'] }
                    ]
                });

                if (!result.canceled) {
                    await fs.promises.copyFile(project.editor_settings_file, result.filePath);
                }
            }
        },
        {
            // import editor settings
            icon: getThemedMenuIcon('file-save'),
            label: 'Import Editor Settings from File',
            enabled: project.editor_settings_path.length > 0 || project.launch_path.length > 0,
            click: async () => {

                // add confirmation that this will replace the current settings

                const confirm = await dialog.showMessageBox(mainWindow, {
                    type: 'warning',
                    noLink: true,
                    buttons: ['Continue', 'Cancel'],
                    title: 'Import Editor Settings',
                    message: 'Are you sure you want to import the editor settings from a file ?',
                    detail: 'This will replace the current editor settings. A backup will be created.',
                });
                if (confirm.response === 1) {
                    return;
                }

                const result = await dialog.showOpenDialog(mainWindow, {
                    title: 'Import Editor Settings File',
                    defaultPath: os.homedir(),
                    properties: ['openFile'],
                    filters: [
                        { name: 'Text Resource', extensions: ['tres'] }
                    ]
                });

                if (!result.canceled) {
                    const savePath =
                        (project.editor_settings_file.length > 0 ? project.editor_settings_file : undefined) ||
                        path.resolve(path.dirname(project.launch_path), 'editor_data', path.basename(result.filePaths[0]));

                    if (fs.existsSync(project.editor_settings_file)) {
                        await fs.promises.copyFile(project.editor_settings_file, path.resolve(path.dirname(project.editor_settings_file), `${path.basename(project.editor_settings_file)}.${Date.now()}.bak`));
                    }

                    await fs.promises.copyFile(result.filePaths[0], savePath);
                }
            }
        },
        {
            type: 'separator'
        },
        {
            icon: getThemedMenuIcon('bin'),
            label: 'Remove Project From List',
            click: async () => {

                const prefs = await getUserPreferences();

                if (prefs.confirm_project_remove) {
                    const result = await dialog.showMessageBox(mainWindow, {
                        type: 'warning',
                        buttons: ['Ok', 'Cancel'],
                        title: 'Remove Project from List',
                        message: `Are you sure you want to remove the project "${project.name}" from the list ? `,
                        detail: 'This will not delete the project on your device.',
                        checkboxLabel: 'Do not ask me again',
                        checkboxChecked: false
                    });

                    if (result.checkboxChecked) {
                        prefs.confirm_project_remove = false;
                        await setUserPreferences(prefs);
                    }

                    if (result.response === 0) {
                        const projects = await removeProject(project);
                        ipcWebContentsSend('projects-updated', mainWindow?.webContents, projects);
                    }
                }
                else {
                    const projects = await removeProject(project);
                    ipcWebContentsSend('projects-updated', mainWindow?.webContents, projects);
                }
            }
        }
    ]);
    menu.popup();
}

export async function showReleaseMenu(release: InstalledRelease): Promise<void> {
    const menu = Menu.buildFromTemplate([
        {
            icon: getThemedMenuIcon('open-folder'),
            label: 'Open Installed Folder',
            enabled: release.install_path.length > 0,
            click: () => {
                shell.openPath(release.install_path);
            }
        },
        {
            type: 'separator'
        },
        {
            icon: getThemedMenuIcon('godot'),
            label: 'Start the Project Manager',
            click: async () => {
                await openProjectManager(release);
            },
        },
        {
            type: 'separator'
        },
        {
            icon: getThemedMenuIcon('bin'),
            label: 'Delete Release from This Device',
            click: async () => {
                const result = await dialog.showMessageBox(getMainWindow(), {
                    type: 'warning',
                    buttons: ['Ok', 'Cancel'],
                    title: 'Remove Release',
                    message: `Are you sure you want to delete release "${release.version}" ?`,
                    detail: 'This will delete the release from  your device. You can install it again later.',
                });

                if (result.response === 0) {
                    // remove release
                    const result = await removeRelease(release);

                    if (result.success) {
                        ipcWebContentsSend('releases-updated', getMainWindow()?.webContents, result.releases);
                    }
                    else {
                        dialog.showErrorBox('Error', result.error || 'An error occurred while removing the release.');
                    }

                }
            }
        }
    ]);
    menu.popup();
}