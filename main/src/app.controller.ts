import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { I18nService } from '@mariodebono/di-electron-i18n';
import type {
    AddProjectOptions,
    AppBridge,
    AppFileFilter,
    AppOpenDialogProperty,
    CheckForUpdatesOptions,
    CustomEngineManifest,
    InstalledRelease,
    ProjectDetails,
    ReleaseSummary,
    RenameProjectOptions,
    RendererType,
    UserPreferences,
} from '@shared/contracts';
import { app, shell } from 'electron';
import semver from 'semver';
import { AppLifecycleService } from './app-lifecycle.service.js';
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
import {
    exportProjectEditorSettings,
    importProjectEditorSettings,
} from './commands/projectEditorSettings.js';
import {
    checkProjectIsValid,
    getProjectGodotName,
    getProjectsDetails,
    initializeProjectGit,
    launchProject,
    removeProject,
    renameProject,
    setProjectVSCode,
    setProjectWindowed,
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
import { getCachedTools, refreshToolCache } from './services/toolCache.js';
import { closeSplashscreen } from './splashscreen/splashscreen.js';
import { createCustomEngineManifest } from './utils/customEngineManifest.utils.js';
import { setAutoStart } from './utils/platform.utils.js';
import { setAutoCheckUpdates } from './utils/prefs.utils.js';
import { isDev } from './utils.js';

const AppHandler = createIpcHandleTyped<AppBridge>();

@BridgeController({ namespace: 'app' })
export class AppController implements AppBridge {
    private clearReleaseCachePromise: Promise<void> | null = null;

    constructor(
        private readonly i18nService: I18nService,
        private readonly appLifecycleService: AppLifecycleService,
    ) {}

    @AppHandler('getUserPreferences')
    getUserPreferences() {
        return getUserPreferences();
    }

    @AppHandler('setUserPreferences')
    setUserPreferences(prefs: UserPreferences) {
        return setUserPreferences(prefs);
    }

    @AppHandler('setAutoStart')
    setAutoStart(autoStart: boolean, hidden: boolean) {
        return setAutoStart(autoStart, hidden);
    }

    @AppHandler('setAutoCheckUpdates')
    setAutoCheckUpdates(enabled: boolean) {
        return setAutoCheckUpdates(enabled);
    }

    @AppHandler('setReceiveBetaUpdates')
    async setReceiveBetaUpdates(enabled: boolean): Promise<boolean> {
        const prefs = await getUserPreferences();
        await setUserPreferences({ ...prefs, receive_beta_updates: enabled });
        setBetaChannel(enabled);
        return enabled;
    }

    @AppHandler('openFileDialog')
    openFileDialog(
        defaultPath: string,
        title: string,
        filters?: AppFileFilter[],
        properties?: AppOpenDialogProperty[],
    ) {
        return openFileDialog(defaultPath, title, filters, properties);
    }

    @AppHandler('openDirectoryDialog')
    openDirectoryDialog(
        defaultPath: string,
        title: string,
        filters?: AppFileFilter[],
        properties?: AppOpenDialogProperty[],
    ) {
        return openDirectoryDialog(defaultPath, title, filters, properties);
    }

    @AppHandler('openShellFolder')
    openShellFolder(pathToOpen: string) {
        return openShellFolder(pathToOpen);
    }

    @AppHandler('openExternal')
    async openExternal(url: string): Promise<void> {
        await shell.openExternal(url);
    }

    @AppHandler('pathExists')
    pathExists(pathToCheck: string) {
        return pathExists(pathToCheck);
    }

    @AppHandler('fileExists')
    fileExists(pathToCheck: string) {
        return fileExists(pathToCheck);
    }

    @AppHandler('ensureDirectory')
    ensureDirectory(pathToCheck: string) {
        return ensureDirectory(pathToCheck);
    }

    @AppHandler('getAvailableReleases')
    getAvailableReleases() {
        return getAvailableReleases();
    }

    @AppHandler('getAvailablePrereleases')
    getAvailablePrereleases() {
        return getAvailablePrereleases();
    }

    @AppHandler('getInstalledReleases')
    getInstalledReleases() {
        return getInstalledReleases();
    }

    @AppHandler('installRelease')
    installRelease(release: ReleaseSummary, mono: boolean) {
        return installRelease(release, mono);
    }

    @AppHandler('removeRelease')
    removeRelease(release: InstalledRelease) {
        return removeRelease(release);
    }

    @AppHandler('reinstallRelease')
    reinstallRelease(release: InstalledRelease) {
        return reinstallRelease(release);
    }

    @AppHandler('registerCustomEngine')
    registerCustomEngine(
        manifestPath: string,
        options?: { replaceExisting?: boolean },
    ) {
        return registerCustomEngine(manifestPath, options);
    }

    @AppHandler('createCustomEngineManifest')
    createCustomEngineManifest(
        outputDirectory: string,
        manifest: CustomEngineManifest,
    ) {
        return createCustomEngineManifest(outputDirectory, manifest);
    }

    @AppHandler('openEditorProjectManager')
    openEditorProjectManager(release: InstalledRelease) {
        return openProjectManager(release);
    }

    @AppHandler('checkAllReleasesValid')
    checkAllReleasesValid() {
        return checkAndUpdateReleases();
    }

    @AppHandler('clearReleaseCache')
    clearReleaseCache(): Promise<void> {
        if (!this.clearReleaseCachePromise) {
            this.clearReleaseCachePromise = clearReleaseCaches().finally(() => {
                this.clearReleaseCachePromise = null;
            });
        }
        return this.clearReleaseCachePromise;
    }

    @AppHandler('getProjectsDetails')
    getProjectsDetails() {
        return getProjectsDetails();
    }

    @AppHandler('createProject')
    createProject(
        name: string,
        release: InstalledRelease,
        renderer: RendererType[5],
        withVSCode: boolean,
        withGit: boolean,
        overwriteProjectPath?: string,
    ) {
        return createProject(
            name,
            release,
            renderer,
            withVSCode,
            withGit,
            overwriteProjectPath,
        );
    }

    @AppHandler('removeProject')
    removeProject(project: ProjectDetails) {
        return removeProject(project);
    }

    @AppHandler('renameProject')
    renameProject(project: ProjectDetails, options: RenameProjectOptions) {
        return renameProject(project, options);
    }

    @AppHandler('getProjectGodotName')
    getProjectGodotName(project: ProjectDetails) {
        return getProjectGodotName(project);
    }

    @AppHandler('addProject')
    addProject(projectPath: string, options?: AddProjectOptions) {
        return addProject(projectPath, options);
    }

    @AppHandler('setProjectEditor')
    setProjectEditor(project: ProjectDetails, release: InstalledRelease) {
        return setProjectEditor(project, release);
    }

    @AppHandler('setProjectWindowed')
    setProjectWindowed(project: ProjectDetails, openWindowed: boolean) {
        return setProjectWindowed(project, openWindowed);
    }

    @AppHandler('setProjectVSCode')
    setProjectVSCode(project: ProjectDetails, enable: boolean) {
        return setProjectVSCode(project, enable);
    }

    @AppHandler('initializeProjectGit')
    initializeProjectGit(project: ProjectDetails) {
        return initializeProjectGit(project);
    }

    @AppHandler('exportProjectEditorSettings')
    exportProjectEditorSettings(project: ProjectDetails) {
        return exportProjectEditorSettings(project);
    }

    @AppHandler('importProjectEditorSettings')
    importProjectEditorSettings(project: ProjectDetails) {
        return importProjectEditorSettings(project);
    }

    @AppHandler('launchProject')
    launchProject(project: ProjectDetails) {
        return launchProject(project);
    }

    @AppHandler('checkProjectValid')
    checkProjectValid(project: ProjectDetails) {
        return checkProjectIsValid(project);
    }

    @AppHandler('checkAllProjectsValid')
    checkAllProjectsValid() {
        return checkAndUpdateProjects();
    }

    @AppHandler('getInstalledTools')
    async getInstalledTools() {
        const tools = await getInstalledTools();
        await refreshToolCache(tools);
        return tools;
    }

    @AppHandler('getCachedTools')
    getCachedTools(options?: { refreshIfStale?: boolean }) {
        return getCachedTools(options);
    }

    @AppHandler('refreshToolCache')
    refreshToolCache() {
        return refreshToolCache();
    }

    @AppHandler('getPlatform')
    async getPlatform(): Promise<string> {
        return getCurrentAppConfig().docsScreenshots
            ? 'win32'
            : process.platform;
    }

    @AppHandler('getAppVersion')
    async getAppVersion(): Promise<string> {
        return app.getVersion();
    }

    @AppHandler('relaunchApp')
    async relaunchApp(): Promise<void> {
        app.relaunch();
        app.exit();
    }

    @AppHandler('installUpdateAndRestart')
    async installUpdateAndRestart(): Promise<void> {
        installUpdateAndRestart();
    }

    @AppHandler('downloadAppUpdate')
    downloadAppUpdate() {
        return downloadAppUpdate();
    }

    @AppHandler('skipAppUpdate')
    async skipAppUpdate(version: string): Promise<string> {
        const prefs = await getUserPreferences();
        await setUserPreferences({
            ...prefs,
            skipped_app_update_version: version,
        });
        return version;
    }

    @AppHandler('unskipAppUpdate')
    async unskipAppUpdate(): Promise<void> {
        const prefs = await getUserPreferences();
        if (typeof prefs.skipped_app_update_version === 'undefined') {
            return;
        }
        const updatedPrefs: UserPreferences = { ...prefs };
        delete updatedPrefs.skipped_app_update_version;
        await setUserPreferences(updatedPrefs);
    }

    @AppHandler('checkForUpdates')
    async checkForUpdates(options?: CheckForUpdatesOptions) {
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
    }

    @AppHandler('changeLanguage')
    async changeLanguage(lang: string): Promise<string> {
        const preference = normalizeLocalePreference(lang);
        const runtimeLocale =
            preference === 'system' ? app.getLocale() : preference;
        await this.i18nService.setLocale(runtimeLocale);

        if (isDev()) {
            refreshMenu();
        }

        const prefs = await getUserPreferences();
        await setUserPreferences({ ...prefs, language: preference });
        return this.i18nService.getLocale();
    }

    @AppHandler('rendererReady')
    async rendererReady(): Promise<void> {
        this.appLifecycleService.revealInitialWindow();
        closeSplashscreen();
    }
}

function normalizeLocalePreference(locale: string): string {
    return locale === 'system' ? locale : locale.trim().replace(/_/g, '-');
}

function isNewerVersion(
    candidateVersion: string,
    currentVersion: string,
): boolean {
    const normalizedCandidateVersion = normalizeVersion(candidateVersion);
    const normalizedCurrentVersion = normalizeVersion(currentVersion);
    return Boolean(
        normalizedCandidateVersion &&
            normalizedCurrentVersion &&
            semver.gt(normalizedCandidateVersion, normalizedCurrentVersion),
    );
}

function normalizeVersion(version: string): string | null {
    return semver.valid(version) ?? semver.coerce(version)?.version ?? null;
}
