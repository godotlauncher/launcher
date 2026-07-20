import {
    type ElectronApplication,
    expect,
    type Page,
} from '@playwright/test';

const MAIN_WINDOW_URL = 'http://localhost:5123';

export async function getMainWindow(
    electronApp: ElectronApplication,
): Promise<Page> {
    await expect
        .poll(
            () =>
                electronApp
                    .windows()
                    .some((page) => page.url().startsWith(MAIN_WINDOW_URL)),
            {
                message: 'Waiting for the Godot Launcher main window',
                timeout: 15_000,
            },
        )
        .toBe(true);

    const mainWindow = electronApp
        .windows()
        .find((page) => page.url().startsWith(MAIN_WINDOW_URL));
    if (!mainWindow) {
        throw new Error('Godot Launcher main window was not found');
    }

    return mainWindow;
}
