import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const checkForUpdates = vi.fn();
    const execFile = vi.fn(
        (
            _command: string,
            _args: string[],
            _options: unknown,
            callback: (
                error: Error | null,
                stdout: string,
                stderr: string,
            ) => void,
        ) => {
            callback(null, '{}', '');
        },
    );
    const existsSync = vi.fn(() => false);
    const findExecutable = vi.fn(async () => null as string | null);
    const on = vi.fn();
    const downloadUpdate = vi.fn();
    const quitAndInstall = vi.fn();
    const ipcWebContentsSend = vi.fn();
    const getVersion = vi.fn(() => '1.9.0');
    const quit = vi.fn();

    const autoUpdater = {
        allowPrerelease: false,
        channel: 'latest',
        currentVersion: { version: '1.9.0' },
        autoDownload: false,
        autoInstallOnAppQuit: true,
        autoRunAppAfterInstall: true,
        logger: null,
        on,
        removeListener: vi.fn(),
        checkForUpdates,
        downloadUpdate,
        quitAndInstall,
    };

    return {
        autoUpdater,
        checkForUpdates,
        downloadUpdate,
        execFile,
        existsSync,
        findExecutable,
        getVersion,
        ipcWebContentsSend,
        on,
        quit,
        quitAndInstall,
    };
});

vi.mock('electron-updater', () => ({
    default: {
        autoUpdater: mocks.autoUpdater,
    },
}));

vi.mock('node:child_process', () => ({
    execFile: mocks.execFile,
}));

vi.mock('node:fs', () => ({
    existsSync: mocks.existsSync,
}));

vi.mock('electron', () => ({
    app: {
        getVersion: mocks.getVersion,
        quit: mocks.quit,
    },
}));

vi.mock('electron-log', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
    },
}));

vi.mock('./utils.js', () => ({
    ipcWebContentsSend: mocks.ipcWebContentsSend,
}));

vi.mock('./utils/platform.utils.js', () => ({
    findExecutable: mocks.findExecutable,
}));

import {
    changeBetaChannel,
    checkForUpdates,
    downloadAppUpdate,
    installUpdateAndRestart,
    isAppUpdateBusy,
    isRpmOstreeSystem,
    setBetaChannel,
    setupAutoUpdate,
    startAutoUpdateChecks,
    stopAutoUpdateChecks,
} from './autoUpdater.js';

const originalPlatform = process.platform;

/** Select the platform branch under test.
 * @param platform Platform to emulate.
 */
function setPlatform(platform: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', {
        configurable: true,
        value: platform,
    });
}

