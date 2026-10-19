import * as path from 'node:path';

import type { ProjectDetails } from '@shared/contracts';
import { app, type BrowserWindow, Menu, Tray } from 'electron';
import logger from 'electron-log';
import { t } from '../i18n/index.js';
import { getAssetPath } from '../pathResolver.js';

let tray: Tray;
let mainWindow: BrowserWindow;
let launchProjectFromTray: (project: ProjectDetails) => Promise<void>;
let showMainWindowFromTray: () => void;
let listProjectsForTray: () => Promise<ProjectDetails[]>;
let linuxMenuRevision = 0;

/**
 * Creates the application tray and binds its project callbacks.
 *
 * @param window - Main application window.
 * @param launchProjectHandler - Callback used to launch a project.
 * @param showMainWindowHandler - Callback used to reveal the main window.
 * @param listProjectsHandler - Callback used to load stored projects.
 * @returns The configured Electron tray.
 */
export async function createTray(
    window: BrowserWindow,
    launchProjectHandler: (project: ProjectDetails) => Promise<void>,
    showMainWindowHandler: () => void,
    listProjectsHandler: () => Promise<ProjectDetails[]>,
): Promise<Tray> {
    mainWindow = window;
    launchProjectFromTray = launchProjectHandler;
    showMainWindowFromTray = showMainWindowHandler;
    listProjectsForTray = listProjectsHandler;

    tray = new Tray(
        path.resolve(
            getAssetPath(),
            'icons',
            process.platform === 'darwin'
                ? 'darwin/trayIconTemplate.png'
                : 'default/trayIcon.png',
        ),
    );

    tray.setToolTip('Godot Launcher');

    if (process.platform === 'darwin') {
        tray.on('click', async () => {
            await popMenu(tray, mainWindow);
        });
        tray.on('right-click', async () => {
            await popMenu(tray, mainWindow);
        });
    }

    if (process.platform === 'win32') {
        tray.on('click', async () => {
            showMainWindowFromTray();
        });

        tray.on('right-click', async () => {
            await popMenu(tray, mainWindow);
        });
    }
    if (process.platform === 'linux') {
        await updateLinuxTray();
    }

    return tray;
}

/** Refreshes an existing Linux tray without affecting saved project changes. */
export async function updateLinuxTray(): Promise<void> {
    if (process.platform !== 'linux' || !tray || tray.isDestroyed()) {
        return;
    }

    const currentTray = tray;
    const revision = ++linuxMenuRevision;
    try {
        const menu = await updateMenu(currentTray, mainWindow);
        if (
            revision === linuxMenuRevision &&
            currentTray === tray &&
            !currentTray.isDestroyed()
        ) {
            currentTray.setContextMenu(menu);
        }
    } catch (error) {
        logger.warn('Could not refresh the system tray menu', error);
    }
}

/**
 * Builds the current tray menu from the latest stored projects.
 *
 * @param _tray - Tray instance retained for the platform menu lifecycle.
 * @param _mainWindow - Main window retained for the platform menu lifecycle.
 * @returns The rebuilt Electron menu.
 */
export async function updateMenu(
    _tray: Tray,
    _mainWindow: BrowserWindow,
): Promise<Electron.Menu> {
    const projects = await listProjectsForTray();
    const pinnedProjects = projects
        .filter((project) => project.pinned)
        .sort(comparePinnedProjects);
    const visiblePins = pinnedProjects.slice(0, 3);
    const visiblePinPaths = new Set(visiblePins.map((project) => project.path));
    const recentProjects = projects
        .filter(
            (project) =>
                !visiblePinPaths.has(project.path) &&
                project.last_opened != null &&
                project.last_opened.getTime() > 0,
        )
        .sort(
            (a, b) =>
                (b.last_opened?.getTime() || 0) -
                (a.last_opened?.getTime() || 0),
        )
        .slice(0, 3);

    const quickLaunchMenu: Electron.MenuItemConstructorOptions[] = [];
    if (visiblePins.length > 0) {
        quickLaunchMenu.push(
            { label: t('menus:tray.pinnedProjects'), enabled: false },
            ...visiblePins.map(projectMenuItem),
        );
        const remainingPins = pinnedProjects.slice(3);
        if (remainingPins.length > 0) {
            quickLaunchMenu.push({
                label: t('menus:tray.moreProjects'),
                submenu: remainingPins.map(projectMenuItem),
            });
        }
        quickLaunchMenu.push({ type: 'separator' });
    }

    if (recentProjects.length > 0) {
        quickLaunchMenu.push(
            { label: t('menus:tray.recentProjects'), enabled: false },
            ...recentProjects.map(projectMenuItem),
            { type: 'separator' },
        );
    }

    const menu = Menu.buildFromTemplate([
        ...quickLaunchMenu,
        {
            label: t('menus:tray.showGodotLauncher'),
            click: () => {
                showMainWindowFromTray();
            },
        },
        { type: 'separator' },
        {
            label: t('menus:tray.quit'),
            click: () => {
                app.quit();
            },
        },
    ]);
    return menu;
}

/**
 * Creates a project action using the existing validity and launch behaviour.
 * @param project - Stored project to display.
 */
function projectMenuItem(
    project: ProjectDetails,
): Electron.MenuItemConstructorOptions {
    return {
        label: project.valid
            ? project.name
            : t('menus:tray.invalidProject', { project: project.name }),
        enabled: project.valid,
        click: async () => {
            if (project.valid) {
                await launchProjectFromTray(project);
            }
        },
    };
}

/**
 * Matches saved pin order, with the existing fallback for legacy projects.
 * @param first - First pinned project.
 * @param second - Second pinned project.
 */
function comparePinnedProjects(
    first: ProjectDetails,
    second: ProjectDetails,
): number {
    const firstOrder =
        Number.isInteger(first.pinned_order) && (first.pinned_order ?? -1) >= 0
            ? (first.pinned_order as number)
            : Number.POSITIVE_INFINITY;
    const secondOrder =
        Number.isInteger(second.pinned_order) &&
        (second.pinned_order ?? -1) >= 0
            ? (second.pinned_order as number)
            : Number.POSITIVE_INFINITY;
    if (firstOrder !== secondOrder) {
        return firstOrder - secondOrder;
    }
    return (
        (second.last_opened?.getTime() ?? 0) -
            (first.last_opened?.getTime() ?? 0) ||
        first.name.localeCompare(second.name)
    );
}

/**
 * Opens a freshly built menu for platforms that rebuild on demand.
 * @param tray - Tray whose menu should open.
 * @param mainWindow - Main application window.
 */
async function popMenu(tray: Tray, mainWindow: BrowserWindow): Promise<void> {
    const menu = await updateMenu(tray, mainWindow);

    tray.popUpContextMenu(menu);
}
