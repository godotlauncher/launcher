import type { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const checkForUpdates = vi.fn();
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

import {
    checkForUpdates,
    setBetaChannel,
    setupAutoUpdate,
} from './autoUpdater.js';

describe('autoUpdater', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.autoUpdater.allowPrerelease = false;
        mocks.autoUpdater.channel = 'latest';
        mocks.autoUpdater.currentVersion = { version: '1.9.0' };
        mocks.getVersion.mockReturnValue('1.9.0');
        mocks.checkForUpdates.mockResolvedValue(null);
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
});
