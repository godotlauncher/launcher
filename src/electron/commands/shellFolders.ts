import * as fs from 'node:fs';
import * as path from 'node:path';

import { dialog, shell } from 'electron';

export async function openShellFolder(pathToOpen: string): Promise<void> {
    // make sure the path is resolved
    pathToOpen = path.resolve(pathToOpen);

    // check if the path exists and keep eating away the parts until we find an existing path
    while (!fs.existsSync(pathToOpen)) {
        const parentPath = path.dirname(pathToOpen);
        if (parentPath === pathToOpen) {
            // reached root and nothing exists
            break;
        }
        pathToOpen = parentPath;
    }

    await shell.openPath(pathToOpen);
}

export async function openFileDialog(
    defaultPath: string,
    title: string = 'Select File',
    filters: Electron.FileFilter[] = [
        { name: 'Any File', extensions: ['*.*'] },
    ],
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
    filters: Electron.FileFilter[] = [],
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
