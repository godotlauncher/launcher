import type { ProjectDetails } from '@shared/contracts';
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
