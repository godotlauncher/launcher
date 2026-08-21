import { _electron, expect, test } from '@playwright/test';
import fs from 'fs/promises';
import { getMainWindow } from './splashscreen/getMainWindow';

let electronApp: Awaited<ReturnType<typeof _electron.launch>>;
let mainPage: Awaited<ReturnType<typeof electronApp.firstWindow>>;

test.beforeEach(async () => {
    electronApp = await _electron.launch({
        args: ['.'],
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

test('Can open the Connections presentation from its shortcut', async () => {
    const connectionsShortcut = mainPage.getByTestId('btnConnections');

    await connectionsShortcut.click();

    await expect(mainPage).toHaveURL(/\/settings\/connections$/);
    await expect(connectionsShortcut).toHaveClass(/menu-active/);
    await expect(mainPage.getByTestId('btnSettings')).not.toHaveClass(
        /menu-active/,
    );
    await expect(mainPage.getByTestId('tabConnections')).toHaveAttribute(
        'aria-selected',
        'true',
    );
    await expect(mainPage.getByTestId('settingsTabRailEnd')).toHaveCSS(
        'border-bottom-width',
        '1px',
    );
    await expect(mainPage.getByTestId('settingsPanelContainer')).toHaveCSS(
        'border-top-left-radius',
        '0px',
    );
    await expect(mainPage.getByTestId('settingsPanelContainer')).toHaveCSS(
        'border-top-right-radius',
        '0px',
    );
    const githubCard = mainPage.getByTestId('app-integration-github');
    await expect(githubCard).toBeVisible();
    expect(
        await githubCard.evaluate((card) =>
            getComputedStyle(card.parentElement as HTMLElement).maxWidth,
        ),
    ).toBe('none');
    await expect(
        mainPage.getByRole('button', {
            name: /Connect GitHub|Add connection/,
        }),
    ).toBeEnabled();
});
