import type { CodeEditorIntegrationSettings } from '@shared/contracts';
import type { BrowserWindow } from 'electron';
import logger from 'electron-log';

import { checkAndUpdateProjects, checkAndUpdateReleases } from '../checks.js';
import type { GitService } from '../tool-integration/integrations/git/git.service.js';
import { ipcWebContentsSend } from '../utils.js';

const FOCUS_DEBOUNCE_MS = 2000;
const BACKGROUND_REVALIDATE_INTERVAL_MS = 5 * 60 * 1000;

type RefreshCodeEditorIntegrations = () => Promise<
    CodeEditorIntegrationSettings[]
>;

/**
 * Refreshes project, release, and code editor state for a visible window.
 *
 * @param targetWindow - Window that receives refreshed state.
 * @param refreshCodeEditorIntegrations - Code editor refresh callback.
 * @param gitService - Git repository inspection service.
 * @returns A promise that resolves after revalidation.
 */
async function performRevalidation(
    targetWindow: BrowserWindow,
    refreshCodeEditorIntegrations: RefreshCodeEditorIntegrations,
    gitService: GitService,
): Promise<void> {
    if (targetWindow.isDestroyed()) {
        logger.warn('Skipping revalidation: main window destroyed');
        return;
    }

    logger.debug('Running focus-triggered revalidation for projects/releases');

    try {
        const [releases, projects, codeEditorSettings] = await Promise.all([
            checkAndUpdateReleases(),
            checkAndUpdateProjects(
                { repairMissingLaunchPath: false },
                gitService,
            ),
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

/**
 * Schedules revalidation when the main window regains focus.
 *
 * @param mainWindow - Main application window.
 * @param refreshCodeEditorIntegrations - Code editor refresh callback.
 * @param gitService - Git repository inspection service.
 * @returns A callback that removes listeners and timers.
 */
export function setupFocusRevalidation(
    mainWindow: BrowserWindow,
    refreshCodeEditorIntegrations: RefreshCodeEditorIntegrations,
    gitService: GitService,
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
                    gitService,
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
