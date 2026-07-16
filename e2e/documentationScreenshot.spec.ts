import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type TestInfo,
    test,
} from '@playwright/test';
import { SCREENSHOT_GROUPS } from './documentationScreenshots';
import {
    applyTheme,
    captureScreenshot,
    createFixtureHome,
    ensureMainNavigationReady,
    setScreenshotViewport,
} from './documentationScreenshots/runtime';
import { THEMES } from './documentationScreenshots/themes';
import type {
    ElectronPage,
    ScreenshotConfig,
    ThemeConfig,
} from './documentationScreenshots/types';
import { waitForDiElectronPreload } from './support/waitForDiElectronPreload';

process.env.GODOT_LAUNCHER_DOCS_SCREENSHOTS = '1';

test.describe.configure({ mode: 'serial' });

for (const theme of THEMES) {
    for (const group of SCREENSHOT_GROUPS) {
        test(`captures ${group.name} documentation screenshots in ${theme.description}`, async ({ }, testInfo) => {
            testInfo.setTimeout(group.timeout);

            await withDocumentationApp(async (mainPage, electronApp) => {
                await applyTheme(mainPage, theme);
                await captureScreenshotsForGroup(
                    mainPage,
                    electronApp,
                    testInfo,
                    theme,
                    group.screenshots,
                );
            });
        });
    }
}

async function withDocumentationApp(
    runScreenshots: (
        mainPage: ElectronPage,
        electronApp: ElectronApplication,
    ) => Promise<void>,
) {
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
        await primeDocumentationApp(mainPage, electronApp);
        await runScreenshots(mainPage, electronApp);
    } finally {
        await electronApp.close();
        await fs.rm(fixtureHome, { recursive: true, force: true });
    }
}

async function primeDocumentationApp(
    mainPage: ElectronPage,
    electronApp: ElectronApplication,
) {
    await waitForDiElectronPreload(mainPage);
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
    await expect(mainPage.getByText('4.7-stable', { exact: true })).toBeVisible(
        {
            timeout: 10000,
        },
    );
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
}

async function captureScreenshotsForGroup(
    mainPage: ElectronPage,
    electronApp: ElectronApplication,
    testInfo: TestInfo,
    theme: ThemeConfig,
    screenshots: ScreenshotConfig[],
) {
    for (const shot of screenshots) {
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
