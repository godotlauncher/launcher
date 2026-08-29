import type { InstalledRelease } from '@shared/contracts';
import type { BrowserWindow } from 'electron';
import logger from 'electron-log';

import { ipcWebContentsSend } from '../utils.js';

const FOCUS_DEBOUNCE_MS = 250;

type RefreshInstalledEditors = () => Promise<InstalledRelease[] | null>;
type RefreshProjects = () => Promise<void>;

/**
 * Refreshes project and installed-editor health for a visible window.
 *
 * @param targetWindow - Window that receives refreshed state.
 * @param refreshInstalledEditors - Installed editor refresh callback.
 * @param refreshProjects - Project refresh callback.
 * @returns A promise that resolves after revalidation.
 */
async function performRevalidation(
    targetWindow: BrowserWindow,
    refreshInstalledEditors: RefreshInstalledEditors,
    refreshProjects: RefreshProjects,
): Promise<void> {
    if (targetWindow.isDestroyed()) {
        logger.warn('Skipping revalidation: main window destroyed');
        return;
    }

    logger.debug('Running focus-triggered revalidation for projects/releases');

    try {
        const [releases] = await Promise.all([
            refreshInstalledEditors(),
            refreshProjects(),
        ]);

        const webContents = targetWindow.webContents;
        if (!webContents || webContents.isDestroyed()) {
            logger.warn(
                'Skipping revalidation broadcast: webContents destroyed',
            );
            return;
        }

        if (releases) {
            ipcWebContentsSend('releases-updated', webContents, releases);
        }
    } catch (error) {
        logger.error('Failed to revalidate projects/releases on focus', error);
    }
}

/**
 * Schedules revalidation when the main window regains focus.
 *
 * @param mainWindow - Main application window.
 * @param refreshInstalledEditors - Installed editor refresh callback.
 * @param refreshProjects - Project refresh callback.
 * @returns A callback that removes listeners and timers.
 */
export function setupFocusRevalidation(
    mainWindow: BrowserWindow,
    refreshInstalledEditors: RefreshInstalledEditors,
    refreshProjects: RefreshProjects,
): () => void {
    let debounceTimer: NodeJS.Timeout | undefined;
    let isRunning = false;
    let disposed = false;

    const scheduleRevalidation = () => {
        if (disposed) {
            return;
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            if (isRunning || disposed) {
                return;
            }

            isRunning = true;
            try {
                await performRevalidation(
                    mainWindow,
                    refreshInstalledEditors,
                    refreshProjects,
                );
            } finally {
                isRunning = false;
            }
        }, FOCUS_DEBOUNCE_MS);
    };

    const onFocus = () => {
        logger.debug('Main window focus detected, scheduling revalidation');
        scheduleRevalidation();
    };

    mainWindow.on('focus', onFocus);

    return () => {
        disposed = true;
        clearTimeout(debounceTimer);
        mainWindow.removeListener('focus', onFocus);
    };
}
