const electron = require("electron");

electron.contextBridge.exposeInMainWorld("electron", {
    // ##### user-preferences #####

    getUserPreferences: () => ipcInvoke("get-user-preferences"),
    setUserPreferences: (prefs: UserPreferences) =>
        ipcInvoke("set-user-preferences", prefs),
    setAutoStart: (autoStart: boolean, hidden: boolean) =>
        ipcInvoke("set-auto-start", autoStart, hidden),
    setAutoCheckUpdates: (enabled: boolean) =>
        ipcInvoke("set-auto-check-updates", enabled),
    setReceiveBetaUpdates: (enabled: boolean) =>
        ipcInvoke("set-receive-beta-updates", enabled),

    // ##### releases #####

    getAvailableReleases: () => ipcInvoke("get-available-releases"),
    getAvailablePrereleases: () => ipcInvoke("get-available-prereleases"),
    getInstalledReleases: () => ipcInvoke("get-installed-releases"),
    installRelease: (release: ReleaseSummary, mono: boolean) =>
        ipcInvoke("install-release", release, mono),
    removeRelease: (release: InstalledRelease) =>
        ipcInvoke("remove-release", release),

    openEditorProjectManager: (release: InstalledRelease) =>
        ipcInvoke("open-editor-project-manager", release),
    checkAllReleasesValid: () => ipcInvoke("check-all-releases-valid"),
    clearReleaseCache: () => ipcInvoke("clear-release-cache"),

    // ##### dialogs #####
    openDirectoryDialog: (
        defaultPath: string,
        title: string = "Select Folder",
        filters?: Electron.FileFilter[],
        properties?: Electron.OpenDialogOptions["properties"]
    ) =>
        ipcInvoke("open-directory-dialog", defaultPath, title, filters, properties),
    openFileDialog: (
        defaultPath: string,
        title: string = "Select File",
        filters?: Electron.FileFilter[],
        properties?: Electron.OpenDialogOptions["properties"]
    ) => ipcInvoke("open-file-dialog", defaultPath, title, filters, properties),

    openShellFolder: (pathToOpen: string) =>
        ipcInvoke("shell-open-folder", pathToOpen),

    showProjectMenu: (project: ProjectDetails) =>
        ipcInvoke("show-project-menu", project),
    showReleaseMenu: (release: InstalledRelease) =>
        ipcInvoke("show-release-menu", release),

    openExternal: (url: string) => ipcInvoke("open-external", url),
    promotionClicked: (payload: PromotionClickPayload) =>
        ipcInvoke("promotion-clicked", payload),

    // ##### file utils #####
    getPathForFile: (file: File) => electron.webUtils.getPathForFile(file),

    // ##### projects #####

    createProject: (
        name: string,
        release: InstalledRelease,
        renderer: RendererType[5],
        withVSCode: boolean,
        withGit: boolean,
        overwriteProjectPath?: string
    ) =>
        ipcInvoke("create-project", name, release, renderer, withVSCode, withGit, overwriteProjectPath),

    getProjectsDetails: () => ipcInvoke("get-projects-details"),
    removeProject: (project: ProjectDetails) =>
        ipcInvoke("remove-project", project),
    addProject: (projectPath: string) => ipcInvoke("add-project", projectPath),
    setProjectEditor: (project: ProjectDetails, release: InstalledRelease) =>
        ipcInvoke("set-project-editor", project, release),

    launchProject: (project: ProjectDetails) =>
        ipcInvoke("launch-project", project),

    checkProjectValid: (project: ProjectDetails) =>
        ipcInvoke("check-project-valid", project),
    checkAllProjectsValid: () => ipcInvoke("check-all-projects-valid"),

    // ##### tools #####

    getInstalledTools: () => ipcInvoke("get-installed-tools"),
    getCachedTools: (options?: { refreshIfStale?: boolean }) =>
        ipcInvoke("get-cached-tools", options),
    refreshToolCache: () => ipcInvoke("refresh-tool-cache"),

    subscribeProjects: (callback) => ipcOn("projects-updated", callback),
    subscribeReleases: (callback) => ipcOn("releases-updated", callback),

    subscribeAppUpdates: (callback) => ipcOn("app-updates", callback),

    relaunchApp: () => ipcInvoke("relaunch-app"),
    installUpdateAndRestart: () => ipcInvoke("install-update-and-restart"),

    getPlatform: () => ipcInvoke("get-platform"),
    getAppVersion: () => ipcInvoke("get-app-version"),
    checkForUpdates: () => ipcInvoke("check-updates"),

    // ##### i18n #####
    i18n: {
        getCurrentLanguage: () => ipcInvoke("i18n:get-current-language"),
        getAvailableLanguages: () => ipcInvoke("i18n:get-available-languages"),
        getAllTranslations: (language?: string) => ipcInvoke("i18n:get-all-translations", language),
        changeLanguage: (lang: string) => ipcInvoke("i18n:change-language", lang),
    },
} satisfies Window["electron"]);

function ipcInvoke<Channel extends keyof EventChannelMapping>(
    key: Channel,
    ...args: any[]
): EventChannelMapping[Channel] {
    return electron.ipcRenderer.invoke(key, ...args);
}

function ipcOn<Key extends keyof EventChannelMapping>(
    key: Key,
    callback: (payload: EventChannelMapping[Key]) => void
) {
    const cb = (_: Electron.IpcRendererEvent, payload: any) => callback(payload);
    electron.ipcRenderer.on(key, cb);
    return () => electron.ipcRenderer.off(key, cb);
}

function ipcSend<Key extends keyof EventChannelMapping>(
    key: Key,
    payload: EventChannelMapping[Key]
) {
    electron.ipcRenderer.send(key, payload);
}
