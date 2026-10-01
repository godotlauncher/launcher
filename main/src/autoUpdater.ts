import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setInterval } from 'node:timers';
import { promisify } from 'node:util';
import type {
    AppUpdateMessage,
    AppUpdateOperation,
    CheckForUpdatesOptions,
} from '@shared/contracts';
import { app, type BrowserWindow, type WebContents } from 'electron';
import logger from 'electron-log';
import electronUpdater, { type UpdateCheckResult } from 'electron-updater';
import semver from 'semver';
import { LAUNCHER_DOWNLOAD_URL } from './constants.js';
import { findExecutable } from './utils/platform.utils.js';
import { ipcWebContentsSend } from './utils.js';

let interval: NodeJS.Timeout | undefined;
let startChecksPromise: Promise<void> | undefined;
let checkPromise: Promise<AppUpdateMessage> | undefined;
let activeCheckOptions: AutoUpdateCheckOptions | undefined;
let downloadPromise: Promise<void> | undefined;
let installing = false;
let generation = 0;
let schedulerGeneration = 0;
let changingChannel = false;
let currentStatus: AppUpdateMessage = {
    type: 'none',
    available: false,
    downloaded: false,
};

let webContents: WebContents;
const { autoUpdater } = electronUpdater;
const execFileAsync = promisify(execFile);
const RPM_OSTREE_STATUS_TIMEOUT_MS = 3000;

type PrereleaseChannel = 'alpha' | 'beta' | 'rc';
type AutoUpdateCheckOptions = CheckForUpdatesOptions & {
    skippedVersion?: string;
};
type CheckForUpdatesOptionsProvider = () => Promise<
    AutoUpdateCheckOptions | undefined
>;

let checkForUpdatesOptionsProvider: CheckForUpdatesOptionsProvider | undefined;

/** Normalise a release version for comparison.
 * @param version Release version to compare.
 */
function getComparableVersion(version: string): string | null {
    const validVersion = semver.valid(version);
    if (validVersion) {
        return validVersion;
    }

    return semver.coerce(version)?.version ?? null;
}

/** Read the channel used by a prerelease build.
 * @param appVersion Installed application version.
 */
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

/** Compare a candidate release with the installed version.
 * @param candidateVersion Candidate release version.
 * @param currentVersion Installed version.
 */
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

/** Detect systems that require a manual application update. */
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

/** Apply the selected release channel to the updater.
 * @param enabled Whether prerelease updates are enabled.
 */
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

/** Publish and retain the authoritative update status.
 * @param payload Status to send to the renderer.
 */
function publishStatus(payload: AppUpdateMessage): AppUpdateMessage {
    currentStatus = payload;
    ipcWebContentsSend('app-updates', webContents, payload);
    return payload;
}

/** Publish one operation failure while keeping any selected release.
 * @param operation Operation that failed.
 */
function publishFailure(operation: AppUpdateOperation): AppUpdateMessage {
    if (
        currentStatus.type === 'error' &&
        currentStatus.failedOperation === operation
    ) {
        return currentStatus;
    }
    return publishStatus({
        available: currentStatus.available,
        downloaded: currentStatus.downloaded,
        version: currentStatus.version,
        type: 'error',
        failedOperation: operation,
        message: `Failed to ${operation === 'check' ? 'check for updates' : `${operation} update`}`,
    });
}

/** Report whether changing the updater target would interrupt an operation. */
export function isAppUpdateBusy(): boolean {
    return Boolean(
        checkPromise ||
            downloadPromise ||
            installing ||
            changingChannel ||
            currentStatus.type === 'checking' ||
            currentStatus.type === 'downloading' ||
            currentStatus.downloaded,
    );
}

/** Change release channel only when the updater is idle.
 * @param enabled Whether prerelease updates are enabled.
 * @param checkForUpdatesNow Whether to start a check after applying the channel.
 */
export function setBetaChannel(
    enabled: boolean,
    checkForUpdatesNow: boolean = true,
): boolean {
    if (isAppUpdateBusy()) {
        return false;
    }
    applyBetaChannelSettings(enabled);
    if (checkForUpdatesNow) {
        void checkForUpdates();
    }
    return true;
}

/** Reserve update operations while the selected channel preference is saved.
 * @param enabled Whether prerelease updates are enabled.
 * @param persistPreference Callback that saves the preference.
 */
