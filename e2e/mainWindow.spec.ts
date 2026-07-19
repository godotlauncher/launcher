import { _electron, expect, test } from '@playwright/test';
import fs from 'fs/promises';

let electronApp: Awaited<ReturnType<typeof _electron.launch>>;
let mainPage: Awaited<ReturnType<typeof electronApp.firstWindow>>;

test.beforeAll(async () => {
    electronApp = await _electron.launch({
        args: ['.'],
        env: { NODE_ENV: 'development' },
    });
    mainPage = await electronApp.firstWindow();
});

test.afterAll(async () => {
    await electronApp.close();
});

test('Can navigate the main window', async () => {
    const { version } = JSON.parse(
        await fs.readFile('./package.json', 'utf-8'),
    );

    await test.step('Loads the main window', async () => {
        await expect
            .poll(async () => await mainPage.title(), {
                message: 'Waiting for window title to include full version',
                timeout: 15_000,
            })
            .toBe(`Godot Launcher ${version}`);
        await expect(mainPage.getByTestId('btnProjects')).toBeVisible({
            timeout: 15_000,
        });
    });

    await test.step('Opens projects', async () => {
        await mainPage.getByTestId('btnProjects').click();
        await expect(mainPage.getByTestId('projectsTitle')).toBeVisible();
    });

    await test.step('Opens installs', async () => {
        await mainPage.getByTestId('btnInstalls').click();
        await expect(mainPage.getByTestId('installsTitle')).toBeVisible();
    });

    await test.step('Opens settings', async () => {
        await mainPage.getByTestId('btnSettings').click();
        await expect(mainPage.getByTestId('settingsTitle')).toBeVisible();
    });

    await test.step('Opens help', async () => {
        await mainPage.getByTestId('btnHelp').click();
        await expect(mainPage.getByTestId('helpTitle')).toBeVisible();
    });
});
