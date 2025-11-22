import path from 'node:path';
import { app } from 'electron';

import { isDev } from './utils.js';

/**
 * Retrieves the path to the preload script.
 *
 * This function constructs the path to the preload script based on the application's
 * current path and whether the application is running in development mode or production mode.
 *
 * @returns {string} The full path to the preload script.
 */
export function getPreloadPath() {
    return path.join(
        app.getAppPath(),
        isDev() ? '.' : '..',
        'dist-electron/preload.cjs',
    );
}

/**
 * Retrieves the file path to the UI's index.html file.
 *
 * This function constructs the path by joining the application's root path
 * with the relative path to the `index.html` file located in the `dist-react` directory.
 *
 * @returns {string} The full file path to the `index.html` file.
 */
export function getUIPath() {
    return path.join(app.getAppPath(), '/dist-react/index.html');
}

/**
 * Retrieves the path to the assets directory.
 *
 * This function constructs the path to the assets directory based on the application's
 * current path and whether the application is running in development mode or production mode.
 *
 * @returns {string} The full path to the assets directory.
 */
export function getAssetPath() {
    return path.join(app.getAppPath(), isDev() ? '.' : '..', '/src/assets');
}

/**
 * Gets the appropriate application icon path based on the operating system.
 * @returns the runtime window icon path based on the platform
 */
export function getAppIconPath() {
    const basePath = path.join(getAssetPath(), '/icons');
    if (process.platform === 'darwin') {
        const darwinVersion = parseInt(
            process.getSystemVersion().split('.')[0],
            10,
        );

        return path.join(
            basePath,
            darwinVersion >= 26
                ? '/darwin/appIcon26.png'
                : '/darwin/appIcon.png',
        );
    } else return path.join(basePath, '/default/appIcon.png');
}
