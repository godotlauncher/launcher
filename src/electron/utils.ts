import path from 'node:path';

import {
    ipcMain,
    IpcMainInvokeEvent,
    nativeImage,
    NativeImage,
    nativeTheme,
    WebContents,
    WebFrameMain,
} from 'electron';
import { pathToFileURL } from 'url';
import { getMainWindow } from './main.js';
import { getAssetPath, getUIPath } from './pathResolver.js';

export function isDev(): boolean {
    return process.env.NODE_ENV === 'development';
}

export function getThemedMenuIcon(iconName: string): NativeImage {
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
    const iconPath = path.join(
        getAssetPath(),
        'menu_icons',
        `${iconName}-${theme}.png`
    );
    const image = nativeImage.createFromPath(iconPath);
    return image.resize({ width: 24, height: 24 });
}

export function ipcMainHandler<Channel extends keyof EventChannelMapping>(
    key: Channel,
    handler: (
    event: IpcMainInvokeEvent,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]
  ) => EventChannelMapping[Channel]
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
    handler: (payload: EventChannelMapping[Key]) => void
) {
    ipcMain.on(key, (event, payload) => {
        validateEventFrame(event.senderFrame);
        return handler(payload);
    });
}

export function ipcWebContentsSend<Key extends keyof EventChannelMapping>(
    key: Key,
    webContents: WebContents,
    payload: EventChannelMapping[Key]
) {
    webContents.send(key, payload);
}

export function ipcSendToMainWindowSync<Key extends keyof EventChannelMapping>(
    key: Key,
    payload: EventChannelMapping[Key]
) {
    getMainWindow().webContents.send(key, payload);
}
