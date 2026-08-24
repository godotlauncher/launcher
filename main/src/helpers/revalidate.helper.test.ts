import type { BrowserWindow } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const moduleMocks = vi.hoisted(() => ({
    ipcWebContentsSend: vi.fn(),
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

import { setupFocusRevalidation } from './revalidate.helper';

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

let refreshInstalledEditors: ReturnType<typeof vi.fn>;
let refreshProjects: ReturnType<typeof vi.fn>;
describe('setupFocusRevalidation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        moduleMocks.ipcWebContentsSend.mockReset();

        mockWindow = createMockBrowserWindow();
        refreshInstalledEditors = vi.fn().mockResolvedValue([]);
        refreshProjects = vi.fn().mockResolvedValue(undefined);
    });

    it('debounces quick focus health checks', async () => {
        const dispose = setupFocusRevalidation(
            mockWindow as unknown as BrowserWindow,
            refreshInstalledEditors,
            refreshProjects,
        );

        mockWindow.emit('focus');
        mockWindow.emit('focus');

        await vi.advanceTimersByTimeAsync(250);

        expect(refreshInstalledEditors).toHaveBeenCalledTimes(1);
        expect(refreshProjects).toHaveBeenCalledTimes(1);

        expect(moduleMocks.ipcWebContentsSend).toHaveBeenCalledWith(
            'releases-updated',
            mockWindow.webContents,
            [],
        );
        expect(moduleMocks.ipcWebContentsSend).not.toHaveBeenCalledWith(
            'projects-updated',
            expect.anything(),
            expect.anything(),
        );
        dispose();
    });

    it('does not publish unchanged installed-editor health', async () => {
        refreshInstalledEditors.mockResolvedValue(null);
        const dispose = setupFocusRevalidation(
            mockWindow as unknown as BrowserWindow,
            refreshInstalledEditors,
            refreshProjects,
        );

        mockWindow.emit('focus');
        await vi.advanceTimersByTimeAsync(250);

        expect(refreshInstalledEditors).toHaveBeenCalledTimes(1);
        expect(refreshProjects).toHaveBeenCalledTimes(1);
        expect(moduleMocks.ipcWebContentsSend).not.toHaveBeenCalledWith(
            'releases-updated',
            expect.anything(),
            expect.anything(),
        );

        dispose();
    });

    it('stops scheduling once disposed', async () => {
        const dispose = setupFocusRevalidation(
            mockWindow as unknown as BrowserWindow,
            refreshInstalledEditors,
            refreshProjects,
        );

        mockWindow.emit('focus');
        dispose();
        await vi.advanceTimersByTimeAsync(250);

        expect(refreshInstalledEditors).not.toHaveBeenCalled();
        expect(refreshProjects).not.toHaveBeenCalled();
    });

    afterEach(() => {
        vi.useRealTimers();
    });
});
