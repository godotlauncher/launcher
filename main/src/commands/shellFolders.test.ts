import path from 'node:path';
import { dialog } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDirectoryDialog, openFileDialog } from './shellFolders.js';

const fsMocks = vi.hoisted(() => ({
    existsSync: vi.fn(),
    mkdir: vi.fn(),
}));

const mainWindowMock = {};

vi.mock('node:fs', () => ({
    existsSync: fsMocks.existsSync,
    promises: {
        mkdir: fsMocks.mkdir,
    },
}));

vi.mock('../mainWindow.js', () => ({
    getMainWindow: () => mainWindowMock,
}));

vi.mock('electron', () => ({
    dialog: {
        showOpenDialog: vi.fn(),
    },
    shell: {
        openPath: vi.fn(),
    },
}));

describe('shellFolders dialog helpers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(dialog.showOpenDialog).mockResolvedValue({
            canceled: true,
            filePaths: [],
        });
        fsMocks.existsSync.mockReturnValue(true);
        fsMocks.mkdir.mockResolvedValue(undefined);
    });

    it('opens file dialogs with the main window as owner', async () => {
        await openFileDialog('/tmp', 'Select File', [
            { name: 'JSON', extensions: ['json'] },
        ]);

        expect(dialog.showOpenDialog).toHaveBeenCalledWith(mainWindowMock, {
            defaultPath: path.resolve('/tmp'),
            filters: [{ name: 'JSON', extensions: ['json'] }],
            title: 'Select File',
            properties: ['openFile'],
        });
    });

    it('opens directory dialogs with the main window as owner', async () => {
        await openDirectoryDialog('/tmp', 'Select Folder');

        expect(dialog.showOpenDialog).toHaveBeenCalledWith(mainWindowMock, {
            defaultPath: path.resolve('/tmp'),
            filters: [],
            title: 'Select Folder',
            properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
        });
    });
});
