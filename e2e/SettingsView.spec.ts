import { _electron, expect, test } from '@playwright/test';
import fs from 'fs/promises';
import { getMainWindow } from './splashscreen/getMainWindow';

let electronApp: Awaited<ReturnType<typeof _electron.launch>>;
let mainPage: Awaited<ReturnType<typeof electronApp.firstWindow>>;

test.beforeEach(async () => {
    electronApp = await _electron.launch({
        args: ['.'],
        env: { NODE_ENV: 'development' },
    });
    mainPage = await getMainWindow(electronApp);
    await mainPage.getByTestId('btnSettings').click();
    const settingsView = await mainPage.getByTestId('settingsTitle');
    await expect(settingsView).toHaveCount(1);
    await expect(settingsView).toBeVisible();
    await mainPage.getByTestId('tabAppearance').click();
});

test.afterEach(async () => {
    await electronApp.close();
});

test('Can set theme light', async () => {
    await mainPage.getByTestId('themeLight').click();
    const theme = await mainPage.evaluate(() =>
        window.localStorage.getItem('theme'),
    );
    expect(theme).toBe('light');
});

test('Can set theme dark', async () => {
    await mainPage.getByTestId('themeDark').click();
    const theme = await mainPage.evaluate(() =>
        window.localStorage.getItem('theme'),
    );
    expect(theme).toBe('dark');
});

test('Can set theme auto', async () => {
    await mainPage.getByTestId('themeAuto').click();
    const theme = await mainPage.evaluate(() =>
        window.localStorage.getItem('theme'),
    );
    expect(theme).toBe('auto');
});
