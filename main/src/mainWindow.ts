import { app, type BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow): void {
    mainWindow = window;
}

export function getMainWindow(): BrowserWindow {
    // biome-ignore lint/style/noNonNullAssertion: main window is set during Electron startup before app commands use it
    return mainWindow!;
}

/** Restores, shows and focuses the main application window. */
export function revealMainWindow(): void {
    const window = getMainWindow();
    if (window.isMinimized()) {
        window.restore();
    }
    window.show();
    if (process.platform === 'darwin') {
        app.setActivationPolicy('regular');
        app.dock?.show();
        app.show?.();
    }
    app.focus?.();
    window.focus();
}
