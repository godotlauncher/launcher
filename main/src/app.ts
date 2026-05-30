import * as fs from 'node:fs';
import type {
    AddProjectOptions,
    InstalledRelease,
    ProjectDetails,
    RendererType,
    UserPreferences,
} from '@shared';
import { app, shell } from 'electron';
import semver from 'semver';
import {
    checkForUpdates,
    downloadAppUpdate,
    installUpdateAndRestart,
    setBetaChannel,
} from './autoUpdater.js';
import { checkAndUpdateProjects, checkAndUpdateReleases } from './checks.js';
import { addProject } from './commands/addProject.js';
import { createProject } from './commands/createProject.js';
import {
    ensureDirectory,
    fileExists,
    pathExists,
} from './commands/fileSystem.js';
import { getInstalledTools } from './commands/installedTools.js';
import { installRelease } from './commands/installRelease.js';
import { showProjectMenu, showReleaseMenu } from './commands/menuCommands.js';
import {
    checkProjectIsValid,
    getProjectsDetails,
    launchProject,
    removeProject,
} from './commands/projects.js';
import { registerCustomEngine } from './commands/registerCustomEngine.js';
import { reinstallRelease } from './commands/reinstallRelease.js';
import {
    clearReleaseCaches,
    getAvailablePrereleases,
    getAvailableReleases,
    getInstalledReleases,
    openProjectManager,
} from './commands/releases.js';
import { removeRelease } from './commands/removeRelease.js';
import { setProjectEditor } from './commands/setProjectEditor.js';
import {
    openDirectoryDialog,
    openFileDialog,
    openShellFolder,
} from './commands/shellFolders.js';
import {
    getUserPreferences,
    setUserPreferences,
} from './commands/userPreferences.js';
import { getCurrentAppConfig } from './config/index.js';
import { refreshMenu } from './helpers/menu.helper.js';
import {
    changeLanguage,
    getAllTranslations,
    getAvailableLanguages,
    getCurrentLanguage,
} from './i18n/index.js';
import { setAutoStart } from './utils/platform.utils.js';
import {
    getConfigDir,
    getDefaultPrefs,
    getPrefsPath,
    setAutoCheckUpdates,
} from './utils/prefs.utils.js';
import { ipcMainHandler, isDev } from './utils.js';

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
            JSON.stringify(defaultPrefs, null, 4),
        );
    }
}

// createDefaultFolder(); // Commented out direct call

// Export i18n initialization for use in main.ts
export { initI18n } from './i18n/index.js';
export { createDefaultFolder }; // Export the function

function getComparableVersion(version: string): string | null {
    const validVersion = semver.valid(version);
    if (validVersion) {
        return validVersion;
    }

    return semver.coerce(version)?.version ?? null;
}

function isNewerVersion(
    candidateVersion: string,
    currentVersion: string,
): boolean {
    const normalizedCandidateVersion = getComparableVersion(candidateVersion);
    const normalizedCurrentVersion = getComparableVersion(currentVersion);

    if (!normalizedCandidateVersion || !normalizedCurrentVersion) {
        return false;
    }

    return semver.gt(normalizedCandidateVersion, normalizedCurrentVersion);
}

