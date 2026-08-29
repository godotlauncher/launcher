import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Page,
    test,
} from '@playwright/test';
import {
    applyTheme,
    createFixtureHome,
    ensureMainNavigationReady,
    prepareAppWithStubbedData,
    stubCreateProjectPublicationTargets,
    stubGlobalGitIdentity,
} from './documentationScreenshots/runtime';
import { THEMES } from './documentationScreenshots/themes';
import { getMainWindow } from './splashscreen/getMainWindow';

let electronApp: ElectronApplication;
let mainPage: Page;
let fixtureHome: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    electronApp = await _electron.launch({
        args: [
            '.',
            `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`,
        ],
        env: createIsolatedLaunchEnvironment(fixtureHome),
    });
    mainPage = await getMainWindow(electronApp);
    await ensureMainNavigationReady(mainPage, electronApp);
});

test.beforeEach(async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    await applyTheme(mainPage, THEMES[0]);
    await resizeMainWindow();
    await stubCreateProjectPublicationTargets(electronApp, {
        success: true,
        targets: [
            {
                providerId: 'github',
                connectionId: '4d542f86-89c7-4a7c-89cf-835ce17022af',
                accessTargetId: 'de178a20-320a-471f-8c8c-94061ac13de1',
                ownerLogin: 'mariodebono',
                ownerType: 'user',
                accountLogin: 'mariodebono',
            },
        ],
    });
    await stubGlobalGitIdentity(electronApp, { name: '', email: '' });
});

/** Resizes the real Electron window to the selected design viewport. */
async function resizeMainWindow(): Promise<void> {
    await electronApp.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows().find(
            (candidate) => !candidate.isDestroyed(),
        );
        window?.setSize(1024, 600);
    });
    await mainPage.setViewportSize({ width: 1024, height: 600 });
}

test.afterAll(async () => {
    if (electronApp) await electronApp.close();
    await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('reveals connected private repository fields and preserves a manual name', async () => {
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectCreate').click();
    await mainPage
        .getByTestId('inputProjectName')
        .fill('My Next Awesome Game');

    const publish = mainPage.getByRole('checkbox', {
        name: 'Publish to GitHub',
    });
    await publish.check();
    const ownerSelect = mainPage.getByTestId(
        'selectCreateProjectGitHubOwner',
    );
    await expect(ownerSelect).toContainText('mariodebono');
    await ownerSelect.click();
    const selectedOwnerOption = mainPage.getByRole('option', {
        name: 'mariodebono',
    });
    await expect(selectedOwnerOption).toBeVisible();
    expect(
        await selectedOwnerOption.evaluate(
            (element) => getComputedStyle(element).fontSize,
        ),
    ).toBe(
        await ownerSelect.evaluate(
            (element) => getComputedStyle(element).fontSize,
        ),
    );
    await mainPage.keyboard.press('Escape');
    const repositoryName = mainPage.locator(
        '#createProjectGitHubRepositoryName',
    );
    await expect(repositoryName).toHaveValue('My-Next-Awesome-Game');
    await expect(
        mainPage.getByText('Private GitHub repository', { exact: true }),
    ).toBeVisible();
    await expect(mainPage.locator('.drawer-panel')).toHaveCSS('width', '680px');
    const initialiseGitCheckbox = mainPage.getByRole('checkbox', {
        name: 'Initialize Git Repository',
    });
    await expect(initialiseGitCheckbox).toHaveClass(/checkbox-sm/u);
    await expect(initialiseGitCheckbox).toHaveClass(/rounded-sm/u);
    const drawerBody = mainPage.locator(
        '.drawer-panel form > div.overflow-y-auto',
    );
    await expect
        .poll(() =>
            drawerBody.evaluate(
                (element) => element.scrollHeight <= element.clientHeight + 1,
            ),
        )
        .toBe(true);
    await expect(
        mainPage.getByTestId('btnCreateProject'),
    ).toContainText('Create and publish to GitHub');
    await expect(mainPage.getByText('Change connection')).toHaveCount(0);

    if (process.env.GODOT_LAUNCHER_DESIGN_QA === '1') {
        const output = path.resolve(
            process.cwd(),
            '.internal-docs',
            'create-project-github-publishing-implementation.png',
        );
        await fs.mkdir(path.dirname(output), { recursive: true });
        await mainPage.screenshot({ path: output });

        await mainPage
            .getByTestId('checkboxOverwriteProjectPath')
            .check();
        await expect(
            mainPage.getByTestId('btnSelectProjectFolder'),
        ).toBeVisible();
        const pathInputShell = mainPage
            .getByTestId('inputProjectPath')
            .locator('..');
        const browseButton = mainPage.getByTestId(
            'btnSelectProjectFolder',
        );
        expect(
            await browseButton.evaluate(
                (element) => getComputedStyle(element).borderColor,
            ),
        ).toBe(
            await pathInputShell.evaluate(
                (element) => getComputedStyle(element).borderColor,
            ),
        );
        await mainPage.screenshot({
            path: path.resolve(
                process.cwd(),
                '.internal-docs',
                'create-project-path-field-compact.png',
            ),
        });
        await browseButton.hover();
        await mainPage.screenshot({
            path: path.resolve(
                process.cwd(),
                '.internal-docs',
                'create-project-path-field-hover.png',
            ),
        });
        await mainPage
            .getByTestId('checkboxOverwriteProjectPath')
            .uncheck();
    }

    await repositoryName.fill('hand-picked-name');
    await mainPage.getByTestId('inputProjectName').fill('Renamed Project');
    await expect(repositoryName).toHaveValue('hand-picked-name');
    await mainPage.getByTestId('btnCreateProject').click();
    await expect(
        mainPage.getByRole('dialog', { name: 'Git identity required' }),
    ).toBeVisible();
    await expect(mainPage.getByText('Skip initial commit')).toHaveCount(0);
    await expect(
        mainPage.getByRole('button', { name: 'Add Git identity' }),
    ).toBeVisible();
});

/**
 * Creates an isolated Electron environment for one temporary Launcher home.
 *
 * @param homeDir - Temporary home directory used by the Electron app.
 * @returns Environment variables for the isolated app process.
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
    const environment: Record<string, string> = {
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
    delete environment.ELECTRON_RUN_AS_NODE;
    return environment;
}
