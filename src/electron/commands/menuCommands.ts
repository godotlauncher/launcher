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
import { t } from '../i18n/index.js';




export async function showProjectMenu(project: ProjectDetails): Promise<void> {
    const mainWindow = getMainWindow();

    const menu = Menu.buildFromTemplate([
        {
            icon: getThemedMenuIcon('open-folder'),
            label: t('menus:project.openProjectFolder'),
            enabled: project.path.length > 0,
            click: () => {
                shell.openPath(project.path);
            }
        },
        {
            icon: getThemedMenuIcon('open-folder'),
            label: t('menus:project.openEditorSettingsFolder'),
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
            label: t('menus:project.openWindowed'),
            toolTip: t('menus:project.openWindowedTooltip'),
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
            label: t('menus:project.exportEditorSettings'),
            enabled: (project.editor_settings_path.length > 0),
            click: async () => {
                const result = await dialog.showSaveDialog(mainWindow, {
                    title: t('dialogs:exportSettings.title'),
                    defaultPath: path.resolve(os.homedir(), `${path.basename(project.editor_settings_file)}`),

                    filters: [
                        { name: t('dialogs:exportSettings.allFiles'), extensions: ['*'] }
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
            label: t('menus:project.importEditorSettings'),
            enabled: project.editor_settings_path.length > 0 || project.launch_path.length > 0,
            click: async () => {

                // add confirmation that this will replace the current settings

                const confirm = await dialog.showMessageBox(mainWindow, {
                    type: 'warning',
                    noLink: true,
                    buttons: [t('dialogs:importSettings.continue'), t('dialogs:importSettings.cancel')],
                    title: t('dialogs:importSettings.title'),
                    message: t('dialogs:importSettings.message'),
                    detail: t('dialogs:importSettings.detail'),
                });
                if (confirm.response === 1) {
                    return;
                }

                const result = await dialog.showOpenDialog(mainWindow, {
                    title: t('dialogs:importSettings.selectFile'),
                    defaultPath: os.homedir(),
                    properties: ['openFile'],
                    filters: [
                        { name: t('dialogs:importSettings.textResource'), extensions: ['tres'] }
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
            label: t('menus:project.removeFromList'),
            click: async () => {

                const prefs = await getUserPreferences();

                if (prefs.confirm_project_remove) {
                    const result = await dialog.showMessageBox(mainWindow, {
                        type: 'warning',
                        buttons: [t('dialogs:removeProject.ok'), t('dialogs:removeProject.cancel')],
                        title: t('dialogs:removeProject.title'),
                        message: t('dialogs:removeProject.message', { projectName: project.name }),
                        detail: t('dialogs:removeProject.detail'),
                        checkboxLabel: t('dialogs:removeProject.doNotAskAgain'),
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
            label: t('menus:release.openInstalledFolder'),
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
            label: t('menus:release.startProjectManager'),
            click: async () => {
                await openProjectManager(release);
            },
        },
        {
            type: 'separator'
        },
        {
            icon: getThemedMenuIcon('bin'),
            label: t('menus:release.deleteRelease'),
            click: async () => {
                const result = await dialog.showMessageBox(getMainWindow(), {
                    type: 'warning',
                    buttons: [t('dialogs:removeRelease.ok'), t('dialogs:removeRelease.cancel')],
                    title: t('dialogs:removeRelease.title'),
                    message: t('dialogs:removeRelease.message', { version: release.version }),
                    detail: t('dialogs:removeRelease.detail'),
                });

                if (result.response === 0) {
                    // remove release
                    const result = await removeRelease(release);

                    if (result.success) {
                        ipcWebContentsSend('releases-updated', getMainWindow()?.webContents, result.releases);
                    }
                    else {
                        dialog.showErrorBox(t('dialogs:removeRelease.error'), result.error || t('dialogs:removeRelease.errorMessage'));
                    }

                }
            }
        }
    ]);
    menu.popup();
}