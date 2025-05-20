import * as fs from 'node:fs';

import { ipcMainHandler } from './utils.js';
import {
    getConfigDir,
    getDefaultPrefs,
    getPrefsPath,
    setAutoCheckUpdates,
} from './utils/prefs.utils.js';

import { getInstalledTools } from './commands/installedTools.js';
import {
    getUserPreferences,
    setUserPreferences,
} from './commands/userPreferences.js';
import {
    openDirectoryDialog,
    openFileDialog,
    openShellFolder,
} from './commands/shellFolders.js';
import {
    getAvailablePrereleases,
    getAvailableReleases,
    getInstalledReleases,
    openProjectManager,
} from './commands/releases.js';
import { installRelease } from './commands/installRelease.js';
import { removeRelease } from './commands/removeRelease.js';
import {
    checkProjectIsValid,
    getProjectsDetails,
    launchProject,
    removeProject,
} from './commands/projects.js';
import { setProjectEditor } from './commands/setProjectEditor.js';
import { createProject } from './commands/createProject.js';
import { addProject } from './commands/addProject.js';
import { checkAndUpdateProjects, checkAndUpdateReleases } from './checks.js';
import { showProjectMenu, showReleaseMenu } from './commands/menuCommands.js';
import { app, shell } from 'electron';
import { setAutoStart } from './utils/platform.utils.js';
import { checkForUpdates, installUpdateAndRestart } from './autoUpdater.js';

// create default folder if not exist
async function createDefaultFolder() {
    const configDir = await getConfigDir();
    const prefsPath = await getPrefsPath();

    if (!fs.existsSync(configDir)) {
        await fs.promises.mkdir(configDir, { recursive: true });
    }

    if (!fs.existsSync(prefsPath)) {
        const defaultPrefs = await getDefaultPrefs();
        await fs.promises.writeFile(
            prefsPath,
            JSON.stringify(defaultPrefs, null, 4)
        );
    }
}

// createDefaultFolder(); // Commented out direct call

export { createDefaultFolder }; // Export the function

export function registerHandlers() {
    // ##### user-preferences #####

    ipcMainHandler(
        'get-user-preferences',
        async () => await getUserPreferences()
    );

    ipcMainHandler(
        'set-user-preferences',
        async (_, newPrefs: UserPreferences) => await setUserPreferences(newPrefs)
    );

    ipcMainHandler(
        'shell-open-folder',
        async (_, pathToOpen) => await openShellFolder(pathToOpen)
    );

    ipcMainHandler(
        'open-external',
        async (_, url) => await shell.openExternal(url)
    );

    ipcMainHandler(
        'set-auto-start',
        async (_, autoStart, hidden) => await setAutoStart(autoStart, hidden)
    );

    ipcMainHandler(
        'set-auto-check-updates',
        async (_, enabled) => await setAutoCheckUpdates(enabled)
    );

    ipcMainHandler(
        'install-update-and-restart',
        async () => await installUpdateAndRestart()
    );

    // ##### releases #####

    ipcMainHandler(
        'get-available-releases',
        async () => await getAvailableReleases()
    );

    ipcMainHandler(
        'get-available-prereleases',
        async () => await getAvailablePrereleases()
    );

    ipcMainHandler(
        'get-installed-releases',
        async () => await getInstalledReleases()
    );

    ipcMainHandler(
        'install-release',
        async (_, release, mono) => await installRelease(release, mono)
    );

    ipcMainHandler(
        'remove-release',
        async (_, installedRelease) => await removeRelease(installedRelease)
    );

    ipcMainHandler(
        'open-editor-project-manager',
        async (_, release) => await openProjectManager(release)
    );
    ipcMainHandler(
        'check-all-releases-valid',
        async () => await checkAndUpdateReleases()
    );

    // ##### projects #####

    ipcMainHandler(
        'create-project',
        async (
            _,
            name: string,
            release: InstalledRelease,
            renderer: RendererType,
            withVSCode: boolean,
            withGit: boolean
        ) => await createProject(name, release, renderer, withVSCode, withGit)
    );

    ipcMainHandler(
        'get-projects-details',
        async () => await getProjectsDetails()
    );

    ipcMainHandler(
        'remove-project',
        async (_, project: ProjectDetails) => await removeProject(project)
    );

    ipcMainHandler(
        'add-project',
        async (_, projectPath: string) => await addProject(projectPath)
    );

    ipcMainHandler(
        'set-project-editor',
        async (_, project: ProjectDetails, newRelease: InstalledRelease) =>
            await setProjectEditor(project, newRelease)
    );

    ipcMainHandler('launch-project', async (_, project: ProjectDetails) =>
        launchProject(project)
    );

    ipcMainHandler(
        'check-project-valid',
        async (_, project: ProjectDetails) => await checkProjectIsValid(project)
    );

    ipcMainHandler(
        'check-all-projects-valid',
        async () => await checkAndUpdateProjects()
    );

    // ##### dialogs #####

    ipcMainHandler(
        'open-file-dialog',
        (_, defaultPath: string, title: string, filters: Electron.FileFilter[]) =>
            openFileDialog(defaultPath, title, filters)
    );

    ipcMainHandler(
        'open-directory-dialog',
        (_, defaultPath: string, title?: string, filters?: Electron.FileFilter[]) =>
            openDirectoryDialog(defaultPath, title, filters)
    );

    ipcMainHandler('show-project-menu', (_, project: ProjectDetails) =>
        showProjectMenu(project)
    );

    ipcMainHandler('show-release-menu', (_, release: InstalledRelease) =>
        showReleaseMenu(release)
    );

    // ##### tools #####

    ipcMainHandler('get-installed-tools', async () => await getInstalledTools());

    ipcMainHandler('relaunch-app', async () => {
        app.relaunch();
        app.exit();
    });

    ipcMainHandler('check-updates', async () => checkForUpdates());

    ipcMainHandler('get-platform', async () => {
        return process.platform;
    });

    ipcMainHandler('get-app-version', async () => {
        return app.getVersion();
    });
}
