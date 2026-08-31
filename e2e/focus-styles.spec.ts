import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, expect, type Locator, test } from '@playwright/test';
import {
    createFixtureHome,
    ensureMainNavigationReady,
} from './documentationScreenshots/runtime';
import type { ElectronPage } from './documentationScreenshots/types';

process.env.GODOT_LAUNCHER_DOCS_SCREENSHOTS = '1';

let electronApp: Awaited<ReturnType<typeof _electron.launch>> | undefined;
let mainPage: ElectronPage;
let fixtureHome: string | undefined;

test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    electronApp = await _electron.launch({
        args: [
            '.',
            `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`,
        ],
        env: createIsolatedLaunchEnvironment(fixtureHome),
    });
    mainPage = await electronApp.firstWindow();
    await expect(mainPage.getByTestId('btnProjects')).toBeVisible({
        timeout: 15_000,
    });
    await ensureMainNavigationReady(mainPage, electronApp);
});

test.afterAll(async () => {
    await electronApp?.close();
    if (fixtureHome) {
        await fs.rm(fixtureHome, { recursive: true, force: true });
    }
});

test('uses native DaisyUI keyboard focus across controls', async ({}, testInfo) => {
    await mainPage.getByTestId('btnInstalls').click();
    await mainPage.getByTestId('btnProjects').click();

    const searchField = mainPage.getByTestId('inputProjectSearch');
    await expect(searchField).toBeFocused();

    const firstProjectCard = mainPage.locator('[data-project-path]').first();
    await expect(firstProjectCard).toBeVisible({ timeout: 10_000 });

    const projectControls = [
        {
            name: 'search-field',
            locator: searchField,
        },
        {
            name: 'path-badge',
            locator: firstProjectCard
                .locator('[data-testid^="btnCopyProjectPath_"]')
                .first(),
        },
        {
            name: 'card-action',
            locator: firstProjectCard.getByTestId('btnToggleProjectPinned'),
        },
        {
            name: 'primary-action',
            locator: firstProjectCard.getByTestId('btnEditProjectInGodot'),
        },
    ];

    for (const control of projectControls) {
        await focusControlWithKeyboard(mainPage, control.locator);
        await expect(control.locator).toBeFocused();
        await expect(control.locator).toHaveCSS('outline-width', '2px');
        await expect(control.locator).toHaveCSS('outline-offset', '2px');
        expect(
            await control.locator.evaluate((element) =>
                element.matches(':focus-visible'),
            ),
        ).toBe(true);

        const screenshotPath = testInfo.outputPath(`${control.name}.png`);
        await mainPage.screenshot({ path: screenshotPath });
        await testInfo.attach(control.name, {
            path: screenshotPath,
            contentType: 'image/png',
        });
    }

    await mainPage.getByTestId('btnSettings').click();
    await mainPage.getByTestId('tabBehavior').click();
    await mainPage.keyboard.press('Tab');

    const themeRadio = mainPage.locator(
        'input[name="launch-action"]:checked',
    );
    await focusControlWithKeyboard(mainPage, themeRadio);
    await expect(themeRadio).toBeFocused();
    await expect(themeRadio).toHaveCSS('outline-width', '2px');
    await expect(themeRadio).toHaveCSS('outline-offset', '2px');
    expect(
        await themeRadio.evaluate((element) =>
            element.matches(':focus-visible'),
        ),
    ).toBe(true);

    const radioScreenshotPath = testInfo.outputPath('radio.png');
    await mainPage.screenshot({ path: radioScreenshotPath });
    await testInfo.attach('radio', {
        path: radioScreenshotPath,
        contentType: 'image/png',
    });

});

/**
 * Advances through the real tab order until the requested control is focused.
 *
 * @param page - Electron page containing the control.
 * @param control - Control that should receive keyboard-visible focus.
 * @returns A promise that ends when the control is focused.
 */
async function focusControlWithKeyboard(
    page: ElectronPage,
    control: Locator,
): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (
            await control.evaluate(
                (element) => element === document.activeElement,
            )
        ) {
            return;
        }
        await page.keyboard.press('Tab');
    }

    throw new Error('Could not reach the requested control through Tab order.');
}

/**
 * Creates the isolated environment used by the focus-style Electron test.
 *
 * @param homeDir - Fixture home used for launcher state.
 * @returns Environment variables for the isolated app.
 */
function createIsolatedLaunchEnvironment(
    homeDir: string,
): Record<string, string> {
    const overrideHomeScript = path.resolve(
        process.cwd(),
        'e2e',
        'support',
        'overrideHome.cjs',
    );
    const existingNodeOptions = process.env.NODE_OPTIONS?.trim();
    const requireOverrideOption = `--require "${overrideHomeScript}"`;
    const launchEnvironment: Record<string, string> = {
        ...Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
            ),
        ),
        APPDATA: path.join(homeDir, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(homeDir, 'AppData', 'Local'),
        GODOT_LAUNCHER_DOCS_SCREENSHOTS: '1',
        GODOT_LAUNCHER_DOCS_HOME_DIR: homeDir,
        NODE_OPTIONS: existingNodeOptions
            ? `${existingNodeOptions} ${requireOverrideOption}`
            : requireOverrideOption,
    };
    delete launchEnvironment.ELECTRON_RUN_AS_NODE;
    return launchEnvironment;
}