describe('autoUpdater', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mocks.autoUpdater.allowPrerelease = false;
        mocks.autoUpdater.channel = 'latest';
        mocks.autoUpdater.currentVersion = { version: '1.9.0' };
        mocks.getVersion.mockReturnValue('1.9.0');
        mocks.checkForUpdates.mockResolvedValue(null);
        mocks.existsSync.mockReturnValue(false);
        mocks.findExecutable.mockResolvedValue(null);
        mocks.execFile.mockImplementation(
            (
                _command: string,
                _args: string[],
                _options: unknown,
                callback: (
                    error: Error | null,
                    stdout: string,
                    stderr: string,
                ) => void,
            ) => {
                callback(null, '{}', '');
            },
        );
        setPlatform(originalPlatform);
        mocks.downloadUpdate.mockResolvedValue([]);
        await setupAutoUpdate({ webContents: {} } as BrowserWindow, false);
        mocks.on.mockClear();
    });

    afterEach(() => {
        stopAutoUpdateChecks();
        vi.useRealTimers();
        setPlatform(originalPlatform);
    });

    it('uses current prerelease channel for prerelease builds', () => {
        mocks.getVersion.mockReturnValue('1.9.0-rc.1');

        setBetaChannel(true, false);

        expect(mocks.autoUpdater.allowPrerelease).toBe(true);
        expect(mocks.autoUpdater.channel).toBe('rc');
    });

    it('uses beta channel for stable builds when prerelease updates are enabled', () => {
        mocks.getVersion.mockReturnValue('1.9.0');

        setBetaChannel(true, false);

        expect(mocks.autoUpdater.allowPrerelease).toBe(true);
        expect(mocks.autoUpdater.channel).toBe('beta');
    });

    it('does not report an older version as an available update', async () => {
        mocks.autoUpdater.currentVersion = { version: '1.9.0-rc.1' };
        mocks.checkForUpdates.mockResolvedValue({
            updateInfo: { version: '1.9.0-beta.5' },
        });

        const browserWindow = { webContents: {} } as BrowserWindow;
        await setupAutoUpdate(browserWindow, false);
        await checkForUpdates();

        const payload = mocks.ipcWebContentsSend.mock.calls.at(-1)?.[2];
        expect(payload.available).toBe(false);
        expect(payload.type).toBe('none');
        expect(payload.version).toBe('1.9.0-beta.5');
    });

    it('reports a newer version as an available update', async () => {
        mocks.autoUpdater.currentVersion = { version: '1.9.0-rc.1' };
        mocks.checkForUpdates.mockResolvedValue({
            updateInfo: { version: '1.9.0-rc.2' },
        });

        const browserWindow = { webContents: {} } as BrowserWindow;
        await setupAutoUpdate(browserWindow, false);
        await checkForUpdates();

        const payload = mocks.ipcWebContentsSend.mock.calls.at(-1)?.[2];
        expect(payload.available).toBe(true);
        expect(payload.type).toBe('available');
        expect(payload.version).toBe('1.9.0-rc.2');
    });

    it('suppresses a skipped version during background checks', async () => {
        mocks.autoUpdater.currentVersion = { version: '1.9.0' };
        mocks.checkForUpdates.mockResolvedValue({
            updateInfo: { version: '1.9.1' },
        });

        const browserWindow = { webContents: {} } as BrowserWindow;
        await setupAutoUpdate(browserWindow, false);
        await checkForUpdates({ skippedVersion: '1.9.1' });

        const payload = mocks.ipcWebContentsSend.mock.calls.at(-1)?.[2];
        expect(payload.available).toBe(false);
        expect(payload.type).toBe('none');
        expect(payload.version).toBe('1.9.1');
    });

    it('allows manual check override for a skipped version', async () => {
        mocks.autoUpdater.currentVersion = { version: '1.9.0' };
        mocks.checkForUpdates.mockResolvedValue({
            updateInfo: { version: '1.9.1' },
        });

        const browserWindow = { webContents: {} } as BrowserWindow;
        await setupAutoUpdate(browserWindow, false);
        await checkForUpdates({
            skippedVersion: '1.9.1',
            ignoreSkippedVersion: true,
        });

        const payload = mocks.ipcWebContentsSend.mock.calls.at(-1)?.[2];
        expect(payload.available).toBe(true);
        expect(payload.type).toBe('available');
        expect(payload.version).toBe('1.9.1');
    });

    it('reports manual update instructions on rpm-ostree systems', async () => {
        setPlatform('linux');
        mocks.existsSync.mockReturnValue(true);
        mocks.autoUpdater.currentVersion = { version: '1.9.0' };
        mocks.checkForUpdates.mockResolvedValue({
            updateInfo: { version: '1.9.1' },
        });

        const browserWindow = { webContents: {} } as BrowserWindow;
        await setupAutoUpdate(browserWindow, false);
        await checkForUpdates();

        const payload = mocks.ipcWebContentsSend.mock.calls.at(-1)?.[2];
        expect(payload.available).toBe(true);
        expect(payload.downloaded).toBe(false);
        expect(payload.type).toBe('manual');
        expect(payload.version).toBe('1.9.1');
        expect(payload.url).toBe('https://godotlauncher.org/download/');
    });

    it('detects rpm-ostree systems when status succeeds', async () => {
        setPlatform('linux');
        mocks.existsSync.mockReturnValue(false);
        mocks.findExecutable.mockResolvedValue('/usr/bin/rpm-ostree');

        await expect(isRpmOstreeSystem()).resolves.toBe(true);

        expect(mocks.execFile).toHaveBeenCalledWith(
            '/usr/bin/rpm-ostree',
            ['status', '--json'],
            { timeout: 3000, windowsHide: true },
            expect.any(Function),
        );
    });

    it('does not auto-download when update is found', async () => {
        await selectUpdate();
        expect(mocks.downloadUpdate).not.toHaveBeenCalled();
    });

    it('registers updater event listeners before first startup check', async () => {
        const browserWindow = { webContents: {} } as BrowserWindow;
        await setupAutoUpdate(browserWindow, true);

        const firstOnCallOrder = Math.min(...mocks.on.mock.invocationCallOrder);
        const firstCheckCallOrder =
            mocks.checkForUpdates.mock.invocationCallOrder[0];

        expect(firstOnCallOrder).toBeLessThan(firstCheckCallOrder);
    });

    it('uses explicit restart flow by disabling install-on-quit', async () => {
        const browserWindow = { webContents: {} } as BrowserWindow;
        await setupAutoUpdate(browserWindow, false);

        expect(mocks.autoUpdater.autoDownload).toBe(false);
        expect(mocks.autoUpdater.autoInstallOnAppQuit).toBe(false);
    });

    it('downloads an update only when explicitly requested', async () => {
        const browserWindow = { webContents: {} } as BrowserWindow;
        await setupAutoUpdate(browserWindow, false);

        await selectUpdate();
        await downloadAppUpdate();

        expect(mocks.downloadUpdate).toHaveBeenCalledTimes(1);
    });

    it('does not force an extra app quit during explicit install', async () => {
        await readyUpdate();
        installUpdateAndRestart();

        expect(mocks.autoUpdater.autoRunAppAfterInstall).toBe(true);
        expect(mocks.quitAndInstall).toHaveBeenCalledWith(true, true);
        expect(mocks.quit).not.toHaveBeenCalled();
    });
});

