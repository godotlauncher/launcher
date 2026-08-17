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
    CodeEditorId,
    CreateProjectGitOptions,
    CustomEngineManifest,
    GitIdentity,
    InstalledRelease,
    LaunchProjectOptions,
    ProjectDetails,
    ReleaseSummary,
    RenameProjectOptions,
    RendererType,
    UserPreferences,
} from '@shared/contracts';
import { app, shell } from 'electron';
import semver from 'semver';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { AppLifecycleService } from './app-lifecycle.service.js';
import {
    checkForUpdates,
    downloadAppUpdate,
    installUpdateAndRestart,
    setBetaChannel,
} from './autoUpdater.js';
import { checkAndUpdateProjects, checkAndUpdateReleases } from './checks.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { CodeEditorIntegrationService } from './codeEditorIntegration/codeEditorIntegration.service.js';
import { addProject } from './commands/addProject.js';
import { createProject } from './commands/createProject.js';
import {
    ensureDirectory,
    fileExists,
    pathExists,
} from './commands/fileSystem.js';
import { installRelease } from './commands/installRelease.js';
import {
    exportProjectEditorSettings,
    importProjectEditorSettings,
} from './commands/projectEditorSettings.js';
import {
    checkProjectIsValid,
    getProjectGitIdentity,
    getProjectGodotName,
    getProjectsDetails,
    initializeProjectGit,
    launchProject,
    removeProject,
    renameProject,
    reorderPinnedProjects,
    resetProjectCodeEditorConfig,
    setProjectCodeEditor,
    setProjectGitIdentity,
    setProjectPinned,
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
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { TrayAvailabilityService } from './services/tray-availability.service.js';
import { closeSplashscreen } from './splashscreen/splashscreen.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitService } from './tool-integration/integrations/git/git.service.js';
import { createCustomEngineManifest } from './utils/customEngineManifest.utils.js';
import { setAutoStart } from './utils/platform.utils.js';
import { setAutoCheckUpdates } from './utils/prefs.utils.js';
import { isDev } from './utils.js';

const AppHandler = createIpcHandleTyped<AppBridge>();

@BridgeController({ namespace: 'app' })
export class AppController implements AppBridge {
    private clearReleaseCachePromise: Promise<void> | null = null;

    /**
     * Creates the application bridge controller.
     *
     * @param i18nService - Main-process localization service.
     * @param appLifecycleService - Application lifecycle coordinator.
     * @param codeEditorIntegrationService - Code editor integration facade.
     * @param gitService - Typed Git command service.
     * @param trayAvailabilityService - System tray availability service.
     */
    constructor(
        private readonly i18nService: I18nService,
        private readonly appLifecycleService: AppLifecycleService,
        private readonly codeEditorIntegrationService: CodeEditorIntegrationService,
        private readonly gitService: GitService,
        private readonly trayAvailabilityService: TrayAvailabilityService,
    ) {}
    @AppHandler('getUserPreferences')
    getUserPreferences() {
        return getUserPreferences();
    }

    @AppHandler('getOnboardingRecommendedLocations')
    async getOnboardingRecommendedLocations() {
        const { dataDir, projectDir } = getCurrentAppConfig().paths;
        return {
            projectsLocation: projectDir,
            editorLocation: dataDir,
        };
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
        return reinstallRelease(release, this.codeEditorIntegrationService);
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

    /**
     * Creates a project with the selected editor and Git setup.
     *
     * @param name - Display name for the new project.
     * @param release - Godot editor release assigned to the project.
     * @param renderer - Renderer selected for the project.
     * @param codeEditorId - Optional code editor integration to apply.
     * @param withGit - Whether to initialize Git when it is available.
     * @param overwriteProjectPath - Optional target project path.
     * @param gitOptions - Optional initial commit and identity setup choice.
     * @returns The project creation result.
     */
    @AppHandler('createProject')
    createProject(
        name: string,
        release: InstalledRelease,
        renderer: RendererType[5],
        codeEditorId: CodeEditorId | null,
        withGit: boolean,
        overwriteProjectPath?: string,
        gitOptions?: CreateProjectGitOptions,
    ) {
        return createProject(
            name,
            release,
            renderer,
            codeEditorId,
            withGit,
            this.codeEditorIntegrationService,
            this.gitService,
            overwriteProjectPath,
            gitOptions,
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
        return addProject(
            projectPath,
            this.codeEditorIntegrationService,
            options,
            this.gitService,
        );
    }

    @AppHandler('setProjectEditor')
    setProjectEditor(project: ProjectDetails, release: InstalledRelease) {
        return setProjectEditor(
            project,
            release,
            this.codeEditorIntegrationService,
        );
    }

    @AppHandler('setProjectWindowed')
    setProjectWindowed(project: ProjectDetails, openWindowed: boolean) {
        return setProjectWindowed(project, openWindowed);
    }

    @AppHandler('setProjectPinned')
    setProjectPinned(project: ProjectDetails, pinned: boolean) {
        return setProjectPinned(project, pinned);
    }

    @AppHandler('reorderPinnedProjects')
    reorderPinnedProjects(orderedProjectPaths: string[]) {
        return reorderPinnedProjects(orderedProjectPaths);
    }

    @AppHandler('setProjectCodeEditor')
    setProjectCodeEditor(
        project: ProjectDetails,
        codeEditorId: CodeEditorId | null,
    ) {
        return setProjectCodeEditor(
            project,
            codeEditorId,
            this.codeEditorIntegrationService,
        );
    }

    @AppHandler('resetProjectCodeEditorConfig')
    resetProjectCodeEditorConfig(project: ProjectDetails) {
        return resetProjectCodeEditorConfig(
            project,
            this.codeEditorIntegrationService,
        );
    }

    @AppHandler('initializeProjectGit')
    initializeProjectGit(project: ProjectDetails) {
        return initializeProjectGit(project, this.gitService);
    }

    @AppHandler('getProjectGitIdentity')
    getProjectGitIdentity(project: ProjectDetails) {
        return getProjectGitIdentity(project, this.gitService);
    }

    @AppHandler('setProjectGitIdentity')
    setProjectGitIdentity(project: ProjectDetails, identity: GitIdentity) {
        return setProjectGitIdentity(project, identity, this.gitService);
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
    launchProject(project: ProjectDetails, options?: LaunchProjectOptions) {
        return launchProject(
            project,
            this.codeEditorIntegrationService,
            this.trayAvailabilityService,
            options,
        );
    }

    @AppHandler('checkProjectValid')
    checkProjectValid(project: ProjectDetails) {
        return checkProjectIsValid(project, this.gitService);
    }

    @AppHandler('checkAllProjectsValid')
    checkAllProjectsValid() {
        return checkAndUpdateProjects({}, this.gitService);
    }

    @AppHandler('getPlatform')
    async getPlatform(): Promise<string> {
        return getCurrentAppConfig().docsScreenshots
            ? 'win32'
            : process.platform;
    }

    @AppHandler('getTrayAvailability')
    getTrayAvailability() {
        return this.trayAvailabilityService.isAvailable();
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
