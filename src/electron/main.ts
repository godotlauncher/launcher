import 'reflect-metadata';
import { type Application, createApplication } from '@mariodebono/di';
import { app, Menu } from 'electron';
import logger from 'electron-log/main.js';
import { AppModule } from './app.module.js';
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

let diApp: Application | undefined;

async function bootstrap(): Promise<void> {
    diApp = await createApplication(AppModule, { logger: false });

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
