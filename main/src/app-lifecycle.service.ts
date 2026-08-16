import type { OnModuleDestroy, OnModuleInit } from '@mariodebono/di';
import { Injectable } from '@mariodebono/di';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ConfigService } from '@mariodebono/di-config';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import {
    AppLaunchContext,
    AppReady,
    AppReadyOrder,
    ElectronAppService,
    LifecycleHookOrder,
    OnAppLaunch,
    OnAppQuit,
    OnMainWindowClose,
    OnMainWindowShow,
    WindowManagerService,
} from '@mariodebono/di-electron';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { I18nService } from '@mariodebono/di-electron-i18n';
import { app, dialog, autoUpdater as electronAutoUpdater } from 'electron';
import logger from 'electron-log/main.js';
import { setupAutoUpdate, stopAutoUpdateChecks } from './autoUpdater.js';
import { checkAndUpdateProjects, checkAndUpdateReleases } from './checks.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { CodeEditorIntegrationService } from './codeEditorIntegration/codeEditorIntegration.service.js';
import { launchProject } from './commands/projects.js';
import { getUserPreferences } from './commands/userPreferences.js';
import type { AppConfig } from './config/index.js';
import { createMenu } from './helpers/menu.helper.js';
import { setupFocusRevalidation } from './helpers/revalidate.helper.js';
import { createTray } from './helpers/tray.helper.js';
import { configureI18n } from './i18n/index.js';
import { setMainWindow } from './mainWindow.js';
import { getAppIconPath } from './pathResolver.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { TrayAvailabilityService } from './services/tray-availability.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { GitService } from './tool-integration/integrations/git/git.service.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationService } from './tool-integration/tool-integration.service.js';
import { setAutoStart } from './utils/platform.utils.js';
import { ensurePreferencesStorage } from './utils/prefs.utils.js';
import { ipcWebContentsSend } from './utils.js';

@Injectable()
export class AppLifecycleService implements OnModuleInit, OnModuleDestroy {
    private disposeFocusRevalidation: (() => void) | undefined;
    private revealMainWindowOnRendererReady = false;
    private willClose = false;

    /**
     * Creates the application lifecycle coordinator.
     *
     * @param configService - Runtime application configuration.
     * @param electronAppService - Electron application lifecycle facade.
     * @param windowManager - Main-window lifecycle service.
     * @param i18nService - Main-process localization service.
     * @param codeEditorIntegrationService - Code editor lifecycle facade.
     * @param toolIntegrationService - Command-line tool lifecycle facade.
     * @param gitService - Git repository inspection service.
     * @param trayAvailabilityService - System tray availability service.
     */
    constructor(
        private readonly configService: ConfigService<AppConfig>,
        private readonly electronAppService: ElectronAppService,
        private readonly windowManager: WindowManagerService,
        private readonly i18nService: I18nService,
        private readonly codeEditorIntegrationService: CodeEditorIntegrationService,
        private readonly toolIntegrationService: ToolIntegrationService,
        private readonly gitService: GitService,
        private readonly trayAvailabilityService: TrayAvailabilityService,
    ) {}

    onModuleInit(): void {
        configureI18n(this.i18nService);
        this.electronAppService.onActivate(this.handleActivate);
    }

    onModuleDestroy(): void {
        this.electronAppService.offActivate(this.handleActivate);
    }

    @AppReady({ order: AppReadyOrder.BeforeWindow })
    async beforeWindowReady(): Promise<void> {
        if (!['darwin', 'win32', 'linux'].includes(process.platform)) {
            await dialog.showMessageBox({
                type: 'error',
                title: 'Unsupported platform',
                message: 'Godot Launcher is not supported on this platform',
                detail: `Godot Launcher is not supported on ${process.platform} platform. If you want to help us support this platform, see our contribution guide.`,
                buttons: ['OK'],
            });
            app.quit();
            return;
        }

        await ensurePreferencesStorage();
        this.refreshToolIntegrations();

        const userPrefs = await getUserPreferences();
        const requestedLocale = userPrefs.language || 'system';
        await this.i18nService.setLocale(
            requestedLocale === 'system' ? app.getLocale() : requestedLocale,
        );

        logger.debug('App ready, checking projects and releases');
        await checkAndUpdateProjects({}, this.gitService);
        await checkAndUpdateReleases();
    }

    @AppReady({ order: AppReadyOrder.AfterWindow })
    async afterWindowReady(): Promise<void> {
        const mainWindow = this.windowManager.getMainWindow();
        if (!mainWindow) {
            throw new Error('Main window was not created');
        }

        const iconPath = getAppIconPath();
        app.dock?.setIcon(iconPath);
        mainWindow.setIcon(iconPath);
        setMainWindow(mainWindow);

        await createTray(
            mainWindow,
            async (project) => {
                const result = await launchProject(
                    project,
                    this.codeEditorIntegrationService,
                    this.trayAvailabilityService,
                );
                if (!result.launched) {
                    this.showMainWindow();
                    ipcWebContentsSend(
                        'project-launch-code-editor-warning',
                        mainWindow.webContents,
                        { project, result },
                    );
                }
            },
            () => this.showMainWindow(),
        );
        if (this.config.isDev && !this.config.disableDevMenu) {
            createMenu(mainWindow);
        } else {
            this.electronAppService.clearApplicationMenu();
        }

        const prefs = await getUserPreferences();
        setAutoStart(prefs.auto_start, prefs.start_in_tray);
        setupAutoUpdate(
            mainWindow,
            prefs.auto_check_updates,
            60 * 60 * 1000,
            false,
            false,
            prefs.receive_beta_updates,
            async () => {
                const latestPrefs = await getUserPreferences();
                return {
                    skippedVersion: latestPrefs.skipped_app_update_version,
                };
            },
        );

        if (!this.config.docsScreenshots) {
            this.disposeFocusRevalidation = setupFocusRevalidation(
                mainWindow,
                () =>
                    this.codeEditorIntegrationService.revalidateIntegrationSettings(),
                this.gitService,
            );
        }
        electronAutoUpdater.on(
            'before-quit-for-update',
            this.handleBeforeQuitForUpdate,
        );
        app.on('before-quit', this.handleBeforeQuit);
        mainWindow.on('closed', this.disposeWindowResources);

        await this.applyInitialVisibility(prefs.start_in_tray);
    }

