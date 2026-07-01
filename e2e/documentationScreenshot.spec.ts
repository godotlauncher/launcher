import { expect, test, _electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SCREENSHOTS } from './documentationScreenshots';
import { THEMES } from './documentationScreenshots/themes';
import {
    applyTheme,
    captureScreenshot,
    createFixtureHome,
    ensureMainNavigationReady,
    setScreenshotViewport,
    waitForPreloadScript,
} from './documentationScreenshots/runtime';

process.env.GODOT_LAUNCHER_DOCS_SCREENSHOTS = '1';

test('captures documentation screenshots for each main view', async ({}, testInfo) => {
    testInfo.setTimeout(240000);
    const fixtureHome = await createFixtureHome();
    const overrideHomeScript = path.resolve(
        process.cwd(),
        'e2e',
        'support',
        'overrideHome.cjs',
    );
    const existingNodeOptions = process.env.NODE_OPTIONS?.trim();
    const requireOverrideOption = `--require "${overrideHomeScript}"`;
    const baseEnv = Object.fromEntries(
        Object.entries(process.env).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
    );
    const launchEnv: Record<string, string> = {
        ...baseEnv,
        NODE_ENV: 'development',
        APPDATA: path.join(fixtureHome, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(fixtureHome, 'AppData', 'Local'),
        GODOT_LAUNCHER_DOCS_SCREENSHOTS: '1',
        GODOT_LAUNCHER_DOCS_HOME_DIR: fixtureHome,
        NODE_OPTIONS: existingNodeOptions
            ? `${existingNodeOptions} ${requireOverrideOption}`
            : requireOverrideOption,
    };
    // This env var makes Electron behave like plain Node and breaks Playwright's Electron launch.
    delete launchEnv.ELECTRON_RUN_AS_NODE;
    const electronApp = await _electron.launch({
        args: ['.'],
        env: launchEnv,
    });

    try {
        const mainPage = await electronApp.firstWindow();
        await waitForPreloadScript(mainPage);
        await ensureMainNavigationReady(mainPage, electronApp);
        await mainPage.getByTestId('btnProjects').click();
        await expect(
            mainPage.getByRole('button', {
                name: 'My-Awesome-game',
                exact: true,
            }),
        ).toBeVisible({
            timeout: 10000,
        });
        await expect(
            mainPage.getByRole('button', {
                name: 'My-Other-Game',
                exact: true,
            }),
        ).toBeVisible({
            timeout: 10000,
        });
        await expect(
            mainPage.getByRole('button', {
                name: 'My-Prototype',
                exact: true,
            }),
        ).toBeVisible({
            timeout: 10000,
        });
        await mainPage.getByTestId('btnInstalls').click();
        await expect(
            mainPage.getByText('4.7-stable', { exact: true }),
        ).toBeVisible({
            timeout: 10000,
        });
        await expect(mainPage.getByText('4.5.1-stable')).toBeVisible({
            timeout: 10000,
        });
        await expect(
            mainPage.getByText('/Applications/Godot_4.5.1_dotnet', {
                exact: true,
            }),
        ).toBeVisible({
            timeout: 10000,
        });
        await mainPage.getByTestId('btnProjects').click();

        for (const theme of THEMES) {
            await applyTheme(mainPage, theme);

            for (const shot of SCREENSHOTS) {
                await setScreenshotViewport(mainPage, shot.viewportHeight);
                await shot.navigate(mainPage, electronApp, theme);
                const themedFileName = `${shot.fileBase}_${theme.name}`;
                const themedDescription = `${shot.description} in ${theme.description}`;
                await captureScreenshot(
                    mainPage,
                    testInfo,
                    themedFileName,
                    themedDescription,
                );
                if (shot.cleanup) {
                    await shot.cleanup(mainPage, electronApp, theme);
                }
            }
        }
    } finally {
        await electronApp.close();
        await fs.rm(fixtureHome, { recursive: true, force: true });
    }
});
