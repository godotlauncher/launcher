import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { I18nService } from '@mariodebono/di-electron-i18n';
import type {
    AppBridge,
    AppFileFilter,
    AppOpenDialogProperty,
    CheckForUpdatesOptions,
    CustomEngineManifest,
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
import {
    ensureDirectory,
    fileExists,
    pathExists,
} from './commands/fileSystem.js';
import {
    clearReleaseCaches,
    getAvailablePrereleases,
    getAvailableReleases,
} from './commands/releases.js';
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
     * @param trayAvailabilityService - System tray availability service.
     */
    constructor(
        private readonly i18nService: I18nService,
        private readonly appLifecycleService: AppLifecycleService,
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

    @AppHandler('createCustomEngineManifest')
    createCustomEngineManifest(
        outputDirectory: string,
        manifest: CustomEngineManifest,
    ) {
        return createCustomEngineManifest(outputDirectory, manifest);
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

    @AppHandler('getPlatform')
    async getPlatform(): Promise<string> {
        return getCurrentAppConfig().e2eFixtures ? 'win32' : process.platform;
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
