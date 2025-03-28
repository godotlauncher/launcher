import * as fs from 'node:fs';
import * as path from 'node:path';

import { dialog, Menu, shell } from 'electron';

export async function openShellFolder(pathToOpen: string): Promise<void> {

    const menu = Menu.buildFromTemplate([
        {
            label: 'Open in Terminal',
            click: () => {
                shell.openPath(pathToOpen);
            }
        }
    ]);
    menu.popup();
    // shell.openPath(pathToOpen);
}

export async function openFileDialog(
    defaultPath: string,
    title: string = 'Select File',
    filters: Electron.FileFilter[] = [{ name: 'Any File', extensions: ['*.*'] }]
): Promise<Electron.OpenDialogReturnValue> {
    return await dialog.showOpenDialog({
        defaultPath: path.resolve(defaultPath),
        filters,
        title,
        properties: ['openFile'],
    });
}

export async function openDirectoryDialog(
    defaultPath: string,
    title: string = 'Select Folder',
    filters: Electron.FileFilter[] = []
): Promise<Electron.OpenDialogReturnValue> {
    defaultPath = path.resolve(defaultPath + path.sep);

    if (!fs.existsSync(defaultPath)) {
        fs.promises.mkdir(defaultPath, { recursive: true });
    }

    return await dialog.showOpenDialog({
        defaultPath,
        filters,
        title,
        properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
    });
}


