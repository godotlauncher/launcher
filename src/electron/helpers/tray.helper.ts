import * as path from 'node:path';

import { app, type BrowserWindow, Menu, Tray } from 'electron';
import { launchProject } from '../commands/projects.js';
import { PROJECTS_FILENAME } from '../constants.js';
import { t } from '../i18n/index.js';
import { getAssetPath } from '../pathResolver.js';
import { getConfigDir } from '../utils/prefs.utils.js';
import { getStoredProjectsList } from '../utils/projects.utils.js';

let tray: Tray;
let mainWindow: BrowserWindow;

export async function createTray(window: BrowserWindow): Promise<Tray> {
    mainWindow = window;

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
            mainWindow.show();
            if (app.dock) {
                app.dock.show();
            }
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
    tray: Tray,
    mainWindow: BrowserWindow,
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
        .sort((a, b) => b.last_opened!.getTime() - a.last_opened!.getTime());

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
                    await launchProject(p);
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
                mainWindow.show();
                if (app.dock) {
                    app.dock.show();
                }
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
