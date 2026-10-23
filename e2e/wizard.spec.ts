import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Locator,
    type Page,
    test,
} from './support/electron.fixture';
import { getMainWindow } from './splashscreen/getMainWindow';
import { createFixtureHome } from './support/e2e-fixture-runtime';
import { mountWizardFixture } from './support/wizard-fixture.util';

let home: string;
let app: ElectronApplication;
let page: Page;

test.describe.configure({ mode: 'serial' });
test.setTimeout(60_000);

test.beforeAll(async () => {
    home = await createFixtureHome();
    const prefsPath = path.join(home, '.gd-launcher', 'prefs.json');
    const prefs = JSON.parse(await fs.readFile(prefsPath, 'utf8'));
    prefs.language = 'en';
    prefs.export_template_migration_offered = true;
    await fs.writeFile(prefsPath, JSON.stringify(prefs));
    await fs.writeFile(path.join(home, '.gd-launcher', 'projects.json'), '[]');
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        APPDATA: path.join(home, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
        XDG_CONFIG_HOME: path.join(home, '.config'),
        XDG_DATA_HOME: path.join(home, '.local', 'share'),
        GODOT_LAUNCHER_E2E_FIXTURES: '1',
        GODOT_LAUNCHER_E2E_HOME_DIR: home,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(home, 'electron-user-data')}`],
        env: env as Record<string, string>,
    });
    page = await getMainWindow(app);
    await expect(page.getByTestId('btnHelp')).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => {
        const main = BrowserWindow.getAllWindows().find((window) =>
            window.webContents.getURL().startsWith('http://localhost:5123'),
        );
        if (!main) throw new Error('Main window not found');
        main.setSize(1024, 600);
    });
});

test.afterAll(async () => {
    try {
        await app?.close();
    } finally {
        if (home) await fs.rm(home, { recursive: true, force: true });
    }
});

test.beforeEach(async () => {
    await page.reload();
    await mountWizardFixture(page, 'generic');
    await expect(
        page.getByRole('button', { name: 'Open sample wizard' }),
    ).toBeVisible();
});

/** Opens the test fixture in the real modal. */
async function openWizard(): Promise<Locator> {
    await page.getByRole('button', { name: 'Open sample wizard' }).click();
    const dialog = page.getByRole('dialog', {
        name: 'Wizard test fixture',
        exact: true,
    });
    await expect(dialog).toBeVisible();
    return dialog;
}

/** Checks visible bounds in Electron's actual content area.
 * @param element - Header or footer control which must stay visible.
 */
async function withinWindow(element: Locator): Promise<void> {
    const box = await element.boundingBox();
    expect(box).not.toBeNull();
    const height = await page.evaluate(() => window.innerHeight);
    expect(box?.y).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(height);
}

test('controlled steps retain form values, focus headings and respect validation', async () => {
    const dialog = await openWizard();
    await expect(
        dialog
            .getByRole('list', { name: 'Sample setup steps' })
            .getByRole('listitem'),
    ).toHaveCount(6);
    await dialog.getByLabel('Workspace name').fill('');
    await expect(
        dialog.getByRole('button', { name: 'Next', exact: true }),
    ).toBeDisabled();
    await dialog.getByLabel('Workspace name').fill('My sample');
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(
        dialog.getByRole('heading', { name: 'Choose a colour' }),
    ).toBeFocused();
    await dialog
        .getByRole('button', { name: 'Workspace colour: Blue' })
        .click();
    await page.getByRole('option', { name: 'Green', exact: true }).click();
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await dialog
        .getByRole('checkbox', { name: 'Item 12', exact: true })
        .check();
    await dialog.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(
        dialog.getByRole('heading', { name: 'Choose a colour' }),
    ).toBeFocused();
    await expect(
        dialog.getByRole('button', { name: 'Workspace colour: Green' }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(dialog.getByLabel('Workspace name')).toHaveValue('My sample');
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(
        dialog.getByRole('checkbox', { name: 'Item 12', exact: true }),
    ).toBeChecked();
    await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(
        dialog.getByRole('heading', { name: 'Review the sample settings' }),
    ).toBeFocused();
    await expect(dialog.getByText('My sample', { exact: true })).toBeVisible();
    await expect(
        dialog.getByText('Item 1, Item 12', { exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Open sample wizard' }),
    ).toBeFocused();
});

test('the existing modal owns Escape and keeps focus inside the wizard', async () => {
    const dialog = await openWizard();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Open sample wizard' }),
    ).toBeFocused();
});

test('busy work blocks navigation until the host completes it', async () => {
    const dialog = await openWizard();
    for (let index = 0; index < 3; index++)
        await dialog.getByRole('button', { name: 'Next', exact: true }).click();
    await dialog
        .getByRole('button', { name: 'Apply sample settings', exact: true })
        .click();
    await expect(dialog.getByRole('status')).toHaveText(
        'Applying sample settings...',
    );
    for (const name of ['Back', 'Close', 'Working...'])
        await expect(
            dialog.getByRole('button', { name, exact: true }),
        ).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await dialog
        .getByRole('button', { name: 'Complete sample work', exact: true })
        .click();
    await expect(
        dialog.getByRole('heading', { name: 'Sample complete' }),
    ).toBeFocused();
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
        page.getByRole('button', { name: 'Open sample wizard' }),
    ).toBeFocused();
});

for (const theme of ['light', 'dark']) {
    test(`600px window keeps the footer visible with long labels and twelve rows (${theme})`, async () => {
        await page.evaluate(
            (value) => localStorage.setItem('theme', value),
            theme,
        );
        await page.reload();
        await mountWizardFixture(page, 'generic');
        await page
            .getByRole('checkbox', { name: 'Use long step labels' })
            .check();
        const dialog = await openWizard();
        await dialog.getByRole('button', { name: 'Next', exact: true }).click();
        await dialog.getByRole('button', { name: 'Next', exact: true }).click();
        const panel = await dialog.locator(':scope > section').boundingBox();
        expect(panel).not.toBeNull();
        const viewport = await page.evaluate(() => ({
            width: window.innerWidth,
            height: window.innerHeight,
        }));
        expect(panel?.x).toBeCloseTo(10, 0);
        expect(panel?.y).toBeCloseTo(10, 0);
        expect(
            viewport.width - ((panel?.x ?? 0) + (panel?.width ?? 0)),
        ).toBeCloseTo(10, 0);
        expect(
            viewport.height - ((panel?.y ?? 0) + (panel?.height ?? 0)),
        ).toBeCloseTo(10, 0);
        await withinWindow(
            dialog.getByRole('button', { name: 'Next', exact: true }),
        );
        await withinWindow(
            dialog.getByRole('button', { name: 'Back', exact: true }),
        );
        await dialog
            .getByRole('checkbox', { name: 'Item 12', exact: true })
            .check();
        await withinWindow(
            dialog.getByRole('button', { name: 'Next', exact: true }),
        );
        await withinWindow(
            dialog.getByRole('heading', { name: 'Choose sample items' }),
        );
        await page.screenshot({
            path: test.info().outputPath(`wizard-${theme}-600.png`),
        });
        await dialog.getByRole('button', { name: 'Back', exact: true }).click();
        await dialog.getByRole('button', { name: 'Next', exact: true }).click();
        await expect(
            dialog.getByRole('checkbox', { name: 'Item 1', exact: true }),
        ).toBeInViewport();
        await page.keyboard.press('Escape');
    });
}
