import { test, expect, _electron } from '@playwright/test';
import fs from 'fs/promises';


let electronApp: Awaited<ReturnType<typeof _electron.launch>>;
let mainPage: Awaited<ReturnType<typeof electronApp.firstWindow>>;

async function waitForPreloadScript() {
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      const electronBridge = await mainPage.evaluate(() => {
        return (window as Window & { electron?: any; }).electron;
      });

      if (electronBridge) {
        clearInterval(interval);
        resolve(true);
      }

    }, 100);
  });
}

test.beforeEach(async () => {
  electronApp = await _electron.launch({
    args: ['.'],
    env: { NODE_ENV: 'development' },
  });
  mainPage = await electronApp.firstWindow();
  await waitForPreloadScript();

  await mainPage.getByTestId('btnSettings').click();
  const settingsView = await mainPage.getByTestId('settingsTitle');
  expect(settingsView).toHaveCount(1);
  expect(settingsView.isVisible()).toBeTruthy();
  await mainPage.getByTestId("tabAppearance").click();

});

test.afterEach(async () => {
  await electronApp.close();
});


test('Can set theme light', async () => {

  await mainPage.getByTestId('themeLight').click();
  const theme = await mainPage.evaluate(() => window.localStorage.getItem('theme'));
  expect(theme).toBe('light');

});

test('Can set theme dark', async () => {

  await mainPage.getByTestId('themeDark').click();
  const theme = await mainPage.evaluate(() => window.localStorage.getItem('theme'));
  expect(theme).toBe('dark');

});

test('Can set theme auto', async () => {

  await mainPage.getByTestId('themeAuto').click();
  const theme = await mainPage.evaluate(() => window.localStorage.getItem('theme'));
  expect(theme).toBe('auto');

});
