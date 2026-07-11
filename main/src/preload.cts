import type {
    AddProjectOptions,
    CheckForUpdatesOptions,
    CustomEngineManifest,
    ElectronRendererApi,
    EventChannelMapping,
    InstalledRelease,
    ProjectDetails,
    ReleaseSummary,
    RenameProjectOptions,
    RendererType,
    UserPreferences,
} from '@shared';

const electron = require('electron');

electron.contextBridge.exposeInMainWorld('electron', {
    // ##### user-preferences #####

    getUserPreferences: () => ipcInvoke('get-user-preferences'),
    setUserPreferences: (prefs: UserPreferences) =>
        ipcInvoke('set-user-preferences', prefs),
    setAutoStart: (autoStart: boolean, hidden: boolean) =>
        ipcInvoke('set-auto-start', autoStart, hidden),
    setAutoCheckUpdates: (enabled: boolean) =>
        ipcInvoke('set-auto-check-updates', enabled),
    setReceiveBetaUpdates: (enabled: boolean) =>
        ipcInvoke('set-receive-beta-updates', enabled),

    // ##### releases #####

    getAvailableReleases: () => ipcInvoke('get-available-releases'),
    getAvailablePrereleases: () => ipcInvoke('get-available-prereleases'),
    getInstalledReleases: () => ipcInvoke('get-installed-releases'),
    installRelease: (release: ReleaseSummary, mono: boolean) =>
        ipcInvoke('install-release', release, mono),
    removeRelease: (release: InstalledRelease) =>
        ipcInvoke('remove-release', release),
    reinstallRelease: (release: InstalledRelease) =>
        ipcInvoke('reinstall-release', release),
    registerCustomEngine: (
        manifestPath: string,
        options?: { replaceExisting?: boolean },
    ) => ipcInvoke('register-custom-engine', manifestPath, options),
    createCustomEngineManifest: (
        outputDirectory: string,
        manifest: CustomEngineManifest,
    ) => ipcInvoke('create-custom-engine-manifest', outputDirectory, manifest),

    openEditorProjectManager: (release: InstalledRelease) =>
        ipcInvoke('open-editor-project-manager', release),
    checkAllReleasesValid: () => ipcInvoke('check-all-releases-valid'),
    clearReleaseCache: () => ipcInvoke('clear-release-cache'),

    // ##### dialogs #####
    openDirectoryDialog: (
        defaultPath: string,
        title: string = 'Select Folder',
        filters?: Electron.FileFilter[],
        properties?: Electron.OpenDialogOptions['properties'],
    ) =>
        ipcInvoke(
            'open-directory-dialog',
            defaultPath,
            title,
            filters,
            properties,
        ),
    openFileDialog: (
        defaultPath: string,
        title: string = 'Select File',
        filters?: Electron.FileFilter[],
        properties?: Electron.OpenDialogOptions['properties'],
    ) => ipcInvoke('open-file-dialog', defaultPath, title, filters, properties),

    openShellFolder: (pathToOpen: string) =>
        ipcInvoke('shell-open-folder', pathToOpen),

    openExternal: (url: string) => ipcInvoke('open-external', url),

    // ##### file utils #####
    getPathForFile: (file: File) => electron.webUtils.getPathForFile(file),
    pathExists: (pathToCheck: string) => ipcInvoke('path-exists', pathToCheck),
    fileExists: (pathToCheck: string) => ipcInvoke('file-exists', pathToCheck),
    ensureDirectory: (pathToCheck: string) =>
        ipcInvoke('ensure-directory', pathToCheck),

    // ##### projects #####

    createProject: (
        name: string,
        release: InstalledRelease,
        renderer: RendererType[5],
        withVSCode: boolean,
        withGit: boolean,
        overwriteProjectPath?: string,
    ) =>
        ipcInvoke(
            'create-project',
            name,
            release,
            renderer,
            withVSCode,
            withGit,
            overwriteProjectPath,
        ),

    getProjectsDetails: () => ipcInvoke('get-projects-details'),
    removeProject: (project: ProjectDetails) =>
        ipcInvoke('remove-project', project),
    renameProject: (project: ProjectDetails, options: RenameProjectOptions) =>
        ipcInvoke('rename-project', project, options),
    getProjectGodotName: (project: ProjectDetails) =>
        ipcInvoke('get-project-godot-name', project),
    addProject: (projectPath: string, options?: AddProjectOptions) =>
        ipcInvoke('add-project', projectPath, options),
    setProjectEditor: (project: ProjectDetails, release: InstalledRelease) =>
        ipcInvoke('set-project-editor', project, release),
    setProjectWindowed: (project: ProjectDetails, openWindowed: boolean) =>
        ipcInvoke('set-project-windowed', project, openWindowed),
    setProjectVSCode: (project: ProjectDetails, enable: boolean) =>
        ipcInvoke('set-project-vscode', project, enable),
    initializeProjectGit: (project: ProjectDetails) =>
        ipcInvoke('initialize-project-git', project),
    exportProjectEditorSettings: (project: ProjectDetails) =>
        ipcInvoke('export-project-editor-settings', project),
    importProjectEditorSettings: (project: ProjectDetails) =>
        ipcInvoke('import-project-editor-settings', project),

    launchProject: (project: ProjectDetails) =>
        ipcInvoke('launch-project', project),

    checkProjectValid: (project: ProjectDetails) =>
        ipcInvoke('check-project-valid', project),
    checkAllProjectsValid: () => ipcInvoke('check-all-projects-valid'),

    // ##### tools #####

    getInstalledTools: () => ipcInvoke('get-installed-tools'),
    getCachedTools: (options?: { refreshIfStale?: boolean }) =>
        ipcInvoke('get-cached-tools', options),
    refreshToolCache: () => ipcInvoke('refresh-tool-cache'),

    subscribeProjects: (callback) => ipcOn('projects-updated', callback),
    subscribeReleases: (callback) => ipcOn('releases-updated', callback),
    subscribeReleaseInstallProgress: (callback) =>
        ipcOn('release-install-progress', callback),

    subscribeAppUpdates: (callback) => ipcOn('app-updates', callback),

    relaunchApp: () => ipcInvoke('relaunch-app'),
    installUpdateAndRestart: () => ipcInvoke('install-update-and-restart'),
    downloadAppUpdate: () => ipcInvoke('download-app-update'),
    skipAppUpdate: (version: string) => ipcInvoke('skip-app-update', version),
    unskipAppUpdate: () => ipcInvoke('unskip-app-update'),

    getPlatform: () => ipcInvoke('get-platform'),
    getAppVersion: () => ipcInvoke('get-app-version'),
    checkForUpdates: (options?: CheckForUpdatesOptions) =>
        ipcInvoke('check-updates', options),

    // ##### i18n #####
    i18n: {
        getCurrentLanguage: () => ipcInvoke('i18n:get-current-language'),
        getAvailableLanguages: () => ipcInvoke('i18n:get-available-languages'),
        getAllTranslations: (language?: string) =>
            ipcInvoke('i18n:get-all-translations', language),
        changeLanguage: (lang: string) =>
            ipcInvoke('i18n:change-language', lang),
    },
} satisfies ElectronRendererApi);

function ipcInvoke<Channel extends keyof EventChannelMapping>(
    key: Channel,
    // biome-ignore lint/suspicious/noExplicitAny: required for variadic args
    ...args: any[]
): EventChannelMapping[Channel] {
    return electron.ipcRenderer.invoke(key, ...args);
}

function ipcOn<Key extends keyof EventChannelMapping>(
    key: Key,
    callback: (payload: EventChannelMapping[Key]) => void,
) {
    const cb = (
        _: Electron.IpcRendererEvent,
        payload: EventChannelMapping[Key],
    ) => callback(payload);
    electron.ipcRenderer.on(key, cb);
    return () => electron.ipcRenderer.off(key, cb);
}

// biome-ignore lint/correctness/noUnusedVariables: exported for potential future use
function ipcSend<Key extends keyof EventChannelMapping>(
    key: Key,
    payload: EventChannelMapping[Key],
) {
    electron.ipcRenderer.send(key, payload);
}
