import type { BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow): void {
    mainWindow = window;
}

export function getMainWindow(): BrowserWindow {
    // biome-ignore lint/style/noNonNullAssertion: main window is set during Electron startup before app commands use it
    return mainWindow!;
}
