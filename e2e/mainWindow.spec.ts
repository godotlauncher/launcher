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
});

test.afterEach(async () => {
  await electronApp.close();
});



test('Has the correct title', async () => {
  const { version } = JSON.parse(await fs.readFile('./package.json', 'utf-8'));

  await expect
    .poll(async () => await mainPage.title(), {
      message: 'Waiting for window title to include full version',
      timeout: 15000,
    })
    .toBe(`Godot Launcher ${version}`);
});

test('Can view projects', async () => {

  await mainPage.getByTestId('btnProjects').click();
  const projectsView = await mainPage.getByTestId('projectsTitle');
  expect(projectsView).toHaveCount(1);

});

test('Can view installs', async () => {

  await mainPage.getByTestId('btnInstalls').click();
  const installsView = await mainPage.getByTestId('installsTitle');
  expect(installsView).toHaveCount(1);

});

test('Can view settings', async () => {

  await mainPage.getByTestId('btnSettings').click();
  const settingsView = await mainPage.getByTestId('settingsTitle');
  expect(settingsView).toHaveCount(1);

});
