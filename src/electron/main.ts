import path from 'node:path';
import { app, BrowserWindow, dialog, Menu } from 'electron';
import logger from 'electron-log/main.js';
import { createDefaultFolder, initI18n, registerHandlers } from './app.js';
import { setupAutoUpdate, stopAutoUpdateChecks } from './autoUpdater.js';
import { checkAndUpdateProjects, checkAndUpdateReleases } from './checks.js';
import { getUserPreferences } from './commands/userPreferences.js';
import { createMenu } from './helpers/menu.helper.js';
import { setupFocusRevalidation } from './helpers/revalidate.helper.js';
import { createTray } from './helpers/tray.helper.js';
import { runMigrations } from './migrations/index.js';
import { getAssetPath, getPreloadPath, getUIPath } from './pathResolver.js';
import { setAutoStart } from './utils/platform.utils.js';
import { isDev } from './utils.js';

logger.initialize();

logger.info('Starting Godot Launcher');
logger.info(`Version: ${app.getVersion()}`);
logger.info(
    `Electron: ${process.versions.electron}, Chrome: ${process.versions.chrome}, Node: ${process.versions.node}, V8: ${process.versions.v8}`,
);
logger.info(`Platform: ${process.platform}, Arch: ${process.arch}`);
logger.info(`isDev: ${isDev()}`);
logger.info(`App path: ${app.getAppPath()}`);
logger.info(`Debug flags: ${process.argv.includes('--debug')}`);
if (process.platform === 'linux') {
    logger.info(
        `sandbox disabled: ${process.argv.includes('--no-sandbox') || process.argv.includes('--disable-sandbox') || process.env.GODOT_LAUNCHER_DISABLE_SANDBOX === '1'}`,
    );
}

const devNoMenu =
    process.argv.includes('--no-dev-menu') ||
    process.env.GODOT_LAUNCHER_NO_DEV_MENU === '1';
if (isDev() && devNoMenu) {
    logger.info('Developer menu disabled via --no-dev-menu flag');
}

// --- sandbox flag passthrough (must be before app.whenReady / any windows) ---
const userRequestedNoSandbox =
    process.argv.includes('--no-sandbox') ||
    process.argv.includes('--disable-sandbox') ||
    process.env.GODOT_LAUNCHER_DISABLE_SANDBOX === '1';

// Only matters on Linux; do it early so all child Chromium processes inherit it.
if (process.platform === 'linux' && userRequestedNoSandbox) {
    logger.warn('Starting with --no-sandbox flag');
    app.commandLine.appendSwitch('no-sandbox');
}

if (isDev()) {
    logger.transports.file.level = 'debug';
    logger.transports.console.level = 'debug';
} else {
    if (process.argv.includes('--debug')) {
        logger.transports.file.level = 'debug';
        logger.transports.console.level = 'debug';
    } else {
        logger.transports.file.level = 'info';
        logger.transports.console.level = 'info';
    }
}

//disable menu bar
Menu.setApplicationMenu(null);

let disposeFocusRevalidation: (() => void) | undefined;
let _mainWindow: BrowserWindow | null = null;
// biome-ignore lint/style/noNonNullAssertion: safer to use non-null assertion here
export const getMainWindow: () => BrowserWindow = () => _mainWindow!;

if (!isDev()) {
    const hasLock = app.requestSingleInstanceLock();

    if (!hasLock) {
        logger.warn('Another instance is running, quitting');
        app.quit();
    } else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
            if (_mainWindow) {
                if (_mainWindow.isMinimized()) {
                    _mainWindow.restore();
                }
                _mainWindow.show();
                app.dock?.show();
                if (process.platform === 'darwin') {
                    app.show();
                }
                _mainWindow.focus();
                logger.debug('Second instance, showing window');
            }
        });
    }
}

const platformIconDir = process.platform === 'darwin' ? 'darwin' : 'default';

app.on('activate', () => {
    logger.debug('App activated');
    if (_mainWindow) {
        if (_mainWindow.isMinimized()) {
            _mainWindow.restore();
        }
        _mainWindow.show();
        app.dock?.show();
        if (process.platform === 'darwin') {
            app.show();
        }
        _mainWindow.focus();
    }
});

app.on('ready', async () => {
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
    const { getUserPreferences } = await import(
        './commands/userPreferences.js'
    );
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
        icon: path.join(getAssetPath(), 'icons', platformIconDir, 'icon.png'),
        webPreferences: {
            preload: getPreloadPath(),
        },

        show: false,
    });

    app.dock?.setIcon(
        path.join(getAssetPath(), 'icons', platformIconDir, 'appIcon.png'),
    );
    mainWindow.setIcon(
        path.join(getAssetPath(), 'icons', platformIconDir, 'appIcon.png'),
    );

    if (isDev()) {
        mainWindow.loadURL('http://localhost:5123');
    } else {
        mainWindow.loadFile(getUIPath());
    }

    await createTray(mainWindow);
    handleCloseEvents(mainWindow);

    // No menu bar
    if (isDev() && !devNoMenu) {
        createMenu(mainWindow);
    }

    _mainWindow = mainWindow;
    registerHandlers();

    const prefs = await getUserPreferences();
    setAutoStart(prefs.auto_start, prefs.start_in_tray);

    setupAutoUpdate(
        mainWindow,
        prefs.auto_check_updates,
        60 * 60 * 1000,
        true,
        true,
    );

    disposeFocusRevalidation = setupFocusRevalidation(mainWindow);

    mainWindow.on('ready-to-show', async () => {
        if (process.platform === 'darwin') {
            if (app.getLoginItemSettings().wasOpenedAtLogin) {
                if (prefs.start_in_tray) {
                    logger.info(
                        'App was opened at login with prefs.start_in_tray, hiding window',
                    );
                    mainWindow.hide();
                    app.dock?.hide();
                }
            } else {
                mainWindow.show();
                app.dock?.show();
            }
        } else if (process.platform === 'win32') {
            // check if launch argument has been passed --hidden
            if (process.argv.includes('--hidden')) {
                logger.debug('Hiding window on launch with --hidden');
                mainWindow.hide();
                app.dock?.hide();
            } else {
                mainWindow.show();
                app.dock?.show();
            }
        } else {
            mainWindow.show();
            app.dock?.show();
        }
    });
});

function handleCloseEvents(mainWindow: BrowserWindow) {
    // Hide the window instead of closing it
    let willClose = false;

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
        mainWindow.hide();
        app.dock?.hide();
    });

    app.on('before-quit', () => {
        logger.info('Quitting app');
        stopAutoUpdateChecks();
        disposeFocusRevalidation?.();
        disposeFocusRevalidation = undefined;
        willClose = true;
    });

    mainWindow.on('show', () => {
        logger.debug('Showing window');

        app.dock?.setIcon(
            path.join(getAssetPath(), 'icons', platformIconDir, 'appIcon.png'),
        );
        mainWindow.setIcon(
            path.join(getAssetPath(), 'icons', platformIconDir, 'appIcon.png'),
        );

        logger.log(
            `Showing Window, setting dock icon to ${path.join(getAssetPath(), 'icons', platformIconDir, 'appIcon.png')}`,
        );

        willClose = false;
    });

    mainWindow.on('closed', () => {
        disposeFocusRevalidation?.();
        disposeFocusRevalidation = undefined;
    });
}
