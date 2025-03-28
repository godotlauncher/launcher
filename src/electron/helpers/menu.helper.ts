import { BrowserWindow, Menu, shell } from 'electron';
import { isDev } from '../utils.js';
import { getPrefsPath } from '../utils/prefs.utils.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createMenu(mainWindow: BrowserWindow) {
    Menu.setApplicationMenu(
        Menu.buildFromTemplate([
            {
                label: process.platform === 'darwin' ? undefined : 'App',
                type: 'submenu',
                submenu: [
                    {
                        label: 'About',
                        role: 'about',
                    },
                    {
                        type: 'separator',
                    },
                    {
                        label: 'Close',
                        role: 'close',
                    },
                    {
                        type: 'separator',
                    },
                    {
                        label: 'Quit',
                        role: 'quit',
                    },
                ],
            },
            {
                label: 'Developer',
                submenu: [
                    {
                        label: 'Reload',
                        role: 'reload',
                    },
                    {
                        label: 'Toggle Developer Tools',
                        role: 'toggleDevTools',
                        visible: isDev(),
                    },
                    {
                        type: 'separator',
                    },
                    {
                        label: 'Open Config Folder',
                        click: async () => {
                            const prefsPath = await getPrefsPath();
                            shell.showItemInFolder(prefsPath);
                        },
                    },
                ],
            },
        ])
    );
}
