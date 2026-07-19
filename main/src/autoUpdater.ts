import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setInterval } from 'node:timers';
import { promisify } from 'node:util';
import type {
    AppUpdateMessage,
    CheckForUpdatesOptions,
} from '@shared/contracts';
import { app, type BrowserWindow, type WebContents } from 'electron';
import logger from 'electron-log';
import electronUpdater, { type UpdateCheckResult } from 'electron-updater';
import semver from 'semver';
import { findExecutable } from './utils/platform.utils.js';
import { ipcWebContentsSend } from './utils.js';

let interval: NodeJS.Timeout;

let webContents: WebContents;
const { autoUpdater } = electronUpdater;
const execFileAsync = promisify(execFile);
const RPM_OSTREE_STATUS_TIMEOUT_MS = 3000;
const LAUNCHER_DOWNLOAD_URL = 'https://godotlauncher.org/download/';

type PrereleaseChannel = 'alpha' | 'beta' | 'rc';
type AutoUpdateCheckOptions = CheckForUpdatesOptions & {
    skippedVersion?: string;
};
type CheckForUpdatesOptionsProvider = () => Promise<
    AutoUpdateCheckOptions | undefined
>;

let checkForUpdatesOptionsProvider: CheckForUpdatesOptionsProvider | undefined;

function getComparableVersion(version: string): string | null {
    const validVersion = semver.valid(version);
    if (validVersion) {
        return validVersion;
    }

    return semver.coerce(version)?.version ?? null;
}

function getCurrentPrereleaseChannel(
    appVersion: string,
): PrereleaseChannel | null {
    const prerelease = semver.prerelease(appVersion);
    if (!prerelease || prerelease.length === 0) {
        return null;
    }

    const identifier = prerelease[0];
    if (
        identifier === 'alpha' ||
        identifier === 'beta' ||
        identifier === 'rc'
    ) {
        return identifier;
    }

    return null;
}

function isNewerVersion(
    candidateVersion: string,
    currentVersion: string,
): boolean {
    const normalizedCandidateVersion = getComparableVersion(candidateVersion);
    const normalizedCurrentVersion = getComparableVersion(currentVersion);

    if (!normalizedCandidateVersion || !normalizedCurrentVersion) {
        logger.warn(
            `Unable to compare versions. candidate="${candidateVersion}", current="${currentVersion}"`,
        );
        return false;
    }

    return semver.gt(normalizedCandidateVersion, normalizedCurrentVersion);
}

export async function isRpmOstreeSystem(): Promise<boolean> {
    if (process.platform !== 'linux') {
        return false;
    }

    if (existsSync('/run/ostree-booted')) {
        return true;
    }

    const rpmOstreePath = await findExecutable('rpm-ostree');
    if (!rpmOstreePath) {
        return false;
    }

    try {
        await execFileAsync(rpmOstreePath, ['status', '--json'], {
            timeout: RPM_OSTREE_STATUS_TIMEOUT_MS,
            windowsHide: true,
        });
        return true;
    } catch {
        return false;
    }
}

function applyBetaChannelSettings(enabled: boolean) {
    const appVersion = app.getVersion();
    const prereleaseChannel = getCurrentPrereleaseChannel(appVersion);
    const channel: PrereleaseChannel | 'latest' = enabled
        ? (prereleaseChannel ?? 'beta')
        : 'latest';

    logger.info(
        `Prerelease updates ${enabled ? 'enabled' : 'disabled'} (appVersion: ${appVersion}, channel: ${channel})`,
    );
    autoUpdater.allowPrerelease = enabled;
    autoUpdater.channel = channel;
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
    if (!interval?.hasRef()) {
        logger.info('Starting auto update check');
        const options = await checkForUpdatesOptionsProvider?.();
        // run as soon as it starts
        await checkForUpdates(options);

        interval = setInterval(async () => {
            const checkOptions = await checkForUpdatesOptionsProvider?.();
            await checkForUpdates(checkOptions);
        }, intervalMs);

        interval.ref();
    }
}

export function installUpdateAndRestart() {
    logger.info('Installing update and restarting app');
    autoUpdater.autoRunAppAfterInstall = true;
    autoUpdater.quitAndInstall(true, true);
}