/** Select a downloadable update through the check boundary. */
async function selectUpdate() {
    await setupAutoUpdate({ webContents: {} } as BrowserWindow, false);
    mocks.checkForUpdates.mockResolvedValue({
        updateInfo: { version: '1.9.1' },
    });
    await checkForUpdates();
}
/** Emit an updater event through its registered handler.
 * @param event Event to emit.
 * @param payload Event value.
 */
function emit(event: string, payload: unknown) {
    mocks.on.mock.calls.findLast((call) => call[0] === event)?.[1]?.(payload);
}
/** Read the last renderer status. */
function lastStatus() {
    return mocks.ipcWebContentsSend.mock.calls.at(-1)?.[2];
}
/** Create a controllable asynchronous boundary. */
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}
/** Download a selected release and emit its completion. */
async function readyUpdate() {
    await selectUpdate();
    mocks.downloadUpdate.mockImplementationOnce(async () => {
        emit('update-downloaded', { version: '1.9.1' });
        return [];
    });
    await downloadAppUpdate();
}

describe('update operation ordering', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        mocks.autoUpdater.currentVersion = { version: '1.9.0' };
        mocks.getVersion.mockReturnValue('1.9.0');
        mocks.existsSync.mockReturnValue(false);
        mocks.findExecutable.mockResolvedValue(null);
        mocks.downloadUpdate.mockResolvedValue([]);
        mocks.checkForUpdates.mockResolvedValue(null);
        await setupAutoUpdate({ webContents: {} } as BrowserWindow, false);
    });
    afterEach(() => {
        stopAutoUpdateChecks();
        vi.useRealTimers();
        setPlatform(originalPlatform);
    });

    it('coalesces checks and blocks downloads and channel changes until checks settle', async () => {
        const pending = deferred<null>();
        mocks.checkForUpdates.mockReturnValue(pending.promise);
        const first = checkForUpdates();
        const second = checkForUpdates();
        expect(isAppUpdateBusy()).toBe(true);
        expect(setBetaChannel(true, false)).toBe(false);
        await downloadAppUpdate();
        expect(mocks.downloadUpdate).not.toHaveBeenCalled();
        pending.resolve(null);
        expect(await first).toEqual(await second);
        expect(mocks.checkForUpdates).toHaveBeenCalledTimes(1);
        expect(isAppUpdateBusy()).toBe(false);
    });
    it('reports check rejection without claiming no update and allows a check retry', async () => {
        mocks.checkForUpdates.mockRejectedValueOnce(new Error('offline'));
        expect(await checkForUpdates()).toMatchObject({
            type: 'error',
            failedOperation: 'check',
            available: false,
        });
        await downloadAppUpdate();
        expect(mocks.downloadUpdate).not.toHaveBeenCalled();
        expect(await checkForUpdates()).toMatchObject({ type: 'none' });
    });
    it('does not overwrite a check error event with a successful result', async () => {
        mocks.checkForUpdates.mockImplementationOnce(async () => {
            emit('error', new Error('offline'));
            return { updateInfo: { version: '1.9.1' } };
        });
        expect(await checkForUpdates()).toMatchObject({
            type: 'error',
            failedOperation: 'check',
        });
    });
    it('retains the selected version and emits bounded finite progress', async () => {
        await selectUpdate();
        const pending = deferred<string[]>();
        mocks.downloadUpdate.mockReturnValue(pending.promise);
        const download = downloadAppUpdate();
        expect(lastStatus()).toMatchObject({
            type: 'downloading',
            version: '1.9.1',
        });
        expect(lastStatus().progressPercent).toBeUndefined();
        emit('download-progress', { percent: 142 });
        expect(lastStatus().progressPercent).toBe(100);
        emit('download-progress', { percent: -4 });
        expect(lastStatus().progressPercent).toBe(0);
        emit('download-progress', { percent: 45.7 });
        expect(lastStatus().progressPercent).toBe(45.7);
        emit('download-progress', { percent: Number.NaN });
        expect(lastStatus().progressPercent).toBeUndefined();
        expect(lastStatus().version).toBe('1.9.1');
        pending.resolve([]);
        await download;
    });
    it('blocks checks and channel changes during download and after ready', async () => {
        await selectUpdate();
        const pending = deferred<string[]>();
        mocks.downloadUpdate.mockReturnValue(pending.promise);
        const first = downloadAppUpdate();
        const second = downloadAppUpdate();
        await Promise.resolve();
        expect(await checkForUpdates()).toMatchObject({
            type: 'downloading',
            version: '1.9.1',
        });
        expect(setBetaChannel(true, false)).toBe(false);
        expect(mocks.checkForUpdates).toHaveBeenCalledTimes(1);
        emit('update-downloaded', { version: '1.9.1' });
        expect(await checkForUpdates()).toMatchObject({
            type: 'ready',
            downloaded: true,
            version: '1.9.1',
        });
        emit('download-progress', { percent: 90 });
        emit('error', new Error('late error'));
        expect(lastStatus().type).toBe('ready');
        pending.resolve([]);
        await Promise.all([first, second]);
        expect(mocks.downloadUpdate).toHaveBeenCalledTimes(1);
        expect(setBetaChannel(true, false)).toBe(false);
    });
    it('keeps download failure retryable but waits for the original promise', async () => {
        await selectUpdate();
        const pending = deferred<string[]>();
        mocks.downloadUpdate.mockReturnValueOnce(pending.promise);
        const download = downloadAppUpdate();
        await Promise.resolve();
        emit('error', new Error('network'));
        expect(lastStatus()).toMatchObject({
            type: 'error',
            failedOperation: 'download',
            version: '1.9.1',
            available: true,
        });
        const duplicate = downloadAppUpdate();
        pending.reject(new Error('network'));
        await Promise.all([download, duplicate]);
        expect(mocks.downloadUpdate).toHaveBeenCalledTimes(1);
        expect(
            mocks.ipcWebContentsSend.mock.calls.filter(
                (call) => call[2].failedOperation === 'download',
            ),
        ).toHaveLength(1);
        await downloadAppUpdate();
        expect(mocks.downloadUpdate).toHaveBeenCalledTimes(2);
    });
    it('reports download promise rejection even without an error event', async () => {
        await selectUpdate();
        mocks.downloadUpdate.mockRejectedValueOnce(new Error('network'));
        await downloadAppUpdate();
        expect(lastStatus()).toMatchObject({
            type: 'error',
            failedOperation: 'download',
            version: '1.9.1',
        });
    });
    it('keeps ready usable if the download promise rejects after completion', async () => {
        await selectUpdate();
        mocks.downloadUpdate.mockImplementationOnce(async () => {
            emit('update-downloaded', { version: '1.9.1' });
            throw new Error('late failure');
        });
        await downloadAppUpdate();
        expect(lastStatus().type).toBe('ready');
        installUpdateAndRestart();
        expect(mocks.quitAndInstall).toHaveBeenCalledTimes(1);
    });
    it('ignores premature and duplicate restarts', async () => {
        installUpdateAndRestart();
        expect(mocks.quitAndInstall).not.toHaveBeenCalled();
        await readyUpdate();
        installUpdateAndRestart();
        installUpdateAndRestart();
        expect(mocks.quitAndInstall).toHaveBeenCalledTimes(1);
    });
    it('retains the downloaded release after an install error and allows restart retry', async () => {
        await readyUpdate();
        mocks.quitAndInstall.mockImplementationOnce(() => {
            emit('error', new Error('install failed'));
        });
        installUpdateAndRestart();
        expect(lastStatus()).toMatchObject({
            type: 'error',
            failedOperation: 'install',
            downloaded: true,
            version: '1.9.1',
        });
        installUpdateAndRestart();
        expect(mocks.quitAndInstall).toHaveBeenCalledTimes(2);
    });
    it('scheduled checks cannot replace download or ready state', async () => {
        vi.useFakeTimers();
        await selectUpdate();
        await startAutoUpdateChecks(100);
        const pending = deferred<string[]>();
        mocks.downloadUpdate.mockReturnValueOnce(pending.promise);
        const download = downloadAppUpdate();
        await vi.advanceTimersByTimeAsync(100);
        expect(mocks.checkForUpdates).toHaveBeenCalledTimes(2);
        emit('update-downloaded', { version: '1.9.1' });
        pending.resolve([]);
        await download;
        await vi.advanceTimersByTimeAsync(100);
        expect(mocks.checkForUpdates).toHaveBeenCalledTimes(2);
        expect(lastStatus().type).toBe('ready');
    });
    it('does not download manually managed or skipped releases', async () => {
        mocks.checkForUpdates.mockResolvedValue({
            updateInfo: { version: '1.9.1' },
        });
        await checkForUpdates({ skippedVersion: '1.9.1' });
        await downloadAppUpdate();
        expect(mocks.downloadUpdate).not.toHaveBeenCalled();
        setPlatform('linux');
        mocks.existsSync.mockReturnValue(true);
        await checkForUpdates();
        await downloadAppUpdate();
        expect(lastStatus().type).toBe('manual');
        expect(mocks.downloadUpdate).not.toHaveBeenCalled();
    });
    it('removes only owned listeners on repeated setup', async () => {
        mocks.autoUpdater.removeListener.mockClear();
        await setupAutoUpdate({ webContents: {} } as BrowserWindow, false);
        expect(mocks.autoUpdater.removeListener).toHaveBeenCalledTimes(3);
    });
    it('reserves checks and downloads while saving the channel preference', async () => {
        await selectUpdate();
        const pending = deferred<void>();
        const persistence = vi.fn(() => pending.promise);
        const change = changeBetaChannel(true, persistence);
        expect(isAppUpdateBusy()).toBe(true);
        await checkForUpdates();
        await downloadAppUpdate();
        expect(mocks.checkForUpdates).toHaveBeenCalledTimes(1);
        expect(mocks.downloadUpdate).not.toHaveBeenCalled();
        expect(mocks.autoUpdater.channel).toBe('latest');
        pending.resolve();
        expect(await change).toBe(true);
        expect(mocks.autoUpdater.channel).toBe('beta');
        await checkForUpdates();
    });
    it('leaves channel unchanged and releases reservation when saving fails', async () => {
        await expect(
            changeBetaChannel(true, async () => {
                throw new Error('save failed');
            }),
        ).rejects.toThrow('save failed');
        expect(mocks.autoUpdater.channel).toBe('latest');
        expect(isAppUpdateBusy()).toBe(false);
        expect(mocks.checkForUpdates).not.toHaveBeenCalled();
    });
    it('declines persistence when an update is downloaded', async () => {
        await readyUpdate();
        const persistence = vi.fn();
        expect(await changeBetaChannel(true, persistence)).toBe(false);
        expect(persistence).not.toHaveBeenCalled();
    });
    it('coalesces scheduler startup and cancels a stopped pending options read', async () => {
        vi.useFakeTimers();
        const pending = deferred<undefined>();
        const options = vi.fn(() => pending.promise);
        await setupAutoUpdate(
            { webContents: {} } as BrowserWindow,
            false,
            100,
            false,
            false,
            false,
            options,
        );
        const first = startAutoUpdateChecks(100);
        const duplicate = startAutoUpdateChecks(100);
        await Promise.resolve();
        expect(options).toHaveBeenCalledTimes(1);
        stopAutoUpdateChecks();
        pending.resolve(undefined);
        await Promise.all([first, duplicate]);
        await vi.advanceTimersByTimeAsync(1000);
        expect(mocks.checkForUpdates).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
    it('does not publish a late check after setup replaces the lifecycle', async () => {
        const pending = deferred<{ updateInfo: { version: string } }>();
        mocks.checkForUpdates.mockReturnValueOnce(pending.promise);
        const check = checkForUpdates();
        await Promise.resolve();
        await setupAutoUpdate({ webContents: {} } as BrowserWindow, false);
        mocks.ipcWebContentsSend.mockClear();
        pending.resolve({ updateInfo: { version: '1.9.1' } });
        expect(await check).toMatchObject({ type: 'none' });
        expect(mocks.ipcWebContentsSend).not.toHaveBeenCalled();
    });
    it('does not accept a downloaded event for a different version', async () => {
        await selectUpdate();
        const pending = deferred<string[]>();
        mocks.downloadUpdate.mockReturnValueOnce(pending.promise);
        const download = downloadAppUpdate();
        emit('update-downloaded', { version: '2.0.0' });
        expect(lastStatus()).toMatchObject({
            type: 'downloading',
            version: '1.9.1',
        });
        pending.resolve([]);
        await download;
    });
    it('keeps checks active while platform eligibility is still being resolved', async () => {
        setPlatform('linux');
        const pending = deferred<string | null>();
        mocks.findExecutable.mockReturnValueOnce(pending.promise);
        mocks.checkForUpdates.mockResolvedValueOnce({
            updateInfo: { version: '1.9.1' },
        });
        const check = checkForUpdates();
        await Promise.resolve();
        await Promise.resolve();
        expect(isAppUpdateBusy()).toBe(true);
        await downloadAppUpdate();
        expect(mocks.downloadUpdate).not.toHaveBeenCalled();
        pending.resolve(null);
        expect(await check).toMatchObject({
            type: 'available',
            version: '1.9.1',
        });
    });
    it('disables automatic actions even if legacy setup arguments enable them', async () => {
        await setupAutoUpdate(
            { webContents: {} } as BrowserWindow,
            false,
            100,
            true,
            true,
        );
        expect(mocks.autoUpdater.autoDownload).toBe(false);
        expect(mocks.autoUpdater.autoInstallOnAppQuit).toBe(false);
    });
    it('promotes a pending background check when a manual override joins it', async () => {
        const pending = deferred<{ updateInfo: { version: string } }>();
        mocks.checkForUpdates.mockReturnValueOnce(pending.promise);
        const background = checkForUpdates({ skippedVersion: '1.9.1' });
        const manual = checkForUpdates({ ignoreSkippedVersion: true });
        pending.resolve({ updateInfo: { version: '1.9.1' } });
        expect(await background).toMatchObject({
            type: 'available',
            version: '1.9.1',
        });
        expect(await manual).toMatchObject({
            type: 'available',
            version: '1.9.1',
        });
        expect(mocks.checkForUpdates).toHaveBeenCalledTimes(1);
    });
    it('honours a manual override joining during platform detection', async () => {
        setPlatform('linux');
        const platform = deferred<string | null>();
        mocks.findExecutable.mockReturnValueOnce(platform.promise);
        mocks.checkForUpdates.mockResolvedValueOnce({
            updateInfo: { version: '1.9.1' },
        });
        const background = checkForUpdates({ skippedVersion: '1.9.1' });
        await Promise.resolve();
        await Promise.resolve();
        expect(mocks.findExecutable).toHaveBeenCalledTimes(1);
        const manual = checkForUpdates({ ignoreSkippedVersion: true });
        const subsequentBackground = checkForUpdates({
            skippedVersion: '1.9.1',
        });
        platform.resolve(null);
        for (const request of [background, manual, subsequentBackground]) {
            expect(await request).toMatchObject({
                type: 'available',
                version: '1.9.1',
            });
        }
        expect(mocks.checkForUpdates).toHaveBeenCalledTimes(1);
    });
});