export function registerHandlers() {
    // ##### user-preferences #####

    ipcMainHandler(
        'get-user-preferences',
        async () => await getUserPreferences(),
    );

    ipcMainHandler(
        'set-user-preferences',
        async (_, newPrefs: UserPreferences) =>
            await setUserPreferences(newPrefs),
    );

    ipcMainHandler(
        'shell-open-folder',
        async (_, pathToOpen) => await openShellFolder(pathToOpen),
    );

    ipcMainHandler(
        'open-external',
        async (_, url) => await shell.openExternal(url),
    );

    ipcMainHandler(
        'set-auto-start',
        async (_, autoStart, hidden) => await setAutoStart(autoStart, hidden),
    );

    ipcMainHandler(
        'set-auto-check-updates',
        async (_, enabled) => await setAutoCheckUpdates(enabled),
    );

    ipcMainHandler('set-receive-beta-updates', async (_, enabled: boolean) => {
        const prefs = await getUserPreferences();
        const updatedPrefs = {
            ...prefs,
            receive_beta_updates: enabled,
        };
        await setUserPreferences(updatedPrefs);
        setBetaChannel(enabled);
        return enabled;
    });

    ipcMainHandler(
        'install-update-and-restart',
        async () => await installUpdateAndRestart(),
    );
    ipcMainHandler(
        'download-app-update',
        async () => await downloadAppUpdate(),
    );
    ipcMainHandler('skip-app-update', async (_, version: string) => {
        const prefs = await getUserPreferences();
        const updatedPrefs: UserPreferences = {
            ...prefs,
            skipped_app_update_version: version,
        };
        await setUserPreferences(updatedPrefs);
        return version;
    });
    ipcMainHandler('unskip-app-update', async () => {
        const prefs = await getUserPreferences();
        if (typeof prefs.skipped_app_update_version === 'undefined') {
            return;
        }
        const updatedPrefs: UserPreferences = { ...prefs };
        delete updatedPrefs.skipped_app_update_version;
        await setUserPreferences(updatedPrefs);
    });

    // ##### releases #####

    ipcMainHandler(
        'get-available-releases',
        async () => await getAvailableReleases(),
    );

    ipcMainHandler(
        'get-available-prereleases',
        async () => await getAvailablePrereleases(),
    );

    ipcMainHandler(
        'get-installed-releases',
        async () => await getInstalledReleases(),
    );

    ipcMainHandler(
        'install-release',
        async (_, release, mono) => await installRelease(release, mono),
    );

    ipcMainHandler(
        'remove-release',
        async (_, installedRelease) => await removeRelease(installedRelease),
    );

    ipcMainHandler(
        'reinstall-release',
        async (_, installedRelease) => await reinstallRelease(installedRelease),
    );

    ipcMainHandler(
        'register-custom-engine',
        async (
            _,
            manifestPath: string,
            options?: { replaceExisting?: boolean },
        ) => await registerCustomEngine(manifestPath, options),
    );

    ipcMainHandler(
        'open-editor-project-manager',
        async (_, release) => await openProjectManager(release),
    );
    ipcMainHandler(
        'check-all-releases-valid',
        async () => await checkAndUpdateReleases(),
    );

    let clearReleaseCachePromise: Promise<void> | null = null;
    ipcMainHandler('clear-release-cache', async () => {
        if (!clearReleaseCachePromise) {
            clearReleaseCachePromise = clearReleaseCaches().finally(() => {
                clearReleaseCachePromise = null;
            });
        }
        return await clearReleaseCachePromise;
    });

    // ##### projects #####

    ipcMainHandler(
        'create-project',
        async (
            _,
            name: string,
            release: InstalledRelease,
            renderer: RendererType[5],
            withVSCode: boolean,
            withGit: boolean,
            overwriteProjectPath?: string,
        ) =>
            await createProject(
                name,
                release,
                renderer,
                withVSCode,
                withGit,
                overwriteProjectPath,
            ),
    );

    ipcMainHandler(
        'get-projects-details',
        async () => await getProjectsDetails(),
    );

    ipcMainHandler(
        'remove-project',
        async (_, project: ProjectDetails) => await removeProject(project),
    );

    ipcMainHandler(
        'add-project',
        async (_, projectPath: string, options?: AddProjectOptions) =>
            await addProject(projectPath, options),
    );

    ipcMainHandler(
        'set-project-editor',
        async (_, project: ProjectDetails, newRelease: InstalledRelease) =>
            await setProjectEditor(project, newRelease),
    );

    ipcMainHandler('launch-project', async (_, project: ProjectDetails) =>
        launchProject(project),
    );

    ipcMainHandler(
        'check-project-valid',
        async (_, project: ProjectDetails) =>
            await checkProjectIsValid(project),
    );

    ipcMainHandler(
        'check-all-projects-valid',
        async () => await checkAndUpdateProjects(),
    );

    // ##### dialogs #####

    ipcMainHandler(
        'open-file-dialog',
        (
            _,
            defaultPath: string,
            title: string,
            filters: Electron.FileFilter[],
            properties?: Electron.OpenDialogOptions['properties'],
        ) => openFileDialog(defaultPath, title, filters, properties),
    );

    ipcMainHandler(
        'open-directory-dialog',
        (
            _,
            defaultPath: string,
            title?: string,
            filters?: Electron.FileFilter[],
            properties?: Electron.OpenDialogOptions['properties'],
        ) => openDirectoryDialog(defaultPath, title, filters, properties),
    );

    ipcMainHandler(
        'path-exists',
        async (_, pathToCheck: string) => await pathExists(pathToCheck),
    );

    ipcMainHandler(
        'file-exists',
        async (_, pathToCheck: string) => await fileExists(pathToCheck),
    );

    ipcMainHandler(
        'ensure-directory',
        async (_, pathToCheck: string) => await ensureDirectory(pathToCheck),
    );

    ipcMainHandler('show-project-menu', (_, project: ProjectDetails) =>
        showProjectMenu(project),
    );

    ipcMainHandler('show-release-menu', (_, release: InstalledRelease) =>
        showReleaseMenu(release),
    );

    // ##### tools #####

    ipcMainHandler('get-installed-tools', async () => {
        const tools = await getInstalledTools();
        const { refreshToolCache } = await import('./services/toolCache.js');
        await refreshToolCache(tools);
        return tools;
    });
    ipcMainHandler(
        'get-cached-tools',
        async (_, options?: { refreshIfStale?: boolean }) => {
            const { getCachedTools } = await import('./services/toolCache.js');
            return await getCachedTools(options);
        },
    );

    ipcMainHandler('refresh-tool-cache', async () => {
        const { refreshToolCache } = await import('./services/toolCache.js');
        return await refreshToolCache();
    });

    ipcMainHandler('relaunch-app', async () => {
        app.relaunch();
        app.exit();
    });

    ipcMainHandler(
        'check-updates',
        async (_, options?: { ignoreSkippedVersion?: boolean }) => {
            const prefs = await getUserPreferences();
            const skippedVersion = prefs.skipped_app_update_version;

            const result = await checkForUpdates({
                ignoreSkippedVersion: options?.ignoreSkippedVersion ?? false,
                skippedVersion,
            });

            if (
                skippedVersion &&
                result.version &&
                result.version !== skippedVersion &&
                isNewerVersion(result.version, skippedVersion)
            ) {
                const updatedPrefs: UserPreferences = { ...prefs };
                delete updatedPrefs.skipped_app_update_version;
                await setUserPreferences(updatedPrefs);
            }

            return result;
        },
    );

    ipcMainHandler('get-platform', async () => {
        if (getCurrentAppConfig().docsScreenshots) {
            return 'win32';
        }
        return process.platform;
    });

    ipcMainHandler('get-app-version', async () => {
        return app.getVersion();
    });

    // ##### i18n #####

    ipcMainHandler('i18n:get-current-language', async () => {
        return getCurrentLanguage();
    });

    ipcMainHandler('i18n:get-available-languages', async () => {
        return getAvailableLanguages();
    });

    ipcMainHandler(
        'i18n:get-all-translations',
        async (_, language?: string) => {
            return getAllTranslations(language);
        },
    );

    ipcMainHandler('i18n:change-language', async (_, lang: string) => {
        await changeLanguage(lang);

        // Refresh menu to update translations
        // only in dev mode to avoid disrupting user experience
        if (isDev()) {
            refreshMenu();
        }

        // Update user preferences
        const prefs = await getUserPreferences();
        await setUserPreferences({ ...prefs, language: lang });

        // Return new translations for renderer
        return getAllTranslations(lang);
    });
}
