import { setInterval } from 'node:timers';
import { app, type BrowserWindow, type WebContents } from 'electron';
import logger from 'electron-log';
import electronUpdater, { type UpdateCheckResult } from 'electron-updater';
import { ipcWebContentsSend } from './utils.js';

let interval: NodeJS.Timeout;

let webContents: WebContents;
const { autoUpdater } = electronUpdater;

function applyBetaChannelSettings(enabled: boolean) {
    logger.info(`Beta releases ${enabled ? 'enabled' : 'disabled'}`);
    autoUpdater.allowPrerelease = enabled;
    autoUpdater.channel = enabled ? 'beta' : null;
}

export function setBetaChannel(
    enabled: boolean,
    checkForUpdatesNow: boolean = true,
) {
    applyBetaChannelSettings(enabled);

    if (checkForUpdatesNow) {
        void checkForUpdates();
    }
}

export async function startAutoUpdateChecks(
    intervalMs: number = 60 * 60 * 1000,
) {
    if (!interval || !interval.hasRef()) {
        logger.info('Starting auto update check');
        // run as soon as it starts
        await checkForUpdates();

        interval = setInterval(async () => {
            await checkForUpdates();
        }, intervalMs);

        interval.ref();
    }
}

export function installUpdateAndRestart() {
    logger.info('Installing update and restarting app');
    autoUpdater.autoRunAppAfterInstall = true;
    autoUpdater.quitAndInstall(true, true);
    app.quit();
}

export function stopAutoUpdateChecks() {
    if (interval?.hasRef()) {
        clearInterval(interval);
        interval.unref();
        logger.log('Stopped auto update checks');
    }
}

export async function checkForUpdates() {
    logger.info('Checking for updates...');
    ipcWebContentsSend('app-updates', webContents, {
        available: false,
        downloaded: false,
        type: 'checking',
        message: 'Checking for updates...',
    });

    let result: UpdateCheckResult | null = null;
    try {
        result = await autoUpdater.checkForUpdates();
    } catch (e) {
        logger.error('Error checking for updates', e);
    }

    if (result) {
        logger.info(`New version available: ${result?.updateInfo.version}`);
    } else {
        logger.info('No updates available');
    }

    const hasNewVersion =
        result !== null &&
        result.updateInfo.version !== autoUpdater.currentVersion.version;
    const newVersion = result?.updateInfo.version;
    ipcWebContentsSend('app-updates', webContents, {
        available: hasNewVersion,
        downloaded: false,
        type: hasNewVersion ? 'available' : 'none',
        version: newVersion,
        message: hasNewVersion
            ? `New version available: ${newVersion}`
            : 'No updates available',
    });
}

export async function setupAutoUpdate(
    mainWindow: BrowserWindow,
    checkForUpdates: boolean = true,
    intervalMs: number = 60 * 60 * 1000,
    autoDownload: boolean = false,
    installOnQuit: boolean = true,
    receiveBetaUpdates: boolean = false,
) {
    logger.info(
        `Starting auto updates, enabled: ${checkForUpdates}; autoDownload: ${autoDownload}; installOnQuit: ${installOnQuit}`,
    );

    webContents = mainWindow.webContents;

    autoUpdater.logger = logger;
    autoUpdater.autoDownload = autoDownload;
    autoUpdater.autoInstallOnAppQuit = installOnQuit;
    setBetaChannel(receiveBetaUpdates, false);

    if (checkForUpdates) {
        await startAutoUpdateChecks(intervalMs);
    }

    autoUpdater.on('update-available', async (info) => {
        ipcWebContentsSend('app-updates', webContents, {
            available: true,
            downloaded: false,
            type: 'available',
            version: info.version,
            message: `New version available: ${info.version}`,
        });

        logger.info('Downloading update...');
        const download = await autoUpdater.downloadUpdate();
        logger.log('Update downloaded');
        download.forEach(logger.log);
    });

    autoUpdater.on('download-progress', (progress) => {
        logger.info(`Download progress: ${progress.percent}`);
        ipcWebContentsSend('app-updates', webContents, {
            available: true,
            downloaded: false,
            type: 'downloading',
            message: `Downloading update: ${Math.round(progress.percent)}%`,
        });
    });

    autoUpdater.on('checking-for-update', () => {
        logger.info('Checking for update...');
        ipcWebContentsSend('app-updates', webContents, {
            available: false,
            downloaded: false,
            type: 'checking',
            message: 'Checking for updates...',
        });
    });

    autoUpdater.on('update-downloaded', (event) => {
        logger.info(`Update downloaded: ${event.version}`);
        event.files.forEach(logger.log);

        ipcWebContentsSend('app-updates', webContents, {
            available: true,
            downloaded: true,
            type: 'ready',
            version: event.version,
            message: 'Update downloaded, restart to install.',
        });
    });
}
