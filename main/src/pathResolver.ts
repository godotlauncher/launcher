import path from 'node:path';
import { app } from 'electron';

import { isInstalledRuntime, type RuntimeModeInput } from './runtimeMode.js';

function getRuntimeModeInput(): RuntimeModeInput {
    return {
        isPackaged: app.isPackaged,
        appPath: app.getAppPath(),
    };
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

export function getExternalResourceRoot(
    input: RuntimeModeInput = getRuntimeModeInput(),
): string {
    return isInstalledRuntime(input)
        ? path.dirname(input.appPath)
        : input.appPath;
}

export function getLocalesPath(
    input: RuntimeModeInput = getRuntimeModeInput(),
): string {
    return path.join(getExternalResourceRoot(input), 'locales');
}

/**
 * Retrieves the path to the assets directory.
 *
 * This function constructs the path to the assets directory based on the application's
 * current path and whether the application is running in development mode or production mode.
 *
 * @returns {string} The full path to the assets directory.
 */
export function getAssetPath(
    input: RuntimeModeInput = getRuntimeModeInput(),
): string {
    const resourceRoot = getExternalResourceRoot(input);
    return isInstalledRuntime(input)
        ? path.join(resourceRoot, 'assets')
        : path.join(resourceRoot, 'main/assets');
}

/**
 * Gets the appropriate application icon path based on the operating system.
 * @returns the runtime window icon path based on the platform
 */
export function getAppIconPath() {
    const basePath = path.join(getAssetPath(), '/icons');
    if (process.platform === 'darwin') {
        return path.join(basePath, '/darwin/appIcon.png');
    } else return path.join(basePath, '/default/appIcon.png');
}
