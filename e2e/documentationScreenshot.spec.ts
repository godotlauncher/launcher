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
    getInstallsView,
    setScreenshotViewport,
} from './documentationScreenshots/runtime';
import { THEMES } from './documentationScreenshots/themes';
import type {
    ElectronPage,
    ScreenshotConfig,
    ThemeConfig,
} from './documentationScreenshots/types';

process.env.GODOT_LAUNCHER_DOCS_SCREENSHOTS = '1';
const requestedScreenshot =
    process.env.GODOT_LAUNCHER_DOCS_SCREENSHOT?.trim();

test.describe.configure({ mode: 'serial' });

for (const theme of THEMES) {
    for (const group of SCREENSHOT_GROUPS) {
        const screenshots = requestedScreenshot
            ? group.screenshots.filter(
                  (screenshot) => screenshot.fileBase === requestedScreenshot,
              )
            : group.screenshots;
        if (screenshots.length === 0) {
            continue;
        }
        test(
            `captures ${group.name} documentation screenshots in ${theme.description}`,
            { tag: '@screenshots' },
            async ({}, testInfo) => {
                testInfo.setTimeout(group.timeout);

                await withDocumentationApp(async (mainPage, electronApp) => {
                    await applyTheme(mainPage, theme);
                    await captureScreenshotsForGroup(
                        mainPage,
                        electronApp,
                        testInfo,
                        theme,
                        screenshots,
                    );
                });
            },
        );
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
        await expect(mainPage.getByTestId('btnProjects')).toBeVisible({
            timeout: 15_000,
        });
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
    await ensureMainNavigationReady(mainPage, electronApp);
    await mainPage.getByTestId('btnSettings').click();
    await mainPage.getByTestId('tabAppearance').click();
    const languageSelector = mainPage.locator('select').filter({
        has: mainPage.locator('option[value="en"]'),
    });
    await expect(languageSelector).toBeVisible();
    await languageSelector.selectOption('en');
    await expect(languageSelector).toHaveValue('en');
    await expect(mainPage.getByTestId('btnProjects')).toContainText(
        'Projects',
    );
    await mainPage.getByTestId('btnProjects').click();
    await expect(
        mainPage.getByText('My Awesome Game', { exact: true }).first(),
    ).toBeVisible({
        timeout: 10000,
    });
    await expect(
        mainPage.getByText('My Other Game', { exact: true }),
    ).toBeVisible({
        timeout: 10000,
    });
    await expect(
        mainPage.getByText('My Prototype', { exact: true }),
    ).toBeVisible({
        timeout: 10000,
    });
    await mainPage.getByTestId('btnInstalls').click();
    const installsView = getInstallsView(mainPage);
    await expect(installsView).toBeVisible({ timeout: 10000 });
    await expect(mainPage.getByTestId('btnInstallEditor')).toBeVisible({
        timeout: 10000,
    });
    await expect(
        installsView.getByText('4.7-stable', { exact: true }),
    ).toBeVisible({
        timeout: 10000,
    });
    await expect(installsView.getByText('4.5.1-stable')).toBeVisible({
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
            shot.fullPage,
        );
        if (shot.cleanup) {
            await shot.cleanup(mainPage, electronApp, theme);
        }
    }
}
