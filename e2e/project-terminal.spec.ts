import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron, expect, test } from '@playwright/test';
import {
    applyTheme,
    createFixtureHome,
    prepareAppWithStubbedData,
    setAppLanguage,
} from './support/e2e-fixture-runtime';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { getMainWindow } from './splashscreen/getMainWindow';

test('remembers a terminal choice and opens a stored project through the real main bridge', async ({}, testInfo) => {
    test.setTimeout(60000);
    const fixtureHome = await createFixtureHome();
    const targetId = process.platform === 'win32' ? 'command-prompt' : process.platform === 'darwin' ? 'macos-terminal' : 'gnome-terminal';
    const projectPath = path.join(fixtureHome, 'project é ; $HOME ` quote\'');
    await fs.mkdir(projectPath);
    const project = { ...SAMPLE_PROJECTS[0], path: projectPath };
    await fs.writeFile(path.join(fixtureHome, '.gd-launcher', 'projects.json'), JSON.stringify([project]));
    const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await _electron.launch({ args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`], env: { ...env, GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: fixtureHome } });
    try {
        const page = await getMainWindow(app);
        await setAppLanguage(page, 'English');
        await app.evaluate(async (_electron, { moduleUrl, targetId }) => {
            const target = globalThis as typeof globalThis & { __terminalLaunches?: string[]; __terminalAvailable?: boolean; __name?: (fn: unknown) => unknown };
            target.__name = (fn) => fn;
            target.__terminalLaunches = [];
            target.__terminalAvailable = true;
            const { TerminalAdapterService } = process.getBuiltinModule('module').createRequire(moduleUrl)(moduleUrl);
            TerminalAdapterService.prototype.discover = async () => target.__terminalAvailable ? [{ id: targetId, displayName: 'Fixture terminal', executablePath: '/fixture/terminal' }] : [];
            TerminalAdapterService.prototype.isAvailable = async () => true;
            TerminalAdapterService.prototype.launch = async (_candidate: unknown, directory: string) => { target.__terminalLaunches?.push(directory); return { success: true }; };
        }, { moduleUrl: path.resolve('dist-electron/tool-integration/integrations/terminal/terminal-adapter.service.js'), targetId });
        await prepareAppWithStubbedData(page, app, { projects: [project], toolIntegrations: [{ id: 'terminal', displayName: 'Terminal', status: 'available', executablePath: '/System/Applications/Utilities/Terminal.app', version: null }] });
        await page.getByTestId('btnSettings').click();
        await page.getByTestId('tabTools').click();
        await page.getByRole('button', { name: 'Edit Terminal' }).click();
        const drawer = page.getByRole('dialog', { name: 'Terminal settings' });
        await expect(drawer).toBeVisible();
        await drawer.getByRole('button', { name: 'Rescan', exact: true }).click();
        await drawer.getByRole('radio', { name: /Fixture terminal/ }).click();
        await expect(drawer.getByRole('radio', { name: /Fixture terminal/ })).toBeChecked();
        const stored = JSON.parse(await fs.readFile(path.join(fixtureHome, '.gd-launcher', 'tool-integrations.json'), 'utf8'));
        expect(stored.tools.terminal.configuration.preferences[process.platform]).toBe(targetId);
        await page.screenshot({ path: testInfo.outputPath('terminal-settings.png') });
        await page.keyboard.press('Escape');
        await page.getByTestId('btnProjects').click();
        await page.getByTestId('btnProjectTerminal').first().hover();
        await expect(page.getByRole('tooltip')).toHaveText('Open Terminal Here');
        await page.screenshot({ path: testInfo.outputPath('project-terminal-quick-action.png') });
        await page.getByRole('button', { name: 'Open Terminal Here', exact: true }).click();
        await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { __terminalLaunches?: string[] }).__terminalLaunches)).toEqual([projectPath]);
        await page.getByTestId('tabProjectList').click();
        await page.getByRole('button', { name: 'Open Terminal Here', exact: true }).click();
        await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { __terminalLaunches?: string[] }).__terminalLaunches)).toEqual([projectPath, projectPath]);
        await page.getByTestId('btnSettings').click();
        await page.getByTestId('tabTools').click();
        await page.getByRole('button', { name: 'Edit Terminal' }).click();
        await expect(drawer.getByRole('radio', { name: /Fixture terminal/ })).toBeChecked();
        await drawer.getByLabel('Enable terminal for project folders').click();
        await expect(drawer.getByLabel('Enable terminal for project folders')).not.toBeChecked();
        await expect(drawer.getByText('Disabled', { exact: true })).toBeVisible();
        await expect(drawer.getByText('No supported terminal is currently available.')).toHaveCount(0);
        await expect(drawer.getByRole('alert')).toHaveCount(0);
        await drawer.getByRole('button', { name: 'Rescan', exact: true }).click();
        await expect(drawer.getByText('Disabled', { exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        await page.getByTestId('btnProjects').click();
        await page.getByRole('button', { name: 'Open Terminal Here', exact: true }).click();
        await expect(page.getByText('Terminal is disabled. Enable it in Settings > Tools > Terminal.')).toBeVisible();
        await page.getByRole('button', { name: 'Ok', exact: true }).click();
        await page.getByTestId('btnSettings').click();
        await page.getByTestId('tabTools').click();
        await page.getByRole('button', { name: 'Edit Terminal' }).click();
        await drawer.getByLabel('Enable terminal for project folders').click();
        await expect(drawer.getByLabel('Enable terminal for project folders')).toBeChecked();
        await app.evaluate(() => { (globalThis as typeof globalThis & { __terminalAvailable?: boolean }).__terminalAvailable = false; });
        await drawer.getByRole('button', { name: 'Rescan', exact: true }).click();
        await expect(drawer.getByText(`${targetId} is no longer available. Rescan or choose another terminal.`)).toBeVisible();
        await expect(drawer.getByRole('radio', { name: 'Automatic', exact: true })).not.toBeChecked();
        await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { __terminalLaunches?: string[] }).__terminalLaunches)).toEqual([projectPath, projectPath]);
    } finally {
        await app.close();
        await fs.rm(fixtureHome, { recursive: true, force: true });
    }
});

test('recovers unsupported terminal settings through the warning shortcut', async ({}, testInfo) => {
    const fixtureHome = await createFixtureHome();
    const configDir = path.join(fixtureHome, '.gd-launcher');
    await fs.writeFile(
        path.join(configDir, 'tool-integrations.json'),
        JSON.stringify({
            schemaVersion: 2,
            tools: {
                terminal: {
                    settings: {
                        enabled: true,
                        executablePathOverride: null,
                        executableArgsOverride: null,
                    },
                    configuration: { version: 2, preferences: { linux: 'custom' }, customTargets: ['legacy'] },
                    installations: {},
                },
            },
        }),
    );
    const env = Object.fromEntries(
        Object.entries(process.env).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
    );
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`],
        env: {
            ...env,
            GODOT_LAUNCHER_E2E_FIXTURES: '1',
            GODOT_LAUNCHER_E2E_HOME_DIR: fixtureHome,
        },
    });
    try {
        const page = await getMainWindow(app);
        await setAppLanguage(page, 'English');
        await prepareAppWithStubbedData(page, app, {
            projects: [SAMPLE_PROJECTS[0]],
            toolIntegrations: [
                {
                    id: 'terminal',
                    displayName: 'Terminal',
                    status: 'available',
                    executablePath: '/fixture/terminal',
                    version: null,
                },
            ],
        });
        await applyTheme(page, {
            colorScheme: 'light',
            toggleTestId: 'themeLight',
        });
        await page.getByTestId('btnProjectTerminal').first().click();
        const warning = page.getByRole('dialog', { name: 'Warning' });
        await expect(warning).toContainText(
            'The saved terminal settings are incompatible with this version of Godot Launcher.',
        );
        await expect(warning.locator('header svg.lucide-triangle-alert')).toBeVisible();
        await captureSettledScreenshot(
            page,
            testInfo.outputPath('terminal-invalid-configuration-warning-light.png'),
        );
        await warning.getByRole('button', { name: 'Open terminal settings' }).click();
        const drawer = page.getByRole('dialog', { name: 'Terminal settings' });
        const notice = drawer.getByRole('alert');
        await expect(notice).toContainText(
            'The saved terminal settings use an unsupported format. Reset them to use automatic terminal selection.',
        );
        await expect(notice.locator('svg.lucide-triangle-alert')).toBeVisible();
        await expect(drawer.getByRole('button', { name: 'Rescan' })).toBeDisabled();
        await expect(drawer.getByRole('radio', { name: 'Automatic' })).toBeDisabled();
        await expect.poll(async () => {
            const box = await drawer.boundingBox();
            return box ? Math.round(box.x) : null;
        }).toBe(464);
        await captureSettledScreenshot(
            page,
            testInfo.outputPath('terminal-invalid-configuration-drawer-light.png'),
        );
        await page.keyboard.press('Escape');

        await applyTheme(page, {
            colorScheme: 'dark',
            toggleTestId: 'themeDark',
        });
        await page.getByTestId('btnProjectTerminal').first().click();
        await captureSettledScreenshot(
            page,
            testInfo.outputPath('terminal-invalid-configuration-warning-dark.png'),
        );
        await warning.getByRole('button', { name: 'Open terminal settings' }).click();
        await expect.poll(async () => {
            const box = await drawer.boundingBox();
            return box ? Math.round(box.x) : null;
        }).toBe(464);
        await captureSettledScreenshot(
            page,
            testInfo.outputPath('terminal-invalid-configuration-drawer-dark.png'),
        );
        await page.keyboard.press('Escape');
        await applyTheme(page, { colorScheme: 'dark', toggleTestId: 'themeAuto' });
        await page.getByTestId('btnProjectTerminal').first().click();
        await captureSettledScreenshot(page, testInfo.outputPath('terminal-invalid-configuration-warning-auto-dark.png'));
        await warning.getByRole('button', { name: 'Open terminal settings' }).click();
        await expect(drawer).toBeVisible();
        await captureSettledScreenshot(page, testInfo.outputPath('terminal-invalid-configuration-drawer-auto-dark.png'));
        const configPath = path.join(configDir, 'tool-integrations.json');
        const beforeReset = JSON.parse(await fs.readFile(configPath, 'utf8'));
        await drawer.getByRole('button', { name: 'Reset terminal settings', exact: true }).click();
        const resetDialog = page.getByRole('dialog', { name: 'Reset terminal settings?' });
        await expect(resetDialog).toContainText('all operating systems');
        await resetDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
        expect(JSON.parse(await fs.readFile(configPath, 'utf8')).tools.terminal.configuration).toEqual(beforeReset.tools.terminal.configuration);
        await drawer.getByRole('button', { name: 'Reset terminal settings', exact: true }).click();
        await resetDialog.getByRole('button', { name: 'Reset settings', exact: true }).click();
        await expect(drawer.getByRole('radio', { name: 'Automatic', exact: true })).toBeEnabled();
        await expect(drawer.getByRole('radio', { name: 'Automatic', exact: true })).toBeChecked();
        await expect(drawer.getByRole('alert')).toHaveCount(0);
        const recovered = JSON.parse(await fs.readFile(configPath, 'utf8'));
        expect(recovered.tools.terminal.configuration).toEqual({ version: 1, preferences: {} });
        expect(recovered.tools.terminal.settings).toEqual(beforeReset.tools.terminal.settings);
        await page.keyboard.press('Escape');
        await expect(drawer).not.toBeVisible();
        await page.getByRole('button', { name: 'Edit Terminal' }).click();
        await expect(drawer.getByRole('radio', { name: 'Automatic', exact: true })).toBeChecked();
        await expect(drawer.getByRole('button', { name: 'Reset terminal settings', exact: true })).toHaveCount(0);

    } finally {
        await app.close();
        await fs.rm(fixtureHome, { recursive: true, force: true });
    }
});

/**
 * Waits for the transition frame before capturing a stable Electron frame.
 *
 * @param page - Electron renderer page.
 * @param screenshotPath - Destination for the stable screenshot.
 * @returns A promise that resolves after the image is written.
 */
async function captureSettledScreenshot(
    page: Awaited<ReturnType<typeof getMainWindow>>,
    screenshotPath: string,
): Promise<void> {
    await page.waitForTimeout(400);
    await page.screenshot({ path: screenshotPath, animations: 'disabled' });
}
