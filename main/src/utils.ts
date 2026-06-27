import { pathToFileURL } from 'node:url';
import type { EventChannelMapping } from '@shared';
import {
    type IpcMainInvokeEvent,
    ipcMain,
    type WebContents,
    type WebFrameMain,
} from 'electron';
import { getCurrentAppConfigIfInitialized } from './config/index.js';
import { getMainWindow } from './mainWindow.js';
import { getUIPath } from './pathResolver.js';

export function isDev(): boolean {
    const appConfig = getCurrentAppConfigIfInitialized();
    if (appConfig) {
        return appConfig.isDev;
    }

    return process.env.NODE_ENV === 'development';
}

export function ipcMainHandler<Channel extends keyof EventChannelMapping>(
    key: Channel,
    handler: (
        event: IpcMainInvokeEvent,
        // biome-ignore lint/suspicious/noExplicitAny: required for variadic args
        ...args: any[]
    ) => EventChannelMapping[Channel],
) {
    ipcMain.handle(key, (event, ...args) => {
        validateEventFrame(event.senderFrame);
        return handler(event, ...args);
    });
}

export function validateEventFrame(frame: WebFrameMain | null) {
    if (!frame) {
        throw new Error('Invalid frame');
    }
    if (isDev() && new URL(frame.url).host === 'localhost:5123') {
        return;
    }

    if (!frame.url.startsWith(pathToFileURL(getUIPath()).toString())) {
        throw new Error('Invalid frame');
    }
}

export function ipcMainOn<Key extends keyof EventChannelMapping>(
    key: Key,
    handler: (payload: EventChannelMapping[Key]) => void,
) {
    ipcMain.on(key, (event, payload) => {
        validateEventFrame(event.senderFrame);
        return handler(payload);
    });
}

export function ipcWebContentsSend<Key extends keyof EventChannelMapping>(
    key: Key,
    webContents: WebContents,
    payload: EventChannelMapping[Key],
) {
    webContents.send(key, payload);
}

export function ipcSendToMainWindowSync<Key extends keyof EventChannelMapping>(
    key: Key,
    payload: EventChannelMapping[Key],
) {
    getMainWindow().webContents.send(key, payload);
}