export async function changeBetaChannel(
    enabled: boolean,
    persistPreference: () => Promise<unknown>,
): Promise<boolean> {
    if (isAppUpdateBusy()) return false;
    changingChannel = true;
    const startedGeneration = generation;
    try {
        await persistPreference();
        if (startedGeneration !== generation) return false;
        applyBetaChannelSettings(enabled);
    } finally {
        if (startedGeneration === generation) changingChannel = false;
    }
    void checkForUpdates();
    return true;
}

/** Start one scheduler and perform its initial update check.
 * @param intervalMs Delay between automatic checks.
 */
export async function startAutoUpdateChecks(
    intervalMs: number = 60 * 60 * 1000,
) {
    if (interval) return;
    if (startChecksPromise) return startChecksPromise;
    const startedGeneration = schedulerGeneration;
    const starting = Promise.resolve().then(async () => {
        await runScheduledCheck();
        if (startedGeneration !== schedulerGeneration) return;
        interval = setInterval(() => {
            void runScheduledCheck();
        }, intervalMs);
    });
    startChecksPromise = starting;
    try {
        await starting;
    } finally {
        if (startChecksPromise === starting) startChecksPromise = undefined;
    }
}

/** Run a background check with the latest skip preference. */
async function runScheduledCheck() {
    if (isAppUpdateBusy()) return;
    const startedGeneration = generation;
    const startedSchedulerGeneration = schedulerGeneration;
    try {
        const options = await checkForUpdatesOptionsProvider?.();
        if (
            startedGeneration === generation &&
            startedSchedulerGeneration === schedulerGeneration
        ) {
            await checkForUpdates(options);
        }
    } catch (error) {
        logger.error('Error reading update check options', error);
    }
}

/** Install a downloaded release once, after an explicit restart request. */
export function installUpdateAndRestart() {
    if (!currentStatus.downloaded || installing) return;
    installing = true;
    logger.info('Installing update and restarting app');
    autoUpdater.autoRunAppAfterInstall = true;
    try {
        autoUpdater.quitAndInstall(true, true);
    } catch (error) {
        installing = false;
        logger.error('Error installing update', error);
        publishFailure('install');
    }
}

/** Stop scheduled checks and invalidate a pending scheduler startup. */
export function stopAutoUpdateChecks() {
    schedulerGeneration += 1;
    startChecksPromise = undefined;
    if (interval) {
        clearInterval(interval);
        interval = undefined;
        logger.log('Stopped auto update checks');
    }
}

/** Download only the selected release, coalescing duplicate requests. */
export async function downloadAppUpdate() {
    if (downloadPromise) return downloadPromise;
    if (
        checkPromise ||
        installing ||
        changingChannel ||
        !(
            currentStatus.type === 'available' ||
            (currentStatus.type === 'error' &&
                currentStatus.failedOperation === 'download')
        )
    )
        return;
    const startedGeneration = generation;
    publishStatus({
        available: true,
        downloaded: false,
        version: currentStatus.version,
        type: 'downloading',
        message: 'Downloading update...',
    });
    const downloading = Promise.resolve().then(async () => {
        try {
            await autoUpdater.downloadUpdate();
        } catch (error) {
            logger.error('Error downloading update', error);
            if (startedGeneration === generation && !currentStatus.downloaded)
                publishFailure('download');
        }
    });
    downloadPromise = downloading;
    try {
        await downloading;
    } finally {
        if (downloadPromise === downloading) downloadPromise = undefined;
    }
}

/** Check for a release while protecting an active or downloaded target.
 * @param options Skip preferences and manual-check overrides.
 */
export async function checkForUpdates(
    options?: AutoUpdateCheckOptions,
): Promise<AppUpdateMessage> {
    if (checkPromise) {
        if (options?.ignoreSkippedVersion && activeCheckOptions) {
            activeCheckOptions.ignoreSkippedVersion = true;
        }
        return checkPromise;
    }
    if (isAppUpdateBusy()) return currentStatus;
    const startedGeneration = generation;
    const checkOptions: AutoUpdateCheckOptions = { ...options };
    activeCheckOptions = checkOptions;
    publishStatus({
        available: false,
        downloaded: false,
        type: 'checking',
        version: currentStatus.version,
        message: 'Checking for updates...',
    });
    const checking = Promise.resolve().then(async () => {
        try {
            const result = await autoUpdater.checkForUpdates();
            if (startedGeneration !== generation) return currentStatus;
            if (currentStatus.type === 'error') return currentStatus;
            return await reportCheckResult(
                result,
                checkOptions,
                startedGeneration,
            );
        } catch (error) {
            logger.error('Error checking for updates', error);
            return startedGeneration === generation
                ? publishFailure('check')
                : currentStatus;
        }
    });
    checkPromise = checking;
    try {
        return await checking;
    } finally {
        if (checkPromise === checking) {
            checkPromise = undefined;
            activeCheckOptions = undefined;
        }
    }
}

