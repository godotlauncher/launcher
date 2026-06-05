import type { OnModuleInit } from '@mariodebono/di';
import { Injectable } from '@mariodebono/di';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ConfigService } from '@mariodebono/di-config';
import {
    app,
    BrowserWindow,
    dialog,
    autoUpdater as electronAutoUpdater,
} from 'electron';
import logger from 'electron-log/main.js';
import { createDefaultFolder, initI18n, registerHandlers } from './app.js';
import { setupAutoUpdate, stopAutoUpdateChecks } from './autoUpdater.js';
import { checkAndUpdateProjects, checkAndUpdateReleases } from './checks.js';
import { getUserPreferences } from './commands/userPreferences.js';
import type { AppConfig } from './config/index.js';
import { createMenu } from './helpers/menu.helper.js';
import { setupFocusRevalidation } from './helpers/revalidate.helper.js';
import { createTray } from './helpers/tray.helper.js';
import { setMainWindow } from './mainWindow.js';
import { runMigrations } from './migrations/index.js';
import { getAppIconPath, getPreloadPath, getUIPath } from './pathResolver.js';
import { setAutoStart } from './utils/platform.utils.js';

@Injectable()
export class ElectronApp implements OnModuleInit {
    private disposeFocusRevalidation: (() => void) | undefined;
    private mainWindow: BrowserWindow | null = null;

    constructor(private readonly configService: ConfigService<AppConfig>) {}

    async onModuleInit(): Promise<void> {
        this.setupSingleInstanceLock();
        this.registerActivateHandler();
        this.registerReadyHandler();
    }

