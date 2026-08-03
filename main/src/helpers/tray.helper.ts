import * as path from 'node:path';

import type { ProjectDetails } from '@shared/contracts';
import { app, type BrowserWindow, Menu, Tray } from 'electron';
import { PROJECTS_FILENAME } from '../constants.js';
import { t } from '../i18n/index.js';
import { getAssetPath } from '../pathResolver.js';
import { getConfigDir } from '../utils/prefs.utils.js';
import { getStoredProjectsList } from '../utils/projects.utils.js';

let tray: Tray;
let mainWindow: BrowserWindow;
let launchProjectFromTray: (project: ProjectDetails) => Promise<void>;
let showMainWindowFromTray: () => void;

export async function createTray(
    window: BrowserWindow,
    launchProjectHandler: (project: ProjectDetails) => Promise<void>,
    showMainWindowHandler: () => void,
): Promise<Tray> {
    mainWindow = window;
    launchProjectFromTray = launchProjectHandler;
    showMainWindowFromTray = showMainWindowHandler;

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

export async function updateMenu(
    _tray: Tray,
    _mainWindow: BrowserWindow,
): Promise<Electron.Menu> {
    const projectListFIle = path.resolve(
        await getConfigDir(),
        PROJECTS_FILENAME,
    );

    const projects = await getStoredProjectsList(projectListFIle);
    const filteredProjects = projects
        .filter(
            (p) =>
                p.valid && p.last_opened != null && p.last_opened.getTime() > 0,
        )
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
                label: p.name,
                click: async () => {
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
