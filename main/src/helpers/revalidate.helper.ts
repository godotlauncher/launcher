import type { CodeEditorIntegrationSettings } from '@shared/contracts';
import type { BrowserWindow } from 'electron';
import logger from 'electron-log';

import { checkAndUpdateProjects, checkAndUpdateReleases } from '../checks.js';
import { ipcWebContentsSend } from '../utils.js';

const FOCUS_DEBOUNCE_MS = 2000;
const BACKGROUND_REVALIDATE_INTERVAL_MS = 5 * 60 * 1000;

type RefreshCodeEditorIntegrations = () => Promise<
    CodeEditorIntegrationSettings[]
>;

async function performRevalidation(
    targetWindow: BrowserWindow,
    refreshCodeEditorIntegrations: RefreshCodeEditorIntegrations,
): Promise<void> {
    if (targetWindow.isDestroyed()) {
        logger.warn('Skipping revalidation: main window destroyed');
        return;
    }

    logger.debug('Running focus-triggered revalidation for projects/releases');

    try {
        const [releases, projects, codeEditorSettings] = await Promise.all([
            checkAndUpdateReleases(),
            checkAndUpdateProjects({ repairMissingLaunchPath: false }),
            refreshCodeEditorIntegrations().catch((error) => {
                logger.error(
                    'Failed to refresh code editor integrations',
                    error,
                );
                return null;
            }),
        ]);

        const webContents = targetWindow.webContents;
        if (!webContents || webContents.isDestroyed()) {
            logger.warn(
                'Skipping revalidation broadcast: webContents destroyed',
            );
            return;
        }

        ipcWebContentsSend('releases-updated', webContents, releases);
        ipcWebContentsSend('projects-updated', webContents, projects);
        if (codeEditorSettings) {
            ipcWebContentsSend(
                'code-editor-integrations-updated',
                webContents,
                codeEditorSettings,
            );
        }
    } catch (error) {
        logger.error('Failed to revalidate projects/releases on focus', error);
    }
}

export function setupFocusRevalidation(
    mainWindow: BrowserWindow,
    refreshCodeEditorIntegrations: RefreshCodeEditorIntegrations,
): () => void {
    let debounceTimer: NodeJS.Timeout | undefined;
    let backgroundTimer: NodeJS.Timeout | undefined;
    let isRunning = false;
    let disposed = false;
    let lastRun = 0;

    const scheduleRevalidation = () => {
        if (disposed) {
            return;
        }

        const elapsed = Date.now() - lastRun;
        const delay = Math.max(FOCUS_DEBOUNCE_MS - elapsed, 0);

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            if (isRunning || disposed) {
                return;
            }

            isRunning = true;
            try {
                await performRevalidation(
                    mainWindow,
                    refreshCodeEditorIntegrations,
                );
                lastRun = Date.now();
            } finally {
                isRunning = false;
            }
        }, delay);
    };

    const onFocus = () => {
        logger.debug('Main window focus detected, scheduling revalidation');
        scheduleRevalidation();
    };

    mainWindow.on('focus', onFocus);

    backgroundTimer = setInterval(() => {
        logger.debug('Background revalidation tick');
        scheduleRevalidation();
    }, BACKGROUND_REVALIDATE_INTERVAL_MS);

    return () => {
        disposed = true;
        clearTimeout(debounceTimer);
        clearInterval(backgroundTimer);
        mainWindow.removeListener('focus', onFocus);
    };
}