    private setupSingleInstanceLock(): void {
        if (this.config.isDev) {
            return;
        }

        const hasLock = app.requestSingleInstanceLock();

        if (!hasLock) {
            logger.warn('Another instance is running, quitting');
            app.quit();
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
            if (this.showMainWindow()) {
                logger.debug('Second instance, showing window');
            }
        });
    }

    private registerActivateHandler(): void {
        app.on('activate', () => {
            logger.debug('App activated');
            this.showMainWindow();
        });
    }

    private registerReadyHandler(): void {
        app.on('ready', async () => {
            await this.onReady();
        });
    }

    private async onReady(): Promise<void> {
        // only support these platforms
        const supportedPlatforms = ['darwin', 'win32', 'linux'];
        if (!supportedPlatforms.includes(process.platform)) {
            logger.error('Unsupported platform:', process.platform);
            dialog
                .showMessageBox({
                    type: 'error',
                    title: 'Unsupported platform',
                    message: 'Godot Launcher is not supported on this platform',
                    detail: `Godot Launcher is not supported on ${process.platform} platform. If you want to help us support this platform, see our contribution guide.`,
                    buttons: ['OK'],
                })
                .then(() => {
                    app.quit();
                });
            return;
        }

        await createDefaultFolder();

        try {
            await runMigrations(app.getVersion());
        } catch (error) {
            logger.error('Failed to execute migrations', error);
        }

        // Initialize i18n before creating windows
        logger.debug('Initializing i18n...');
        const userPrefs = await getUserPreferences();
        await initI18n(userPrefs.language || 'system');
        logger.debug('i18n initialized successfully');

        logger.debug('App ready, checking projects and releases');
        await checkAndUpdateProjects();
        await checkAndUpdateReleases();

        // Background tool cache refresh if stale
        logger.debug('Checking tool cache...');
        const { isCacheStale, refreshToolCache } = await import(
            './services/toolCache.js'
        );
        if (await isCacheStale()) {
            logger.debug('Tool cache is stale, refreshing in background...');
            refreshToolCache().catch((err) => {
                logger.error('Failed to refresh tool cache:', err);
            });
        } else {
            logger.debug('Tool cache is fresh');
        }

        const mainWindow = new BrowserWindow({
            width: 1024,
            height: 600,
            minWidth: 1024,
            minHeight: 600,
            icon: getAppIconPath(),
            webPreferences: {
                preload: getPreloadPath(),
            },

            show: false,
        });

        app.dock?.setIcon(getAppIconPath());
        mainWindow.setIcon(getAppIconPath());

        if (this.config.isDev) {
            mainWindow.loadURL('http://localhost:5123');
        } else {
            mainWindow.loadFile(getUIPath());
        }

        await createTray(mainWindow);
        this.handleCloseEvents(mainWindow);

        // No menu bar
        if (this.config.isDev && !this.config.disableDevMenu) {
            createMenu(mainWindow);
        }

        this.mainWindow = mainWindow;
        setMainWindow(mainWindow);
        registerHandlers();

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

        this.disposeFocusRevalidation = setupFocusRevalidation(mainWindow);

        mainWindow.on('ready-to-show', async () => {
            if (process.platform === 'darwin') {
                if (this.config.startHidden) {
                    logger.debug('Hiding window on launch with --hidden');
                    this.hideMainWindow(mainWindow);
                } else if (app.getLoginItemSettings().wasOpenedAtLogin) {
                    if (prefs.start_in_tray) {
                        logger.info(
                            'App was opened at login with prefs.start_in_tray, hiding window',
                        );
                        this.hideMainWindow(mainWindow);
                    }
                } else {
                    this.showMainWindowInstance(mainWindow);
                }
            } else if (process.platform === 'win32') {
                // check if launch argument has been passed --hidden
                if (this.config.startHidden) {
                    logger.debug('Hiding window on launch with --hidden');
                    this.hideMainWindow(mainWindow);
                } else {
                    this.showMainWindowInstance(mainWindow);
                }
            } else {
                this.showMainWindowInstance(mainWindow);
            }
        });
    }

    private handleCloseEvents(mainWindow: BrowserWindow): void {
        // Hide the window instead of closing it
        let willClose = false;
        const prepareForQuit = (message: string) => {
            if (willClose) {
                return;
            }

            logger.info(message);
            stopAutoUpdateChecks();
            this.disposeFocusRevalidation?.();
            this.disposeFocusRevalidation = undefined;
            willClose = true;
        };

        mainWindow.on('close', (e) => {
            // close if onboarding has not been completed
            getUserPreferences().then((prefs) => {
                const onboardingIncomplete =
                    (prefs.first_run && willClose === false) ||
                    (process.platform === 'win32' &&
                        !prefs.windows_symlink_win_notify &&
                        willClose === false);
                if (onboardingIncomplete) {
                    logger.debug(
                        'Incomplete onboarding, quitting instead of hiding',
                    );
                    app.quit();
                }
            });

            // if quitting the app, stop hiding the window
            if (willClose) {
                return;
            }

            logger.debug('Hiding window');
            // normal close will hide the window to tray
            e.preventDefault();
            this.hideMainWindow(mainWindow);
        });

        electronAutoUpdater.on('before-quit-for-update', () => {
            // Updater-driven installs close windows before app.before-quit fires.
            prepareForQuit('Quitting app to install update');
        });

        app.on('before-quit', () => {
            prepareForQuit('Quitting app');
        });

        mainWindow.on('show', () => {
            logger.debug('Showing window');
            this.showDockIcon();

            app.dock?.setIcon(getAppIconPath());
            mainWindow.setIcon(getAppIconPath());

            logger.log(
                `Showing Window, setting dock icon to ${getAppIconPath()}`,
            );

            willClose = false;
        });

        mainWindow.on('closed', () => {
            this.disposeFocusRevalidation?.();
            this.disposeFocusRevalidation = undefined;
        });
    }

    private get config(): AppConfig {
        return this.configService.getAll();
    }

    private hideMainWindow(mainWindow: BrowserWindow): void {
        mainWindow.hide();
        this.hideDockIcon();
    }

    private showMainWindowInstance(mainWindow: BrowserWindow): void {
        mainWindow.show();
        this.showDockIcon();
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

    private showMainWindow(): boolean {
        if (!this.mainWindow) {
            return false;
        }

        if (this.mainWindow.isMinimized()) {
            this.mainWindow.restore();
        }
        this.showMainWindowInstance(this.mainWindow);
        if (process.platform === 'darwin') {
            app.show();
        }
        this.mainWindow.focus();
        return true;
    }
}
