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
    checkForUpdates,
    downloadAppUpdate,
    installUpdateAndRestart,
    isRpmOstreeSystem,
    setBetaChannel,
    setupAutoUpdate,
} from './autoUpdater.js';

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform) {
    Object.defineProperty(process, 'platform', {
        configurable: true,
        value: platform,
    });
}

describe('autoUpdater', () => {
    beforeEach(() => {
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
    });

    afterEach(() => {
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
        expect(payload.url).toBe(
            'https://github.com/godotlauncher/launcher/releases/tag/v1.9.1',
        );
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

    it('does not auto-download when update-available event is emitted', async () => {
        const browserWindow = { webContents: {} } as BrowserWindow;
        await setupAutoUpdate(browserWindow, false);

        const availableHandler = mocks.on.mock.calls.find(
            (call) => call[0] === 'update-available',
        )?.[1];
        expect(availableHandler).toBeTypeOf('function');

        availableHandler?.({ version: '1.9.1' });

        expect(mocks.downloadUpdate).not.toHaveBeenCalled();
    });

    it('reports install errors to the renderer', async () => {
        const browserWindow = { webContents: {} } as BrowserWindow;
        await setupAutoUpdate(browserWindow, false);

        const errorHandler = mocks.on.mock.calls.find(
            (call) => call[0] === 'error',
        )?.[1];
        expect(errorHandler).toBeTypeOf('function');

        errorHandler?.(new Error('install failed'));

        const payload = mocks.ipcWebContentsSend.mock.calls.at(-1)?.[2];
        expect(payload).toEqual({
            available: true,
            downloaded: false,
            type: 'error',
            message: 'Failed to install update',
        });
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

        await downloadAppUpdate();

        expect(mocks.downloadUpdate).toHaveBeenCalledTimes(1);
    });

    it('does not force an extra app quit during explicit install', () => {
        installUpdateAndRestart();

        expect(mocks.autoUpdater.autoRunAppAfterInstall).toBe(true);
        expect(mocks.quitAndInstall).toHaveBeenCalledWith(true, true);
        expect(mocks.quit).not.toHaveBeenCalled();
    });
});
