import path from 'node:path';
import { app, BrowserWindow, nativeTheme } from 'electron';
import logger from 'electron-log/main.js';
import { getAssetPath } from '../pathResolver.js';

const SPLASHSCREEN_DARK_BACKGROUND = '#1d232a';
const SPLASHSCREEN_LIGHT_BACKGROUND = '#ffffff';
const SPLASHSCREEN_WIDTH = 420;
const SPLASHSCREEN_HEIGHT = 240;

let splashscreenWindow: BrowserWindow | undefined;
let splashscreenCreation: Promise<void> | undefined;
let shouldShowSplashscreen = true;

export function showSplashscreen(): void {
    if (!shouldShowSplashscreen || splashscreenWindow || splashscreenCreation) {
        return;
    }

    splashscreenCreation = createSplashscreen().catch((error) => {
        logger.error('Failed to create splash screen', error);
        closeSplashscreen();
    });
}

export function closeSplashscreen(): void {
    shouldShowSplashscreen = false;

    const window = splashscreenWindow;
    splashscreenWindow = undefined;

    if (window && !window.isDestroyed()) {
        window.destroy();
    }
}

async function createSplashscreen(): Promise<void> {
    await app.whenReady();

    if (!shouldShowSplashscreen) {
        return;
    }

    const window = new BrowserWindow({
        width: SPLASHSCREEN_WIDTH,
        height: SPLASHSCREEN_HEIGHT,
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
        backgroundColor: nativeTheme.shouldUseDarkColors
            ? SPLASHSCREEN_DARK_BACKGROUND
            : SPLASHSCREEN_LIGHT_BACKGROUND,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    splashscreenWindow = window;

    window.once('ready-to-show', () => {
        if (
            shouldShowSplashscreen &&
            splashscreenWindow === window &&
            !window.isDestroyed()
        ) {
            window.show();
        }
    });

    window.once('closed', () => {
        if (splashscreenWindow === window) {
            splashscreenWindow = undefined;
        }
    });

    await window.loadFile(
        path.join(getAssetPath(), 'splashscreen', 'index.html'),
    );
}
