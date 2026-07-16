import type { AppEventMap } from '@shared/contracts';
import type { WebContents } from 'electron';
import { getCurrentAppConfigIfInitialized } from './config/index.js';
import { getMainWindow } from './mainWindow.js';

export function isDev(): boolean {
    const appConfig = getCurrentAppConfigIfInitialized();
    if (appConfig) {
        return appConfig.isDev;
    }

    return process.env.NODE_ENV === 'development';
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