export function stopAutoUpdateChecks() {
    if (interval?.hasRef()) {
        clearInterval(interval);
        interval.unref();
        logger.log('Stopped auto update checks');
    }
}

export async function downloadAppUpdate() {
    logger.info('Downloading update...');
    ipcWebContentsSend('app-updates', webContents, {
        available: true,
        downloaded: false,
        type: 'downloading',
        message: 'Downloading update...',
    });

    try {
        const download = await autoUpdater.downloadUpdate();
        logger.log('Update downloaded');
        download.forEach(logger.log);
    } catch (e) {
        logger.error('Error downloading update', e);
        ipcWebContentsSend('app-updates', webContents, {
            available: true,
            downloaded: false,
            type: 'error',
            message: 'Failed to download update',
        });
    }
}

export async function checkForUpdates(
    options?: AutoUpdateCheckOptions,
): Promise<AppUpdateMessage> {
    const ignoreSkippedVersion = options?.ignoreSkippedVersion ?? false;
    const skippedVersion = options?.skippedVersion;

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

    const newVersion = result?.updateInfo.version;
    const currentVersion = autoUpdater.currentVersion.version;
    const hasNewVersion =
        result !== null &&
        newVersion !== undefined &&
        isNewerVersion(newVersion, currentVersion);
    const isSkippedVersion =
        hasNewVersion &&
        newVersion === skippedVersion &&
        ignoreSkippedVersion === false;

    if (hasNewVersion) {
        logger.info(`New version available: ${newVersion}`);
    } else {
        logger.info(
            `No updates available (current: ${currentVersion}${newVersion ? `, latest: ${newVersion}` : ''})`,
        );
    }

    if (isSkippedVersion) {
        logger.info(
            `Update ${newVersion} is skipped by user preference, reporting as no update`,
        );
    }

    const requiresManualUpdate =
        hasNewVersion && !isSkippedVersion && (await isRpmOstreeSystem());
    const payload: AppUpdateMessage = {
        available: hasNewVersion && !isSkippedVersion,
        downloaded: false,
        type: requiresManualUpdate
            ? 'manual'
            : hasNewVersion && !isSkippedVersion
              ? 'available'
              : 'none',
        version: newVersion,
        url: requiresManualUpdate ? LAUNCHER_DOWNLOAD_URL : undefined,
        message:
            hasNewVersion && !isSkippedVersion
                ? requiresManualUpdate
                    ? `Version ${newVersion} is available. Automatic installation is not supported on this rpm-ostree system.`
                    : `New version available: ${newVersion}`
                : 'No updates available',
    };
    ipcWebContentsSend('app-updates', webContents, payload);
    return payload;
}

export async function setupAutoUpdate(
    mainWindow: BrowserWindow,
    checkForUpdates: boolean = true,
    intervalMs: number = 60 * 60 * 1000,
    autoDownload: boolean = false,
    installOnQuit: boolean = false,
    receiveBetaUpdates: boolean = false,
    getCheckForUpdatesOptions?: CheckForUpdatesOptionsProvider,
) {
    logger.info(
        `Starting auto updates, enabled: ${checkForUpdates}; autoDownload: ${autoDownload}; installOnQuit: ${installOnQuit}`,
    );

    webContents = mainWindow.webContents;

    autoUpdater.logger = logger;
    autoUpdater.autoDownload = autoDownload;
    autoUpdater.autoInstallOnAppQuit = installOnQuit;
    checkForUpdatesOptionsProvider = getCheckForUpdatesOptions;
    setBetaChannel(receiveBetaUpdates, false);

    autoUpdater.on('update-available', (info) => {
        logger.info(`Update available: ${info.version}`);
    });

    autoUpdater.on('error', (error: Error) => {
        logger.error('Error updating app', error);
        ipcWebContentsSend('app-updates', webContents, {
            available: true,
            downloaded: false,
            type: 'error',
            message: 'Failed to install update',
        });
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

    if (checkForUpdates) {
        await startAutoUpdateChecks(intervalMs);
    }
}
