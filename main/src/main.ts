import 'reflect-metadata';
import path from 'node:path';
import type { Application } from '@mariodebono/di';
import { createElectronApplication } from '@mariodebono/di-electron';
import { app, Menu } from 'electron';
import logger from 'electron-log/main.js';
import { AppModule } from './app.module.js';
import { configuration, setCurrentAppConfig } from './config/index.js';
import { getAppIconPath, getUIPath } from './pathResolver.js';
import {
    closeSplashscreen,
    showSplashscreen,
} from './splashscreen/splashscreen.js';

const appConfig = configuration({
    args: process.argv,
    env: process.env,
});
setCurrentAppConfig(appConfig);

if (appConfig.isDev) {
    const devLogPath = path.join(
        app.getAppPath(),
        '.debug',
        'logs',
        'main.log',
    );
    logger.transports.file.resolvePathFn = () => devLogPath;
}

logger.initialize();
logger.debug('Raw process argv before CLI parsing:', process.argv);

logger.info('Starting Godot Launcher');
logger.info(`Version: ${app.getVersion()}`);
logger.info(
    `Electron: ${process.versions.electron}, Chrome: ${process.versions.chrome}, Node: ${process.versions.node}, V8: ${process.versions.v8}`,
);
logger.info(`Platform: ${process.platform}, Arch: ${process.arch}`);
logger.info(`isDev: ${appConfig.isDev}`);
logger.info(`App path: ${app.getAppPath()}`);
logger.info(`Debug flags: ${appConfig.debugMode}`);
if (process.platform === 'linux') {
    logger.info(`sandbox disabled: ${appConfig.disableSandbox}`);
}

if (appConfig.isDev && appConfig.disableDevMenu) {
    logger.info('Developer menu disabled via --no-dev-menu flag');
}

// Only matters on Linux; do it early so all child Chromium processes inherit it.
if (process.platform === 'linux' && appConfig.disableSandbox) {
    logger.warn('Starting with --no-sandbox flag');
    app.commandLine.appendSwitch('no-sandbox');
}

if (appConfig.isDev) {
    logger.transports.file.level = 'debug';
    logger.transports.console.level = 'debug';
} else {
    if (appConfig.debugMode) {
        logger.transports.file.level = 'debug';
        logger.transports.console.level = 'debug';
    } else {
        logger.transports.file.level = 'info';
        logger.transports.console.level = 'info';
    }
}

//disable menu bar
Menu.setApplicationMenu(null);

let diApp: Application | undefined;

async function bootstrap(): Promise<void> {
    if (!appConfig.startHidden && !appConfig.docsScreenshots) {
        showSplashscreen();
    }

    const applicationPromise = createElectronApplication(AppModule, {
        instanceMode: appConfig.isDev ? 'multi' : 'single',
        hideOnClose: true,
        logger: ['error', 'warn'],
        loggerOptions: {
            loggerInstance: logger,
        },
        mainWindowOptions: {
            url: appConfig.isDev ? 'http://localhost:5123' : getUIPath(),
            startMode: 'hidden',
            width: 1024,
            height: 600,
            minWidth: 1024,
            minHeight: 600,
            icon: getAppIconPath(),
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
            },
        },
    });

    try {
        const result = await applicationPromise;

        if (result.status === 'redirected') {
            closeSplashscreen();
            return;
        }

        diApp = result.application;
        app.on('will-quit', () => {
            closeSplashscreen();
            void diApp?.destroyAsync().catch((error) => {
                logger.error('Failed to destroy application', error);
            });
        });
    } catch (error) {
        closeSplashscreen();
        throw error;
    }
}

void bootstrap().catch((error) => {
    logger.error('Failed to bootstrap application', error);
    app.quit();
});