    revealInitialWindow(): void {
        if (!this.revealMainWindowOnRendererReady) {
            return;
        }

        this.revealMainWindowOnRendererReady = false;
        this.showMainWindow();
    }

    @OnAppLaunch()
    onAppLaunch(context: AppLaunchContext): void {
        if (context.kind === 'second-instance' && this.showMainWindow()) {
            logger.debug('Second instance, showing window');
        }
    }

    @OnMainWindowClose({ order: LifecycleHookOrder.Before })
    async onMainWindowClose(): Promise<void> {
        if (this.willClose) {
            return;
        }

        const prefs = await getUserPreferences();
        const onboardingIncomplete = prefs.first_run;

        if (onboardingIncomplete) {
            logger.debug('Incomplete onboarding, quitting instead of hiding');
            app.quit();
            return;
        }

        const hideOnClose = await this.trayAvailabilityService.isAvailable();
        this.electronAppService.setHideOnClose(hideOnClose);

        if (hideOnClose) {
            logger.debug('Hiding window');
            this.hideDockIcon();
        } else {
            logger.info(
                'System tray is unavailable; quitting when the main window closes',
            );
        }
    }

    @OnMainWindowShow({ order: LifecycleHookOrder.After })
    onMainWindowShow(): void {
        logger.debug('Showing window');
        this.showDockIcon();

        const mainWindow = this.windowManager.getMainWindow();
        if (mainWindow) {
            const iconPath = getAppIconPath();
            app.dock?.setIcon(iconPath);
            mainWindow.setIcon(iconPath);
            logger.log(`Showing Window, setting dock icon to ${iconPath}`);
        }

        this.willClose = false;
    }

    @OnAppQuit({ order: LifecycleHookOrder.Before })
    onAppQuit(): void {
        this.prepareForQuit('Quitting app');
        electronAutoUpdater.removeListener(
            'before-quit-for-update',
            this.handleBeforeQuitForUpdate,
        );
        app.removeListener('before-quit', this.handleBeforeQuit);
    }

    private readonly handleActivate = (): void => {
        logger.debug('App activated');
        this.showMainWindow();
    };

    private readonly handleBeforeQuit = (): void => {
        this.prepareForQuit('Quitting app');
    };

    private readonly handleBeforeQuitForUpdate = (): void => {
        if (this.prepareForQuit('Quitting app to install update')) {
            this.electronAppService.quit();
        }
    };

    private readonly disposeWindowResources = (): void => {
        this.disposeFocusRevalidation?.();
        this.disposeFocusRevalidation = undefined;
    };

    private get config(): AppConfig {
        return this.configService.getAll();
    }

    /** Starts stale-aware tool discovery without delaying window creation. */
    private refreshToolIntegrations(): void {
        logger.debug('Refreshing tool integrations in background...');
        void this.toolIntegrationService.refreshAll().catch((error) => {
            logger.error('Failed to refresh tool integrations:', error);
        });
    }

    private async applyInitialVisibility(startInTray: boolean): Promise<void> {
        if (this.config.startHidden) {
            if (await this.trayAvailabilityService.isAvailable()) {
                logger.debug('Hiding window on launch with --hidden');
                this.hideMainWindow();
            } else {
                logger.info(
                    'Ignoring --hidden because the Linux system tray is unavailable',
                );
                this.revealMainWindowOnRendererReady = true;
            }
            return;
        }

        if (
            process.platform === 'darwin' &&
            app.getLoginItemSettings().wasOpenedAtLogin &&
            startInTray
        ) {
            logger.info(
                'App was opened at login with prefs.start_in_tray, hiding window',
            );
            this.hideMainWindow();
            return;
        }

        this.revealMainWindowOnRendererReady = true;
    }

    private prepareForQuit(message: string): boolean {
        if (this.willClose) {
            return false;
        }

        logger.info(message);
        stopAutoUpdateChecks();
        this.disposeWindowResources();
        this.willClose = true;
        return true;
    }

    private hideMainWindow(): void {
        this.windowManager.getMainWindow()?.hide();
        this.hideDockIcon();
    }

    private showMainWindow(): boolean {
        const mainWindow = this.windowManager.revealMainWindow();
        if (!mainWindow) {
            return false;
        }

        this.showDockIcon();
        return true;
    }

    private hideDockIcon(): void {
        if (process.platform === 'darwin') {
            app.dock?.hide();
            app.setActivationPolicy('accessory');
        }
    }

    private showDockIcon(): void {
        if (process.platform === 'darwin') {
            app.setActivationPolicy('regular');
            app.dock?.show();
        }
    }
}
