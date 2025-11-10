import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const moduleMocks = vi.hoisted(() => ({
    checkAndUpdateReleases: vi.fn(),
    checkAndUpdateProjects: vi.fn(),
    ipcWebContentsSend: vi.fn(),
}));

vi.mock('../checks.js', () => ({
    checkAndUpdateReleases: moduleMocks.checkAndUpdateReleases,
    checkAndUpdateProjects: moduleMocks.checkAndUpdateProjects,
}));

vi.mock('../utils.js', () => ({
    ipcWebContentsSend: moduleMocks.ipcWebContentsSend,
}));

vi.mock('electron-log', () => ({
    default: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import { setupFocusRevalidation } from '../../../electron/helpers/revalidate.helper';

type FocusListener = () => void;

const createMockBrowserWindow = () => {
    const listeners: Record<string, FocusListener[]> = {};

    const windowRef = {
        on: vi.fn((event: string, listener: FocusListener) => {
            listeners[event] = listeners[event] ?? [];
            listeners[event].push(listener);
            return windowRef;
        }),
        removeListener: vi.fn((event: string, listener: FocusListener) => {
            listeners[event] = (listeners[event] ?? []).filter(
                (l) => l !== listener,
            );
        }),
        emit: (event: string) => {
            (listeners[event] ?? []).forEach((listener) => {
                listener();
            });
        },
        listeners,
        isDestroyed: () => false,
        webContents: {
            isDestroyed: () => false,
        },
    };

    return windowRef;
};

let mockWindow: ReturnType<typeof createMockBrowserWindow>;

describe('setupFocusRevalidation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        moduleMocks.checkAndUpdateProjects.mockReset();
        moduleMocks.checkAndUpdateReleases.mockReset();
        moduleMocks.ipcWebContentsSend.mockReset();

        moduleMocks.checkAndUpdateProjects.mockResolvedValue([]);
        moduleMocks.checkAndUpdateReleases.mockResolvedValue([]);

        mockWindow = createMockBrowserWindow();
    });

    it('debounces focus-triggered revalidation and broadcasts updates', async () => {
        const dispose = setupFocusRevalidation(
            mockWindow as unknown as BrowserWindow,
        );

        mockWindow.emit('focus');
        mockWindow.emit('focus');

        await vi.runOnlyPendingTimersAsync();

        expect(moduleMocks.checkAndUpdateReleases).toHaveBeenCalledTimes(1);
        expect(moduleMocks.checkAndUpdateProjects).toHaveBeenCalledTimes(1);

        expect(moduleMocks.ipcWebContentsSend).toHaveBeenCalledWith(
            'releases-updated',
            mockWindow.webContents,
            [],
        );
        expect(moduleMocks.ipcWebContentsSend).toHaveBeenCalledWith(
            'projects-updated',
            mockWindow.webContents,
            [],
        );

        dispose();
    });

    it('stops scheduling once disposed', async () => {
        const dispose = setupFocusRevalidation(
            mockWindow as unknown as BrowserWindow,
        );

        mockWindow.emit('focus');
        await vi.runOnlyPendingTimersAsync();

        expect(moduleMocks.checkAndUpdateReleases).toHaveBeenCalledTimes(1);

        dispose();
        vi.advanceTimersByTime(5 * 60 * 1000);
        await Promise.resolve();

        expect(moduleMocks.checkAndUpdateReleases).toHaveBeenCalledTimes(1);
    });

    afterEach(() => {
        vi.useRealTimers();
    });
});
