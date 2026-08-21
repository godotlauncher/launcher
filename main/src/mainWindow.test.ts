import type { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { revealMainWindow, setMainWindow } from './mainWindow.js';

const mocks = vi.hoisted(() => ({
    appFocus: vi.fn(),
    appShow: vi.fn(),
    dockShow: vi.fn(),
    setActivationPolicy: vi.fn(),
}));

vi.mock('electron', () => ({
    app: {
        dock: { show: mocks.dockShow },
        focus: mocks.appFocus,
        setActivationPolicy: mocks.setActivationPolicy,
        show: mocks.appShow,
    },
}));

describe('mainWindow', () => {
    beforeEach(() => vi.clearAllMocks());

    it('restores, shows and focuses the main window', () => {
        const window = {
            focus: vi.fn(),
            isMinimized: vi.fn(() => true),
            restore: vi.fn(),
            show: vi.fn(),
        };
        setMainWindow(window as unknown as BrowserWindow);

        revealMainWindow();

        expect(window.restore).toHaveBeenCalledOnce();
        expect(window.show).toHaveBeenCalledOnce();
        expect(mocks.appFocus).toHaveBeenCalledOnce();
        expect(window.focus).toHaveBeenCalledOnce();
    });
});
