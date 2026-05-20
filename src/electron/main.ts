import 'reflect-metadata';
import { type Application, createApplication } from '@mariodebono/di';
import { app, Menu } from 'electron';
import logger from 'electron-log/main.js';
import { AppModule } from './app.module.js';
import { configuration, setCurrentAppConfig } from './config/index.js';

const appConfig = configuration({
    args: process.argv,
    env: process.env,
});
setCurrentAppConfig(appConfig);

logger.initialize();

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
    diApp = await createApplication(AppModule.forRoot(appConfig), {
        logger: false,
    });

    app.on('will-quit', () => {
        void diApp?.destroyAsync().catch((error) => {
            logger.error('Failed to destroy application', error);
        });
    });
}

void bootstrap().catch((error) => {
    logger.error('Failed to bootstrap application', error);
    app.quit();
});
