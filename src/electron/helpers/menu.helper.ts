import { BrowserWindow, Menu, shell } from 'electron';
import { isDev } from '../utils.js';
import { getPrefsPath } from '../utils/prefs.utils.js';
import { t } from '../i18n/index.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createMenu(mainWindow: BrowserWindow) {
    Menu.setApplicationMenu(
        Menu.buildFromTemplate([
            {
                label: process.platform === 'darwin' ? undefined : t('menus:app.label'),
                type: 'submenu',
                submenu: [
                    {
                        label: t('menus:app.about'),
                        role: 'about',
                    },
                    {
                        type: 'separator',
                    },
                    {
                        label: t('menus:app.close'),
                        role: 'close',
                    },
                    {
                        type: 'separator',
                    },
                    {
                        label: t('menus:app.quit'),
                        role: 'quit',
                    },
                ],
            },
            {
                label: t('menus:developer.label'),
                submenu: [
                    {
                        label: t('menus:developer.reload'),
                        role: 'reload',
                    },
                    {
                        label: t('menus:developer.toggleDevTools'),
                        role: 'toggleDevTools',
                        visible: isDev(),
                    },
                    {
                        type: 'separator',
                    },
                    {
                        label: t('menus:developer.openConfigFolder'),
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
