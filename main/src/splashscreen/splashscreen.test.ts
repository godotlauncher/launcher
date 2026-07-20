import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const handlers = new Map<string, () => void>();
    const state = { destroyed: false, shouldUseDarkColors: true };
    const window = {
        destroy: vi.fn(),
        isDestroyed: vi.fn(),
        loadFile: vi.fn(),
        once: vi.fn(),
        show: vi.fn(),
    };
    const BrowserWindow = vi.fn(function BrowserWindow() {
        return window;
    });

    return {
        BrowserWindow,
        handlers,
        loggerError: vi.fn(),
        state,
        whenReady: vi.fn(),
        window,
    };
});

vi.mock('electron', () => ({
    app: {
        whenReady: mocks.whenReady,
    },
    BrowserWindow: mocks.BrowserWindow,
    nativeTheme: {
        get shouldUseDarkColors() {
            return mocks.state.shouldUseDarkColors;
        },
    },
}));

vi.mock('electron-log/main.js', () => ({
    default: {
        error: mocks.loggerError,
    },
}));

vi.mock('../pathResolver.js', () => ({
    getAssetPath: vi.fn(() => 'C:/app/assets'),
}));

describe('Splashscreen', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        mocks.handlers.clear();
        mocks.state.destroyed = false;
        mocks.state.shouldUseDarkColors = true;
        mocks.whenReady.mockResolvedValue(undefined);
        mocks.window.isDestroyed.mockImplementation(
            () => mocks.state.destroyed,
        );
        mocks.window.destroy.mockImplementation(() => {
            mocks.state.destroyed = true;
            mocks.handlers.get('closed')?.();
        });
        mocks.window.loadFile.mockResolvedValue(undefined);
        mocks.window.once.mockImplementation(
            (event: string, listener: () => void) => {
                mocks.handlers.set(event, listener);
                return mocks.window;
            },
        );
    });

    it('creates a secure, hidden splash window and shows it when ready', async () => {
        const { showSplashscreen } = await import('./splashscreen.js');

        showSplashscreen();

        await vi.waitFor(() => {
            expect(mocks.BrowserWindow).toHaveBeenCalledOnce();
        });
        expect(mocks.BrowserWindow).toHaveBeenCalledWith({
            width: 420,
            height: 240,
            show: false,
            frame: false,
            resizable: false,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            closable: false,
            skipTaskbar: true,
            alwaysOnTop: true,
            center: true,
            backgroundColor: '#1d232a',
            webPreferences: {
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
            },
        });
        expect(mocks.window.loadFile).toHaveBeenCalledWith(
            path.join('C:/app/assets', 'splashscreen', 'index.html'),
        );
        expect(mocks.window.show).not.toHaveBeenCalled();

        mocks.handlers.get('ready-to-show')?.();

        expect(mocks.window.show).toHaveBeenCalledOnce();
    });

    it('uses the light splash background when the OS uses light colors', async () => {
        mocks.state.shouldUseDarkColors = false;
        const { showSplashscreen } = await import('./splashscreen.js');

        showSplashscreen();

        await vi.waitFor(() => {
            expect(mocks.BrowserWindow).toHaveBeenCalledWith(
                expect.objectContaining({ backgroundColor: '#ffffff' }),
            );
        });
    });

    it('does not create more than one splash window', async () => {
        const { showSplashscreen } = await import('./splashscreen.js');

        showSplashscreen();
        showSplashscreen();

        await vi.waitFor(() => {
            expect(mocks.BrowserWindow).toHaveBeenCalledOnce();
        });
    });

    it('does not create the window when closed before Electron is ready', async () => {
        let resolveReady: (() => void) | undefined;
        mocks.whenReady.mockReturnValue(
            new Promise<void>((resolve) => {
                resolveReady = resolve;
            }),
        );
        const { closeSplashscreen, showSplashscreen } = await import(
            './splashscreen.js'
        );

        showSplashscreen();
        closeSplashscreen();
        resolveReady?.();
        await Promise.resolve();
        await Promise.resolve();

        expect(mocks.BrowserWindow).not.toHaveBeenCalled();
    });

    it('destroys the splash window and prevents a late show', async () => {
        const { closeSplashscreen, showSplashscreen } = await import(
            './splashscreen.js'
        );
        showSplashscreen();
        await vi.waitFor(() => {
            expect(mocks.BrowserWindow).toHaveBeenCalledOnce();
        });

        closeSplashscreen();
        closeSplashscreen();
        mocks.handlers.get('ready-to-show')?.();

        expect(mocks.window.destroy).toHaveBeenCalledOnce();
        expect(mocks.window.show).not.toHaveBeenCalled();
    });

    it('logs load failures and destroys the splash window', async () => {
        const loadError = new Error('Splash failed to load');
        mocks.window.loadFile.mockRejectedValue(loadError);
        const { showSplashscreen } = await import('./splashscreen.js');

        showSplashscreen();

        await vi.waitFor(() => {
            expect(mocks.loggerError).toHaveBeenCalledWith(
                'Failed to create splash screen',
                loadError,
            );
        });
        expect(mocks.window.destroy).toHaveBeenCalledOnce();
    });
});
