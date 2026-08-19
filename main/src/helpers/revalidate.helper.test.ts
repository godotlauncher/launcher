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

let refreshCodeEditorIntegrations: ReturnType<typeof vi.fn>;
let refreshInstalledEditors: ReturnType<typeof vi.fn>;
let refreshProjects: ReturnType<typeof vi.fn>;
describe('setupFocusRevalidation', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        moduleMocks.ipcWebContentsSend.mockReset();

        mockWindow = createMockBrowserWindow();
        refreshInstalledEditors = vi.fn().mockResolvedValue([]);
        refreshCodeEditorIntegrations = vi.fn().mockResolvedValue([]);
        refreshProjects = vi.fn().mockResolvedValue([]);
    });

    it('debounces focus revalidation and leaves project publication to its service', async () => {
        const dispose = setupFocusRevalidation(
            mockWindow as unknown as BrowserWindow,
            refreshInstalledEditors,
            refreshCodeEditorIntegrations,
            refreshProjects,
        );

        mockWindow.emit('focus');
        mockWindow.emit('focus');

        await vi.runOnlyPendingTimersAsync();

        expect(refreshInstalledEditors).toHaveBeenCalledTimes(1);
        expect(refreshProjects).toHaveBeenCalledTimes(1);
        expect(refreshCodeEditorIntegrations).toHaveBeenCalledTimes(1);

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

        expect(moduleMocks.ipcWebContentsSend).toHaveBeenCalledWith(
            'code-editor-integrations-updated',
            mockWindow.webContents,
            [],
        );
        dispose();
    });

    it('keeps the last known code editor settings when refresh fails', async () => {
        refreshCodeEditorIntegrations.mockRejectedValue(
            new Error('Detection failed'),
        );
        const dispose = setupFocusRevalidation(
            mockWindow as unknown as BrowserWindow,
            refreshInstalledEditors,
            refreshCodeEditorIntegrations,
            refreshProjects,
        );

        mockWindow.emit('focus');
        await vi.runOnlyPendingTimersAsync();

        expect(moduleMocks.ipcWebContentsSend).not.toHaveBeenCalledWith(
            'projects-updated',
            expect.anything(),
            expect.anything(),
        );
        expect(moduleMocks.ipcWebContentsSend).not.toHaveBeenCalledWith(
            'code-editor-integrations-updated',
            expect.anything(),
            expect.anything(),
        );

        dispose();
    });

    it('stops scheduling once disposed', async () => {
        const dispose = setupFocusRevalidation(
            mockWindow as unknown as BrowserWindow,
            refreshInstalledEditors,
            refreshCodeEditorIntegrations,
            refreshProjects,
        );

        mockWindow.emit('focus');
        await vi.runOnlyPendingTimersAsync();

        expect(refreshInstalledEditors).toHaveBeenCalledTimes(1);

        dispose();
        vi.advanceTimersByTime(5 * 60 * 1000);
        await Promise.resolve();

        expect(refreshInstalledEditors).toHaveBeenCalledTimes(1);
    });

    afterEach(() => {
        vi.useRealTimers();
    });
});
