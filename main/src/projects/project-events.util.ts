import type { ProjectDetails } from '@shared/contracts';
import logger from 'electron-log';
import { updateLinuxTray } from '../helpers/tray.helper.js';
import { getMainWindow } from '../mainWindow.js';
import { ipcWebContentsSend } from '../utils.js';

/**
 * Refreshes the tray and publishes successfully persisted projects.
 *
 * @param projects - Final persisted project list.
 */
export function publishProjectUpdates(projects: ProjectDetails[]): void {
    void updateLinuxTray();
    const webContents = getMainWindow()?.webContents;
    if (!webContents || webContents.isDestroyed?.()) {
        return;
    }
    ipcWebContentsSend('projects-updated', webContents, projects);
}

/** Publishes a runtime failure when the main window can still present recovery.
 * @param project - Registered project whose owned runtime failed.
 * @param diagnostic - Optional bounded error line reported by Godot.
 */
export function publishProjectRunFailure(
    project: ProjectDetails,
    diagnostic?: string,
): void {
    const webContents = getMainWindow()?.webContents;
    if (!webContents || webContents.isDestroyed?.()) return;
    try {
        ipcWebContentsSend('project-run-failed', webContents, {
            project,
            reason: 'launch_failed',
            ...(diagnostic ? { diagnostic } : {}),
        });
    } catch (error) {
        logger.warn('Failed to report Godot runtime exit', error);
    }
}
