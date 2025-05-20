import path from 'node:path';
import { BrowserWindow, app, Menu, dialog } from 'electron';
import { isDev } from './utils.js';
import { getAssetPath, getPreloadPath, getUIPath } from './pathResolver.js';
import logger from 'electron-log/main.js';
import { createTray } from './helpers/tray.helper.js';
import { createMenu } from './helpers/menu.helper.js';
import { registerHandlers, createDefaultFolder } from './app.js';
import { checkAndUpdateProjects, checkAndUpdateReleases } from './checks.js';
import { getUserPreferences } from './commands/userPreferences.js';
import { setAutoStart } from './utils/platform.utils.js';
import { setupAutoUpdate, stopAutoUpdateChecks } from './autoUpdater.js';

logger.initialize();

if (isDev()) {
    logger.transports.file.level = 'debug';
    logger.transports.console.level = 'debug';
}
else {
    if (process.argv.includes('--debug')) {
        logger.transports.file.level = 'debug';
        logger.transports.console.level = 'debug';
    }
    else {
        logger.transports.file.level = 'info';
        logger.transports.console.level = 'info';
    }
}

//disable menu bar
Menu.setApplicationMenu(null);

let _mainWindow: BrowserWindow | null = null;
export const getMainWindow: () => BrowserWindow = () => _mainWindow!;

if (!isDev()) {
    const hasLock = app.requestSingleInstanceLock();

    if (!hasLock) {
        logger.warn('Another instance is running, quitting');
        app.quit();
    }
    else {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        app.on('second-instance', (event, commandLine, workingDirectory) => {

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
        dialog.showMessageBox({
            type: 'error',
            title: 'Unsupported platform',
            message: 'Godot Launcher is not supported on this platform',
            detail: `Godot Launcher is not supported on ${process.platform} platform. If you want to help us support this platform, see our contribution guide.`,
            buttons: ['OK']
        }).then(() => {
            app.quit();
        });
        return;
    }

    await createDefaultFolder();

    logger.debug('App ready, checking projects and releases');
    await checkAndUpdateProjects();
    await checkAndUpdateReleases();



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

    app.dock?.setIcon(path.join(getAssetPath(), 'icons', platformIconDir, 'appIcon.png'));
    mainWindow.setIcon(path.join(getAssetPath(), 'icons', platformIconDir, 'appIcon.png'));



    if (isDev()) {
        mainWindow.loadURL('http://localhost:5123');
    }
    else {
        mainWindow.loadFile(getUIPath());
    }

    await createTray(mainWindow);
    handleCloseEvents(mainWindow);

    // No menu bar
    if (isDev()) {
        createMenu(mainWindow);
    }

    _mainWindow = mainWindow;
    registerHandlers();

    const prefs = await getUserPreferences();
    setAutoStart(prefs.auto_start, prefs.start_in_tray);

    setupAutoUpdate(mainWindow, prefs.auto_check_updates, 60 * 60 * 1000, true, true);

    mainWindow.on('ready-to-show', async () => {

        if (process.platform === 'darwin') {
            if (app.getLoginItemSettings().wasOpenedAtLogin) {
                if (prefs.start_in_tray) {
                    logger.info('App was opened at login with prefs.start_in_tray, hiding window');
                    mainWindow.hide();
                    app.dock?.hide();
                }
            } else {
                mainWindow.show();
                app.dock?.show();
            }

        }
        else if (process.platform === 'win32') {
            // check if launch argument has been passed --hidden
            if (process.argv.includes('--hidden')) {
                logger.debug('Hiding window on launch with --hidden');
                mainWindow.hide();
                app.dock?.hide();
            }
            else {
                mainWindow.show();
                app.dock?.show();
            }
        }
        else {
            mainWindow.show();
            app.dock?.show();
        }
    });
});



function handleCloseEvents(mainWindow: BrowserWindow) {

    // Hide the window instead of closing it
    let willClose = false;

    mainWindow.on('close', (e) => {



        // close if no onboarding has been done
        getUserPreferences().then(prefs => {
            if (prefs.first_run && willClose === false) {
                logger.debug('First run, quitting instead of hiding');
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
        willClose = true;
    });

    mainWindow.on('show', () => {
        logger.debug('Showing window');

        app.dock?.setIcon(path.join(getAssetPath(), 'icons', platformIconDir, 'appIcon.png'));
        mainWindow.setIcon(path.join(getAssetPath(), 'icons', platformIconDir, 'appIcon.png'));

        logger.log(`Showing Window, setting dock icon to ${path.join(getAssetPath(), 'icons', platformIconDir, 'appIcon.png')}`);

        willClose = false;
    });

}