/** Resolve version and platform eligibility for a completed check.
 * @param result Updater check result.
 * @param options Skip preferences and manual-check overrides.
 * @param startedGeneration Lifecycle that started the check.
 */
async function reportCheckResult(
    result: UpdateCheckResult | null,
    options: AutoUpdateCheckOptions | undefined,
    startedGeneration: number,
): Promise<AppUpdateMessage> {
    const newVersion = result?.updateInfo.version;
    const currentVersion = autoUpdater.currentVersion.version;
    const hasNewVersion =
        result !== null &&
        newVersion !== undefined &&
        isNewerVersion(newVersion, currentVersion);
    // Read the final skip policy after platform detection so a joining manual
    // check can promote the pending request without another provider call.
    const manualUpdateSystem = hasNewVersion && (await isRpmOstreeSystem());
    const isSkippedVersion =
        hasNewVersion &&
        newVersion === options?.skippedVersion &&
        options?.ignoreSkippedVersion !== true;

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
        hasNewVersion && !isSkippedVersion && manualUpdateSystem;
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
    if (startedGeneration !== generation || currentStatus.type === 'error')
        return currentStatus;
    return publishStatus(payload);
}

/** Configure updater listeners and explicit update actions.
 * @param mainWindow Window receiving update status.
 * @param checkForUpdates Whether scheduled checks are enabled.
 * @param intervalMs Delay between scheduled checks.
 * @param autoDownload Legacy setting; downloads require an explicit action.
 * @param installOnQuit Legacy setting; installation requires an explicit restart.
 * @param receiveBetaUpdates Whether prerelease updates are enabled.
 * @param getCheckForUpdatesOptions Provider for background skip preferences.
 */
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

    stopAutoUpdateChecks();
    generation += 1;
    changingChannel = false;
    for (const [event, listener] of updaterListeners)
        autoUpdater.removeListener(event, listener);
    updaterListeners = [];
    checkPromise = undefined;
    activeCheckOptions = undefined;
    downloadPromise = undefined;
    installing = false;
    currentStatus = { type: 'none', available: false, downloaded: false };
    webContents = mainWindow.webContents;
    autoUpdater.logger = logger;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    checkForUpdatesOptionsProvider = getCheckForUpdatesOptions;
    applyBetaChannelSettings(receiveBetaUpdates);

    listen('error', (error: Error) => {
        logger.error('Error updating app', error);
        if (installing) {
            installing = false;
            publishFailure('install');
        } else if (downloadPromise && !currentStatus.downloaded) {
            publishFailure('download');
        } else if (checkPromise) {
            publishFailure('check');
        }
    });
    listen('download-progress', (progress: { percent: number }) => {
        if (!downloadPromise || currentStatus.type !== 'downloading') return;
        const progressPercent = Number.isFinite(progress.percent)
            ? Math.min(100, Math.max(0, progress.percent))
            : undefined;
        publishStatus({
            available: true,
            downloaded: false,
            version: currentStatus.version,
            type: 'downloading',
            progressPercent,
            message:
                progressPercent === undefined
                    ? 'Downloading update...'
                    : `Downloading update: ${Math.round(progressPercent)}%`,
        });
    });
    listen('update-downloaded', (event: { version: string }) => {
        if (
            !downloadPromise ||
            currentStatus.downloaded ||
            event.version !== currentStatus.version
        )
            return;
        publishStatus({
            available: true,
            downloaded: true,
            type: 'ready',
            version: currentStatus.version,
            message: 'Update downloaded, restart to install.',
        });
    });
    if (checkForUpdates) await startAutoUpdateChecks(intervalMs);
}

type UpdaterEvent = Parameters<typeof autoUpdater.on>[0];
type UpdaterListener = Parameters<typeof autoUpdater.on>[1];
let updaterListeners: [UpdaterEvent, UpdaterListener][] = [];

/** Register an updater listener that can be removed during setup.
 * @param event Updater event name.
 * @param listener Handler for the event.
 */
function listen(event: UpdaterEvent, listener: UpdaterListener) {
    updaterListeners.push([event, listener]);
    autoUpdater.on(event, listener);
}
