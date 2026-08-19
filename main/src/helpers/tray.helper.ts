import * as path from 'node:path';

import type { ProjectDetails } from '@shared/contracts';
import { app, type BrowserWindow, Menu, Tray } from 'electron';
import { t } from '../i18n/index.js';
import { getAssetPath } from '../pathResolver.js';

let tray: Tray;
let mainWindow: BrowserWindow;
let launchProjectFromTray: (project: ProjectDetails) => Promise<void>;
let showMainWindowFromTray: () => void;
let listProjectsForTray: () => Promise<ProjectDetails[]>;

/**
 * Creates the application tray and binds its project callbacks.
 *
 * @param window - Main application window.
 * @param launchProjectHandler - Callback used to launch a recent project.
 * @param showMainWindowHandler - Callback used to reveal the main window.
 * @param listProjectsHandler - Callback used to load recent projects.
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

export async function updateLinuxTray(): Promise<void> {
    tray.setContextMenu(await updateMenu(tray, mainWindow));
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
    const filteredProjects = projects
        .filter((p) => p.last_opened != null && p.last_opened.getTime() > 0)
        .sort(
            (a, b) =>
                (b.last_opened?.getTime() || 0) -
                (a.last_opened?.getTime() || 0),
        );

    const last3 = filteredProjects.slice(0, 3);

    let quickLaunchMenu: Array<Electron.MenuItemConstructorOptions> = [];

    if (last3.length > 0) {
        quickLaunchMenu = [
            {
                label: t('menus:tray.recentProjects'),
                enabled: false,
            },
        ];

        last3.forEach((p) => {
            quickLaunchMenu.push({
                label: p.valid
                    ? p.name
                    : t('menus:tray.invalidProject', { project: p.name }),
                enabled: p.valid,
                click: async () => {
                    if (!p.valid) {
                        return;
                    }
                    await launchProjectFromTray(p);
                },
            });
        });

        quickLaunchMenu.push({
            type: 'separator',
        });
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

async function popMenu(tray: Tray, mainWindow: BrowserWindow): Promise<void> {
    const menu = await updateMenu(tray, mainWindow);

    tray.popUpContextMenu(menu);
}
