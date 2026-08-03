import type { AppEventMap } from '@shared/contracts';
import { app, type WebContents } from 'electron';
import { getCurrentAppConfigIfInitialized } from './config/index.js';
import { getMainWindow } from './mainWindow.js';
import { isDevelopmentRuntime } from './runtimeMode.js';

export function isDev(): boolean {
    const appConfig = getCurrentAppConfigIfInitialized();
    if (appConfig) {
        return appConfig.isDev;
    }

    return isDevelopmentRuntime({
        isPackaged: app.isPackaged,
        appPath: app.getAppPath(),
    });
}

export function ipcWebContentsSend<Key extends keyof AppEventMap>(
    key: Key,
    webContents: WebContents,
    payload: AppEventMap[Key],
): void {
    webContents.send(key, payload);
}

export function ipcSendToMainWindowSync<Key extends keyof AppEventMap>(
    key: Key,
    payload: AppEventMap[Key],
): void {
    getMainWindow().webContents.send(key, payload);
}
