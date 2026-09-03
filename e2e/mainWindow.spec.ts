import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, expect, test } from '@playwright/test';
import type { ReleaseInstallProgress } from '@shared/contracts';
import {
    createFixtureHome,
    prepareAppWithStubbedData,
    setAppLanguage,
} from './support/e2e-fixture-runtime.js';
import { getMainWindow } from './splashscreen/getMainWindow';

let electronApp: Awaited<ReturnType<typeof _electron.launch>>;
let mainPage: Awaited<ReturnType<typeof electronApp.firstWindow>>;
let fixtureHome: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    electronApp = await _electron.launch({
        args: ['.'],
        env: createIsolatedLaunchEnvironment(fixtureHome),
    });
    mainPage = await getMainWindow(electronApp);
    await setAppLanguage(mainPage, 'English');
    await prepareAppWithStubbedData(mainPage, electronApp);
});

test.afterAll(async () => {
    await electronApp.close();
    await fs.rm(fixtureHome, { recursive: true, force: true });
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

    await test.step('Opens installs', async () => {
        await mainPage.getByTestId('btnInstalls').click();
        await expect(mainPage.getByTestId('installsTitle')).toBeVisible();
        await expect(mainPage.getByTestId('inputInstallSearch')).toBeEnabled();
        const installedReleaseList = mainPage.getByTestId(
            'installedReleaseList',
        );
        await expect(installedReleaseList).toBeVisible();
        await expect(installedReleaseList.getByRole('table')).toHaveCount(0);
        const firstGroupHeading = installedReleaseList
            .getByRole('heading', { level: 2 })
            .first();
        await expect(firstGroupHeading.locator('..')).toHaveCSS(
            'position',
            'sticky',
        );
        const firstInstalledEditorName = installedReleaseList
            .locator('article')
            .first()
            .locator('span.text-lg')
            .first();
        await expect(firstInstalledEditorName).toHaveCSS(
            'font-size',
            '15.75px',
        );
        await expect(firstInstalledEditorName).toHaveCSS(
            'font-weight',
            '600',
        );
    });

    await test.step('Opens the install editor drawer', async () => {
        await mainPage.getByTestId('btnInstallEditor').click();
        const drawer = mainPage.getByTestId('installEditorDrawer');

        await expect(drawer).toBeVisible();
        await expect(drawer.getByTestId('tabInstallsLatest')).toHaveAttribute(
            'aria-selected',
            'true',
        );
        await expect(drawer.getByTestId('tabInstallsRelease')).toHaveAttribute(
            'aria-selected',
            'true',
        );
        const latestVersionLabel = drawer
            .locator('article')
            .first()
            .locator('span')
            .first();
        await expect(latestVersionLabel).toHaveCSS('font-size', '15.75px');
        await expect(latestVersionLabel).toHaveCSS('font-weight', '600');
        const reloadButton = drawer.getByTestId(
            'btnRefreshInstallEditorCatalog',
        );
        const [drawerBounds, reloadBounds] = await Promise.all([
            drawer.boundingBox(),
            reloadButton.boundingBox(),
        ]);
        expect(drawerBounds).not.toBeNull();
        expect(reloadBounds).not.toBeNull();
        expect(
            drawerBounds!.x +
                drawerBounds!.width -
                (reloadBounds!.x + reloadBounds!.width),
        ).toBeLessThanOrEqual(24);
        const reloadTooltipTrigger = reloadButton.locator('..');
        await mainPage.mouse.move(0, 0);
        await reloadTooltipTrigger.hover();
        await expect(mainPage.getByRole('tooltip')).toHaveText(
            'Reload Release List',
        );
        await mainPage.mouse.move(0, 0);
        await expect(mainPage.getByRole('tooltip')).toBeHidden();

        const installedAction = drawer
            .locator('button[data-testid^="btnDownload"][disabled]')
            .first();
        await expect(installedAction).toBeVisible();
        await installedAction.locator('..').hover();
        await expect(mainPage.getByRole('tooltip')).toContainText('installed');
        await drawer.getByTestId('tabInstallsLatest').hover();
        await expect(mainPage.getByRole('tooltip')).toBeHidden();

        await drawer.getByTestId('tabInstallsAll').click();
        const installAction = drawer
            .locator('button[data-testid^="btnDownload"]:not([disabled])')
            .first();
        await expect(installAction).toBeVisible();
        const actionTestId = await installAction.getAttribute('data-testid');
        expect(actionTestId).not.toBeNull();
        const actionIdentity = actionTestId!.replace('btnDownload', '');
        const mono = actionIdentity.endsWith('-mono');
        const releaseVersion = mono
            ? actionIdentity.slice(0, -'-mono'.length)
            : actionIdentity;
        const actionBounds = await installAction.boundingBox();
        expect(actionBounds).not.toBeNull();

        await installAction.hover();
        await expect(mainPage.getByRole('tooltip')).toContainText(
            'Install Godot',
        );
        const progress: ReleaseInstallProgress = {
            id: `${releaseVersion}:${mono ? 'dotnet' : 'standard'}`,
            version: releaseVersion,
            mono,
            prerelease: false,
            published_at: null,
            stage: 'downloading',
            percent: 55,
            receivedBytes: 55 * 1024 * 1024,
            totalBytes: 100 * 1024 * 1024,
        };
        await publishInstallProgress(electronApp, progress);

        const progressIndicator = drawer.getByTestId(
            `installProgress${releaseVersion}${mono ? '-mono' : ''}`,
        );
        await expect(progressIndicator).toBeVisible();
        await expect(mainPage.getByRole('tooltip')).toBeHidden();
        const progressBounds = await progressIndicator.boundingBox();
        expect(progressBounds).not.toBeNull();
        expect(Math.abs(progressBounds!.width - actionBounds!.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(progressBounds!.height - actionBounds!.height)).toBeLessThanOrEqual(1);
        await publishInstallProgress(electronApp, {
            ...progress,
            stage: 'complete',
            percent: 100,
        });
        await drawer.getByTestId('tabInstallsLatest').click();

        await expect(drawer.getByTestId('inputInstallSearch')).toHaveCount(0);

        await drawer.getByTestId('tabInstallsAll').click();
        const drawerSearch = drawer.getByTestId('inputInstallSearch');
        await expect(drawerSearch).toBeEnabled();
        await expect(drawerSearch).toBeFocused();
        const allReleaseList = drawer.getByTestId('installEditorAllList');
        await expect(allReleaseList.getByRole('table')).toHaveCount(0);
        await expect(
            allReleaseList.getByTestId('inputInstallSearch'),
        ).toHaveCount(0);
        await expect(
            allReleaseList.locator('h3').first().locator('..'),
        ).toHaveCSS('position', 'sticky');
        const allVersionLabel = allReleaseList
            .locator('article')
            .first()
            .locator('span')
            .first();
        await expect(allVersionLabel).toHaveCSS('font-size', '15.75px');
        await expect(allVersionLabel).toHaveCSS('font-weight', '600');
        await drawerSearch.fill('4.5');
        await drawer.getByTestId('tabInstallsPrerelease').click();
        await expect(
            drawer.getByTestId('tabInstallsPrerelease'),
        ).toHaveAttribute('aria-selected', 'true');
        await expect(drawerSearch).toBeFocused();
        await expect(drawerSearch).toHaveValue('4.5');
        await drawer.getByTestId('tabInstallsLatest').click();
        await expect(drawer.getByTestId('inputInstallSearch')).toHaveCount(0);

        await drawer.getByTestId('btnCloseInstallEditor').click();
        await expect(drawer).toBeHidden();

        await mainPage.getByTestId('btnInstallEditor').click();
        await expect(drawer).toBeVisible();
        await expect(drawer.getByTestId('tabInstallsLatest')).toHaveAttribute(
            'aria-selected',
            'true',
        );
        await expect(drawer.getByTestId('tabInstallsRelease')).toHaveAttribute(
            'aria-selected',
            'true',
        );
        await expect(drawer.getByTestId('inputInstallSearch')).toHaveCount(0);
        await drawer.getByTestId('tabInstallsAll').click();
        await expect(drawer.getByTestId('inputInstallSearch')).toBeFocused();
        await expect(drawer.getByTestId('inputInstallSearch')).toHaveValue('');
        await drawer.getByTestId('btnCloseInstallEditor').click();
    });

    await test.step('Opens projects', async () => {
        await mainPage.getByTestId('btnProjects').click();
        await expect(mainPage.getByTestId('projectsTitle')).toBeVisible();
        await expect(mainPage.getByTestId('inputProjectSearch')).toBeEnabled();
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

/**
 * Publishes one install progress event to every launcher window.
 *
 * @param app - The Electron app that owns the launcher windows.
 * @param progress - The progress event to publish.
 * @returns A promise that ends after the event is sent.
 */
async function publishInstallProgress(
    app: Awaited<ReturnType<typeof _electron.launch>>,
    progress: ReleaseInstallProgress,
): Promise<void> {
    await app.evaluate(
        (
            { BrowserWindow },
            injectedProgress: ReleaseInstallProgress,
        ) => {
            for (const window of BrowserWindow.getAllWindows()) {
                window.webContents.send(
                    'release-install-progress',
                    injectedProgress,
                );
            }
        },
        progress,
    );
}

/**
 * Creates an isolated environment for the main-window Electron app.
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
        GODOT_LAUNCHER_E2E_FIXTURES: '1',
        GODOT_LAUNCHER_E2E_HOME_DIR: homeDir,
        NODE_ENV: 'production',
        NODE_OPTIONS: existingNodeOptions
            ? `${existingNodeOptions} ${requireOverrideOption}`
            : requireOverrideOption,
    };
    delete launchEnvironment.ELECTRON_RUN_AS_NODE;
    return launchEnvironment;
}

test('Uses desktop cursors for app controls and a hand for external links', async () => {
    await expect(mainPage.getByTestId('btnProjects')).toHaveCSS(
        'cursor',
        'default',
    );

    await mainPage.getByTestId('btnSettings').click();
    await expect(mainPage.getByTestId('tabAppearance')).toHaveCSS(
        'cursor',
        'default',
    );
    await mainPage.getByTestId('tabAppearance').click();
    await expect(mainPage.getByTestId('themeLight')).toHaveCSS(
        'cursor',
        'default',
    );

    await mainPage.getByTestId('btnHelp').click();
    await expect(
        mainPage.getByRole('button', {
            name: 'Third-party copyright notices',
        }),
    ).toHaveCSS('cursor', 'pointer');
});
