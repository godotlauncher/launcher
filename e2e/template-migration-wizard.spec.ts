import fs from 'node:fs/promises';
import path from 'node:path';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Locator,
    type Page,
    test,
} from '@playwright/test';
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
    await mountWizardFixture(page, 'migration');
});

/** Opens a fresh feature wizard through the real Electron application. */
async function openWizard(): Promise<Locator> {
    await page
        .getByRole('button', { name: 'Open migration fixture', exact: true })
        .click();
    const wizard = page.getByTestId('templateMigrationWizard');
    await expect(wizard).toBeVisible();
    return wizard;
}
/** Moves through the two explanations to the complete project list.
 * @param wizard - Active native modal.
 */
async function chooseStep(wizard: Locator): Promise<void> {
    await wizard
        .getByRole('button', { name: 'See options', exact: true })
        .click();
    await wizard
        .getByRole('button', { name: 'Choose for projects', exact: true })
        .click();
}
/** Chooses one exact option through the shared selector.
 * @param wizard - Active native modal.
 * @param name - Choice's accessible project or version label.
 * @param option - Exact visible option.
 */
async function select(
    wizard: Locator,
    name: string,
    option: string,
): Promise<void> {
    await wizard
        .getByRole('button', { name: `${name}:`, exact: false })
        .click();
    await wizard
        .getByRole('listbox', { name: `${name}:`, exact: false })
        .getByRole('option', { name: option, exact: true })
        .click();
}
/** Verifies that a fixed action remains inside Electron's real content area.
 * @param action - Visible action or heading.
 */
async function withinWindow(action: Locator): Promise<void> {
    const bounds = await action.boundingBox();
    const height = await page.evaluate(() => window.innerHeight);
    expect(bounds).not.toBeNull();
    expect(bounds?.y).toBeGreaterThanOrEqual(0);
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
        height,
    );
}

/** Reads a visible development counter from its labelled definition.
 * @param label - Sample boundary activity name.
 */
function activity(label: string): Locator {
    return page.getByText(label, { exact: true }).locator('..').locator('dd');
}

test('leaving every version for later offers only Finish later and never starts a move', async () => {
    const wizard = await openWizard();
    await chooseStep(wizard);
    for (const project of [
        'Night Garden',
        'Platformer',
        'Prototype .NET',
        'Puzzle Game',
        'Space Explorer',
        'Racing Game',
        'Card Game',
        'Mobile Demo',
        'Web Demo',
        'Tools Project',
    ]) {
        await select(wizard, `Choice for ${project}`, 'Decide later');
    }
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    await expect(
        wizard.getByRole('heading', {
            name: 'Check your choices',
            exact: true,
        }),
    ).toBeFocused();
    await expect(
        wizard.getByRole('list', {
            name: 'Choices by template version',
            exact: true,
        }),
    ).toContainText('Decide later(14)');
    await expect(
        wizard.getByRole('button', { name: 'Move templates', exact: true }),
    ).toHaveCount(0);
    await expect(wizard.getByRole('checkbox')).toHaveCount(0);
    await expect(wizard.getByRole('progressbar')).toHaveCount(0);
    await expect(activity('Active reviews')).toHaveText('1');
    await withinWindow(
        wizard.getByRole('button', { name: 'Finish later', exact: true }),
    );
    await wizard
        .getByRole('button', { name: 'Finish later', exact: true })
        .click();
    await expect(wizard).toBeHidden();
    await expect(
        page.getByRole('button', {
            name: 'Open migration fixture',
            exact: true,
        }),
    ).toBeFocused();
    await expect(activity('Reviews requested')).toHaveText('1');
    await expect(activity('Reviews released')).toHaveText('1');
    await expect(activity('Active reviews')).toHaveText('0');
    await expect(activity('Moves started')).toHaveText('0');
});

test('unavailable projects can be left for later without requesting an empty review', async () => {
    await page
        .getByRole('checkbox', {
            name: 'Only unavailable projects',
            exact: true,
        })
        .check();
    const wizard = await openWizard();
    await chooseStep(wizard);
    for (const project of ['Archive Project', 'Custom Build']) {
        await expect(
            wizard.getByRole('button', {
                name: `Choice for ${project}: Decide later`,
                exact: true,
            }),
        ).toBeDisabled();
    }
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    await expect(
        wizard.getByRole('heading', {
            name: 'Check your choices',
            exact: true,
        }),
    ).toBeFocused();
    await expect(
        wizard.getByRole('list', {
            name: 'Choices by template version',
            exact: true,
        }),
    ).toContainText('Decide later(2)');
    await expect(
        wizard.getByText('Archive Project', { exact: true }),
    ).toBeVisible();
    await expect(
        wizard.getByText('Custom Build', { exact: true }),
    ).toBeVisible();
    await expect(wizard.getByRole('table')).toHaveCount(0);
    await expect(
        wizard.getByRole('button', { name: 'Move templates', exact: true }),
    ).toHaveCount(0);
    await expect(wizard.getByRole('checkbox')).toHaveCount(0);
    await wizard
        .getByRole('button', { name: 'Finish later', exact: true })
        .click();
    await expect(wizard).toBeHidden();
    await expect(activity('Reviews requested')).toHaveText('0');
    await expect(activity('Moves started')).toHaveText('0');
});

test('changed discovery releases the review, reconciles choices and requires a fresh acknowledgement', async () => {
    const wizard = await openWizard();
    await chooseStep(wizard);
    const toggle = wizard.getByRole('switch', {
        name: 'Choose for each version in Night Garden',
        exact: true,
    });
    await toggle.check();
    await select(
        wizard,
        'Choice for Night Garden, 4.3.stable',
        'Share templates',
    );
    await select(
        wizard,
        'Choice for Night Garden, 4.4.stable .NET',
        'Decide later',
    );
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    const confirmation = wizard.getByRole('checkbox', {
        name: /I understand that Share templates/,
    });
    await confirmation.check();
    await page.keyboard.press('Control+Shift+D');
    await expect(
        wizard.getByRole('heading', {
            name: 'Choose for all projects',
            exact: true,
        }),
    ).toBeFocused();
    await expect(wizard.getByRole('alert')).toContainText(
        'Files changed since review',
    );
    await expect(toggle).toBeChecked();
    await expect(
        wizard.getByRole('button', {
            name: 'Choice for Night Garden, 4.3.stable: Share templates',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        wizard.getByRole('button', {
            name: 'Choice for Night Garden, 4.4.stable .NET: Decide later',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        wizard.getByRole('button', {
            name: 'Choice for Night Garden, 4.5.stable: Keep current templates',
            exact: true,
        }),
    ).toBeVisible();
    await expect(wizard.getByText('Platformer', { exact: true })).toHaveCount(
        0,
    );
    await expect(
        wizard.getByRole('button', {
            name: 'Choice for New Sample Project: Keep current templates',
            exact: true,
        }),
    ).toBeAttached();
    await expect(activity('Reviews released')).toHaveText('1');
    await expect(activity('Active reviews')).toHaveText('0');
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    await expect(confirmation).not.toBeChecked();
    await expect(
        wizard.getByRole('button', { name: 'Move templates', exact: true }),
    ).toBeDisabled();
    await expect(
        wizard.getByRole('list', {
            name: 'Reviewed versions for Night Garden',
            exact: true,
        }),
    ).toHaveCount(4);
    await expect(wizard.getByText('Platformer', { exact: true })).toHaveCount(
        0,
    );
    await expect(
        wizard.getByText('New Sample Project', { exact: true }),
    ).toBeAttached();
    await expect(activity('Reviews requested')).toHaveText('2');
    await expect(activity('Active reviews')).toHaveText('1');
    await expect(activity('Moves started')).toHaveText('0');
});

test('checking covers the entire modal and blocks editing and Escape until Review is ready', async () => {
    await page
        .getByRole('checkbox', { name: 'Pause review responses', exact: true })
        .check();
    const wizard = await openWizard();
    await chooseStep(wizard);
    await select(wizard, 'Choice for Night Garden', 'Use shared templates');
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    await expect(activity('Waiting reviews')).toHaveText('1');
    const cover = wizard.getByRole('status');
    await expect(cover).toContainText('Checking template files...');
    await expect(cover).toContainText(/Night Garden \(1 \/ \d+\)/);
    await expect(cover.getByRole('progressbar')).toHaveAttribute('value', '25');
    await page.screenshot({ path: test.info().outputPath('checking-modal.png') });
    const bounds = await cover.boundingBox();
    const panel = await wizard.locator('section').first().boundingBox();
    if (!bounds || !panel) throw new Error('Expected visible modal and cover');
    expect(Math.abs(bounds.height - panel.height)).toBeLessThan(2);
    expect(Math.abs(bounds.width - panel.width)).toBeLessThan(2);
    expect(Math.abs(bounds.y - panel.y)).toBeLessThan(2);
    const choice = wizard.getByRole('button', {
        name: 'Choice for Night Garden: Use shared templates',
        exact: true,
    });
    expect(
        await choice.evaluate((element) => {
            (element as HTMLElement).focus();
            return document.activeElement === element;
        }),
    ).toBe(false);
    await expect(choice.click({ trial: true, timeout: 750 })).rejects.toThrow();
    await page.keyboard.press('Tab');
    expect(
        await page.evaluate(
            () => document.activeElement?.closest('[inert]') !== null,
        ),
    ).toBe(false);
    await page.keyboard.press('Escape');
    await expect(wizard).toBeVisible();
    await expect(activity('Waiting reviews')).toHaveText('1');
    await page.keyboard.press('Control+Shift+Enter');
    await expect(cover).toHaveCount(0);
    await expect(
        wizard.getByRole('heading', {
            name: 'Check your choices',
            exact: true,
        }),
    ).toBeFocused();
    await expect(wizard).toContainText('Use shared templates');
    await expect(activity('Moves started')).toHaveText('0');
    await page.keyboard.press('Escape');
    await expect(activity('Reviews released')).toHaveText('1');
    await expect(activity('Active reviews')).toHaveText('0');
});

test('discovery changing during a paused review prevents the old batch from reaching Review', async () => {
    await page
        .getByRole('checkbox', { name: 'Pause review responses', exact: true })
        .check();
    const wizard = await openWizard();
    await chooseStep(wizard);
    await select(wizard, 'Choice for Night Garden', 'Share templates');
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    await expect(activity('Waiting reviews')).toHaveText('1');
    await page.keyboard.press('Control+Shift+D');
    await expect(
        wizard.getByRole('button', { name: 'Review choices', exact: true }),
    ).toBeEnabled();
    await expect(
        wizard.getByRole('button', {
            name: 'Choice for Night Garden: Share templates',
            exact: true,
        }),
    ).toBeVisible();
    await expect(wizard.getByText('4.5.stable', { exact: true })).toBeVisible();
    await page.keyboard.press('Control+Shift+Enter');
    await expect(activity('Reviews released')).toHaveText('1');
    await expect(
        wizard.getByRole('heading', {
            name: 'Choose for all projects',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        wizard.getByRole('button', { name: 'Move templates', exact: true }),
    ).toHaveCount(0);
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    await expect(activity('Waiting reviews')).toHaveText('1');
    await page.keyboard.press('Control+Shift+Enter');
    const versions = wizard.getByRole('list', {
        name: 'Reviewed versions for Night Garden',
        exact: true,
    });
    await expect(versions.getByRole('listitem')).toHaveCount(4);
    const nightGarden = wizard.getByRole('row').filter({
        has: page.getByRole('list', {
            name: 'Reviewed versions for Night Garden',
            exact: true,
        }),
    });
    await expect(
        nightGarden.getByText('Share templates', { exact: true }),
    ).toHaveCount(1);
    await expect(nightGarden).toContainText('Applies to all 4 versions');
    await expect(activity('Moves started')).toHaveText('0');
});

test('recovery blocks a new review but keeps Finish later available', async () => {
    await page
        .getByRole('checkbox', {
            name: 'Start with recovery needed',
            exact: true,
        })
        .check();
    const wizard = await openWizard();
    await chooseStep(wizard);
    await expect(wizard.getByRole('alert')).toContainText(
        'An interrupted operation needs recovery',
    );
    await expect(
        wizard.getByRole('button', { name: 'Review choices', exact: true }),
    ).toBeDisabled();
    await expect(
        wizard.getByRole('button', { name: 'Finish later', exact: true }),
    ).toBeEnabled();
    await withinWindow(
        wizard.getByRole('button', { name: 'Finish later', exact: true }),
    );
    await wizard
        .getByRole('button', { name: 'Finish later', exact: true })
        .click();
    await expect(wizard).toBeHidden();
    await expect(activity('Reviews requested')).toHaveText('0');
    await expect(activity('Moves started')).toHaveText('0');
});

test('recovery arriving after acknowledgement releases the review and requires a fresh one', async () => {
    const wizard = await openWizard();
    await chooseStep(wizard);
    await select(wizard, 'Choice for Night Garden', 'Share templates');
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    const confirmation = wizard.getByRole('checkbox', {
        name: /I understand that Share templates/,
    });
    await confirmation.check();
    await expect(
        wizard.getByRole('button', { name: 'Move templates', exact: true }),
    ).toBeEnabled();
    await page.keyboard.press('Control+Shift+R');
    await expect(
        wizard.getByRole('heading', {
            name: 'Choose for all projects',
            exact: true,
        }),
    ).toBeFocused();
    await expect(
        wizard
            .getByRole('alert')
            .filter({ hasText: 'An interrupted operation needs recovery' }),
    ).toBeVisible();
    await expect(
        wizard.getByRole('button', { name: 'Review choices', exact: true }),
    ).toBeDisabled();
    await expect(
        wizard.getByRole('button', { name: 'Move templates', exact: true }),
    ).toHaveCount(0);
    await expect(activity('Reviews released')).toHaveText('1');
    await page.keyboard.press('Control+Shift+R');
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    await expect(confirmation).not.toBeChecked();
    await expect(
        wizard.getByRole('button', { name: 'Move templates', exact: true }),
    ).toBeDisabled();
    await expect(activity('Reviews requested')).toHaveText('2');
    await expect(activity('Moves started')).toHaveText('0');
});

test('recovery arriving during a paused review cancels the response', async () => {
    await page
        .getByRole('checkbox', { name: 'Pause review responses', exact: true })
        .check();
    const wizard = await openWizard();
    await chooseStep(wizard);
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    await expect(activity('Waiting reviews')).toHaveText('1');
    await page.keyboard.press('Control+Shift+R');
    await expect(
        wizard.getByRole('button', { name: 'Review choices', exact: true }),
    ).toBeDisabled();
    await expect(
        wizard.getByRole('button', { name: 'Finish later', exact: true }),
    ).toBeEnabled();
    await page.keyboard.press('Control+Shift+Enter');
    await expect(activity('Reviews released')).toHaveText('1');
    await expect(
        wizard.getByRole('heading', {
            name: 'Choose for all projects',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        wizard.getByRole('button', { name: 'Move templates', exact: true }),
    ).toHaveCount(0);
    await expect(activity('Active reviews')).toHaveText('0');
    await expect(activity('Moves started')).toHaveText('0');
});

test('retains per-version choices through mode changes and Back, then reviews their exact effects', async () => {
    const wizard = await openWizard();
    await chooseStep(wizard);
    const toggle = wizard.getByRole('switch', {
        name: 'Choose for each version in Night Garden',
        exact: true,
    });
    await toggle.focus();
    await toggle.press('Space');
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeFocused();
    await toggle.press('Space');
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toBeFocused();
    await toggle.press('Space');
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeFocused();
    await select(
        wizard,
        'Choice for Night Garden, 4.3.stable',
        'Share templates',
    );
    await select(
        wizard,
        'Choice for Night Garden, 4.4.stable .NET',
        'Decide later',
    );
    await toggle.uncheck();
    await expect(
        wizard.getByRole('button', {
            name: 'Choice for Night Garden: Keep current templates',
            exact: true,
        }),
    ).toBeVisible();
    await toggle.check();
    await expect(
        wizard.getByRole('button', {
            name: 'Choice for Night Garden, 4.3.stable: Share templates',
            exact: true,
        }),
    ).toBeVisible();
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    await expect(
        wizard.getByRole('heading', {
            name: 'Check your choices',
            exact: true,
        }),
    ).toBeFocused();
    const shared = wizard.getByRole('row').filter({ hasText: '4.3.stable' });
    await expect(shared).toContainText(
        'Add missing shared files. Keep existing shared files.',
    );
    await expect(
        wizard.getByText('Separate choices for each version', { exact: true }),
    ).toBeVisible();
    await expect(
        wizard.getByRole('list', {
            name: 'Reviewed versions for Night Garden',
            exact: true,
        }),
    ).toHaveCount(3);
    const later = wizard
        .getByRole('row')
        .filter({ hasText: '4.4.stable .NET' })
        .filter({ hasText: 'Decide later' });
    await expect(later).toContainText('Keep the local files');
    await expect(
        wizard.getByRole('button', { name: 'Move templates', exact: true }),
    ).toBeDisabled();
    const confirmation = wizard.getByRole('checkbox', {
        name: /I understand that Share templates/,
    });
    await withinWindow(confirmation);
    await expect(wizard.locator('footer').getByRole('checkbox')).toHaveCount(1);
    await confirmation.check();
    await expect(
        wizard.getByRole('button', { name: 'Move templates', exact: true }),
    ).toBeEnabled();
    await wizard.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(toggle).toBeChecked();
    await expect(
        wizard.getByRole('button', {
            name: 'Choice for Night Garden, 4.4.stable .NET: Decide later',
            exact: true,
        }),
    ).toBeVisible();
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    await expect(confirmation).not.toBeChecked();
    await expect(
        wizard.getByRole('button', { name: 'Move templates', exact: true }),
    ).toBeDisabled();
});

test('an all-version change and the global reset update remembered individual choices', async () => {
    const wizard = await openWizard();
    await chooseStep(wizard);
    const toggle = wizard.getByRole('switch', {
        name: 'Choose for each version in Night Garden',
        exact: true,
    });
    await toggle.check();
    await select(wizard, 'Choice for Night Garden, 4.3.stable', 'Decide later');
    await toggle.uncheck();
    await select(wizard, 'Choice for Night Garden', 'Use shared templates');
    await toggle.check();
    for (const version of ['4.3.stable', '4.4.stable', '4.4.stable .NET'])
        await expect(
            wizard.getByRole('button', {
                name: `Choice for Night Garden, ${version}: Use shared templates`,
                exact: true,
            }),
        ).toBeVisible();
    await wizard
        .getByRole('button', { name: 'Keep current for all', exact: true })
        .click();
    await expect(
        wizard.getByRole('button', {
            name: 'Choice for Night Garden, 4.3.stable: Keep current templates',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        wizard.getByRole('button', {
            name: 'Choice for Archive Project: Decide later',
            exact: true,
        }),
    ).toBeDisabled();
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    const versions = wizard.getByRole('list', {
        name: 'Reviewed versions for Night Garden',
        exact: true,
    });
    await expect(versions).toHaveCount(3);
    await expect(
        wizard
            .getByRole('row')
            .filter({
                has: page.getByRole('list', {
                    name: 'Reviewed versions for Night Garden',
                    exact: true,
                }),
            })
            .getByText('Keep current templates', { exact: true }),
    ).toHaveCount(3);
});

test('choice help reuses Options and Escape returns focus without closing the wizard', async () => {
    const wizard = await openWizard();
    await chooseStep(wizard);
    const help = wizard.getByRole('button', {
        name: 'Explain Keep current templates for Night Garden',
        exact: true,
    });
    await help.click();
    const panel = wizard.getByRole('dialog', {
        name: 'Night Garden',
        exact: true,
    });
    await expect(panel).toContainText('Option 1: Keep current templates');
    await expect(panel).toContainText(
        '4.3.stable, 4.4.stable, 4.4.stable .NET',
    );
    const title = panel.getByRole('heading', {
        name: 'Night Garden',
        exact: true,
    });
    await expect(title).toBeFocused();
    await expect(
        panel.getByRole('button', { name: 'Close explanation', exact: true }),
    ).toHaveCount(0);
    await withinWindow(panel);
    // Constrain the reminder to exercise overflowing explanation text at the native window size.
    await panel.evaluate((element) => {
        element.style.maxHeight = '128px';
    });
    await expect
        .poll(() =>
            panel.evaluate((element) => {
                const body = element.querySelector<HTMLElement>(
                    '[data-popover-body]',
                )!;
                return body.scrollHeight > body.clientHeight;
            }),
        )
        .toBe(true);
    await panel.evaluate(
        () =>
            new Promise<void>((resolve) => {
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => resolve()),
                );
            }),
    );
    const titleBounds = await title.boundingBox();
    await panel.evaluate((element) => {
        const body = element.querySelector<HTMLElement>('[data-popover-body]')!;
        body.scrollTop = body.scrollHeight;
    });
    expect(await title.boundingBox()).toEqual(titleBounds);
    await expect
        .poll(() =>
            panel
                .locator('[data-popover-body]')
                .evaluate((element) => element.scrollTop),
        )
        .toBeGreaterThan(0);
    await withinWindow(panel);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(help).toBeFocused();
    await expect(wizard).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(wizard).toBeHidden();
    await expect(
        page.getByRole('button', {
            name: 'Open migration fixture',
            exact: true,
        }),
    ).toBeFocused();
});

test('help popover follows resize and scrolling with its arrow inside the window', async () => {
    await resizeWindow(1440, 900);
    try {
        const wizard = await openWizard();
        await chooseStep(wizard);
        const help = wizard.getByRole('button', {
            name: 'Explain Keep current templates for Night Garden',
            exact: true,
        });
        await help.click();
        const panel = wizard.getByRole('dialog', {
            name: 'Night Garden',
            exact: true,
        });
        const title = panel.getByRole('heading', {
            name: 'Night Garden',
            exact: true,
        });
        await expect(panel).toBeVisible();
        await expect(title).toBeFocused();
        await resizeWindow(1024, 600);
        await expect
            .poll(async () => {
                const bounds = await panel.boundingBox();
                const footer = await wizard.locator('footer').boundingBox();
                const width = await page.evaluate(() => window.innerWidth);
                return Boolean(
                    bounds &&
                        footer &&
                        bounds.x >= 10 &&
                        bounds.x + bounds.width <= width - 10 &&
                        bounds.y + bounds.height <= footer.y - 9,
                );
            })
            .toBe(true);
        await withinWindow(panel);
        await expect(panel).toHaveAttribute('data-side', 'left');
        const arrow = panel.locator('[data-popover-arrow]');
        await expect(arrow).toBeVisible();
        /** Checks the visible arrow against the current info button. */
        const arrowFollowsTrigger = async () => {
            const tip = await arrow.boundingBox();
            const anchor = await help.boundingBox();
            return Boolean(
                tip &&
                    anchor &&
                    Math.abs(
                        tip.y + tip.height / 2 - anchor.y - anchor.height / 2,
                    ) < 2 &&
                    Math.abs(tip.x + tip.width - anchor.x) < 12,
            );
        };
        await expect.poll(arrowFollowsTrigger).toBe(true);
        for (const theme of ['light', 'dark']) {
            await page.evaluate(
                (theme) =>
                    document.documentElement.setAttribute('data-theme', theme),
                theme,
            );
            await page.screenshot({
                path: test.info().outputPath(`help-popover-${theme}.png`),
                animations: 'disabled',
            });
        }
        const scroll = wizard.getByTestId('wizardScrollContent');
        await scroll.evaluate((element) => {
            element.scrollTop = 18;
        });
        await expect.poll(arrowFollowsTrigger).toBe(true);
        await expect(panel).toBeVisible();
        await scroll.evaluate((element) => {
            element.scrollTop = element.scrollHeight;
        });
        await expect(panel).toBeHidden();
        await expect(help).toHaveAttribute('aria-expanded', 'false');
        await expect(wizard).toBeVisible();
    } finally {
        await resizeWindow(1024, 600);
    }
});

test('help popover dismisses without stealing outside focus and can close from its info button', async () => {
    const wizard = await openWizard();
    await chooseStep(wizard);
    const help = wizard
        .getByRole('button', {
            name: 'Explain Keep current templates for Night Garden',
            exact: true,
        })
        .first();
    const panel = wizard.getByRole('dialog', {
        name: 'Night Garden',
        exact: true,
    });
    await help.click();
    await expect(panel).toBeVisible();
    const outside = wizard.getByRole('switch', {
        name: 'Choose for each version in Night Garden',
        exact: true,
    });
    await outside.click();
    await expect(panel).toBeHidden();
    await expect(outside).toBeFocused();
    await expect(
        wizard.getByRole('button', {
            name: 'Explain Keep current templates for Night Garden, 4.3.stable',
            exact: true,
        }),
    ).toHaveAttribute('aria-expanded', 'false');
    await outside.uncheck();
    await help.click();
    await help.click();
    await expect(panel).toBeHidden();
    await expect(help).toBeFocused();
    await help.click();
    await expect(
        panel.getByRole('heading', { name: 'Night Garden', exact: true }),
    ).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(panel).toBeHidden();
    await expect(help).toBeFocused();
    await expect(wizard).toBeVisible();
    await help.click();
    const anotherHelp = wizard.getByRole('button', {
        name: 'Explain Keep current templates for Platformer',
        exact: true,
    });
    await anotherHelp.click();
    await expect(panel).toBeHidden();
    const anotherPanel = wizard.getByRole('dialog', {
        name: 'Platformer',
        exact: true,
    });
    await expect(anotherPanel).toBeVisible();
    await expect(
        anotherPanel.getByRole('heading', {
            name: 'Platformer',
            exact: true,
        }),
    ).toBeFocused();
});

/** Resizes Electron's real main window rather than emulating a renderer viewport.
 * @param width - Outer window width in pixels.
 * @param height - Outer window height in pixels.
 */
async function resizeWindow(width: number, height: number): Promise<void> {
    await app.evaluate(
        ({ BrowserWindow }, size) => {
            const main = BrowserWindow.getAllWindows().find((window) =>
                window.webContents.getURL().startsWith('http://localhost:5123'),
            );
            if (!main) throw new Error('Main window not found');
            main.setSize(size.width, size.height);
        },
        { width, height },
    );
    await expect
        .poll(() =>
            app.evaluate(({ BrowserWindow }) => {
                const main = BrowserWindow.getAllWindows().find((window) =>
                    window.webContents
                        .getURL()
                        .startsWith('http://localhost:5123'),
                );
                return main?.getSize();
            }),
        )
        .toEqual([width, height]);
}

test('a failed review retains choices and can be prepared again', async () => {
    await page
        .getByRole('checkbox', {
            name: 'Make the first review fail',
            exact: true,
        })
        .check();
    const wizard = await openWizard();
    await chooseStep(wizard);
    await select(wizard, 'Choice for Night Garden', 'Use shared templates');
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    await expect(wizard.getByRole('alert')).toContainText(
        'Files changed since review',
    );
    await expect(
        wizard.getByRole('button', {
            name: 'Choice for Night Garden: Use shared templates',
            exact: true,
        }),
    ).toBeVisible();
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    await expect(
        wizard.getByRole('heading', {
            name: 'Check your choices',
            exact: true,
        }),
    ).toBeVisible();
    await expect(wizard.getByRole('alert')).toHaveCount(0);
});

test('Move shows byte progress before any version finishes', async () => {
    const wizard = await openWizard();
    await chooseStep(wizard);
    await wizard.getByRole('button', { name: 'Review choices', exact: true }).click();
    await wizard.getByRole('button', { name: 'Move templates', exact: true }).click();
    const progress = wizard.getByRole('progressbar', { name: 'Checking template files', exact: true });
    await expect(progress).toHaveAttribute('max', '4096');
    await expect.poll(async () => Number(await progress.getAttribute('value'))).toBeGreaterThan(0);
    await expect(wizard.getByText(/KiB \/ 4 KiB/)).toBeVisible();
    await expect(wizard.getByText(/0 of .* template versions finished/)).toBeVisible();
    await withinWindow(progress);
});

test('shows partial version outcomes and retries only the failed version', async () => {
    await page
        .getByRole('checkbox', { name: 'Show a failed version', exact: true })
        .check();
    const wizard = await openWizard();
    await chooseStep(wizard);
    await wizard
        .getByRole('button', { name: 'Review choices', exact: true })
        .click();
    await wizard
        .getByRole('button', { name: 'Move templates', exact: true })
        .click();
    await expect(wizard.getByRole('status')).toContainText(
        'Checking template files',
    );
    await page.keyboard.press('Escape');
    await expect(wizard).toBeVisible();
    await expect(
        wizard.getByRole('heading', {
            name: 'Your migration results',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        wizard.getByText(
            'Completed: 11. Could not move: 1. Left for later: 2.',
            { exact: true },
        ),
    ).toBeVisible();
    const results = wizard.getByRole('list', {
        name: 'Template version results',
        exact: true,
    });
    const nightGarden = results
        .getByRole('listitem')
        .filter({ has: page.getByText('Night Garden', { exact: true }) })
        .first();
    await expect(nightGarden).toContainText('Could not move');
    await expect(nightGarden.getByText('Done', { exact: true })).toHaveCount(2);
    const retry = wizard.locator('footer').getByRole('button', {
        name: 'Try failed versions again (1)',
        exact: true,
    });
    await withinWindow(retry);
    await retry.click();
    await expect(
        wizard.getByRole('heading', {
            name: 'Check your choices',
            exact: true,
        }),
    ).toBeVisible();
    await wizard
        .getByRole('button', { name: 'Move templates', exact: true })
        .click();
    await expect(
        wizard.getByRole('heading', {
            name: 'Moving export templates',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        wizard.getByText('11 of 12 template versions finished', {
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        wizard.getByRole('heading', {
            name: 'Your migration results',
            exact: true,
        }),
    ).toBeVisible();
    await expect(
        wizard.getByText(
            'Completed: 12. Could not move: 0. Left for later: 2.',
            { exact: true },
        ),
    ).toBeVisible();
    await expect(
        wizard.getByRole('button', { name: /Try failed versions again/ }),
    ).toHaveCount(0);
});

for (const theme of ['light', 'dark']) {
    test(`all six screens fit the 600px native window with a 10px inset (${theme})`, async () => {
        await page.evaluate(
            (value) => localStorage.setItem('theme', value),
            theme,
        );
        await page.reload();
        await mountWizardFixture(page, 'migration');
        await page
            .getByRole('checkbox', {
                name: 'Show a failed version',
                exact: true,
            })
            .check();
        const wizard = await openWizard();
        const viewport = await page.evaluate(() => ({
            width: innerWidth,
            height: innerHeight,
        }));
        await expect
            .poll(async () => {
                const bounds = await wizard
                    .locator(':scope > section')
                    .boundingBox();
                if (!bounds) return [];
                return [
                    bounds.x,
                    bounds.y,
                    viewport.height - (bounds.y + bounds.height),
                    viewport.width - (bounds.x + bounds.width),
                ].map(Math.round);
            })
            .toEqual([10, 10, 10, 10]);
        await expect
            .poll(() =>
                wizard
                    .locator(':scope > section')
                    .evaluate((element) =>
                        Number(getComputedStyle(element).opacity),
                    ),
            )
            .toBe(1);
        await expect
            .poll(() =>
                wizard.evaluate((element) =>
                    Number(getComputedStyle(element).opacity),
                ),
            )
            .toBe(1);
        const scroll = wizard.getByTestId('wizardScrollContent');
        const optionColours: Record<string, string> = {};
        for (const [screen, action] of [
            ['about', 'See options'],
            ['options', 'Choose for projects'],
            ['choose', 'Review choices'],
            ['review', 'Move templates'],
        ] as const) {
            if (screen === 'options') {
                for (const [index, choice] of [
                    'Keep current templates',
                    'Share templates',
                    'Use shared templates',
                    'Decide later',
                ].entries()) {
                    optionColours[choice] = await wizard
                        .getByRole('heading', {
                            name: `Option ${index + 1}: ${choice}`,
                            exact: true,
                        })
                        .locator('svg')
                        .evaluate((element) => getComputedStyle(element).color);
                }
                expect(new Set(Object.values(optionColours)).size).toBe(4);
            }
            if (screen === 'choose') {
                await select(
                    wizard,
                    'Choice for Night Garden',
                    'Share templates',
                );
                await select(
                    wizard,
                    'Choice for Prototype .NET',
                    'Use shared templates',
                );
                await wizard
                    .getByRole('button', {
                        name: 'Explain Share templates for Night Garden',
                        exact: true,
                    })
                    .click();
                const help = wizard.getByRole('dialog', {
                    name: 'Night Garden',
                    exact: true,
                });
                await withinWindow(help);
                await page.screenshot({
                    path: test.info().outputPath(`choice-help-${theme}.png`),
                    animations: 'disabled',
                });
                await page.keyboard.press('Escape');
                await expect(
                    wizard.getByRole('list', {
                        name: 'Choices by template version',
                        exact: true,
                    }),
                ).toContainText('Share templates(3)');
                for (const [project, choice] of [
                    ['Night Garden', 'Share templates'],
                    ['Prototype .NET', 'Use shared templates'],
                    ['Platformer', 'Keep current templates'],
                    ['Archive Project', 'Decide later'],
                ]) {
                    expect(
                        await wizard
                            .getByRole('button', {
                                name: `Choice for ${project}: ${choice}`,
                                exact: true,
                            })
                            .locator('svg')
                            .evaluate(
                                (element) => getComputedStyle(element).color,
                            ),
                    ).toBe(optionColours[choice]);
                }
                const selector = wizard.getByRole('button', {
                    name: 'Choice for Night Garden: Share templates',
                    exact: true,
                });
                await selector.click();
                const menu = wizard.getByRole('listbox', {
                    name: 'Choice for Night Garden: Share templates',
                    exact: true,
                });
                for (const choice of Object.keys(optionColours)) {
                    const option = menu.getByRole('option', {
                        name: choice,
                        exact: true,
                    });
                    await expect(option).toBeVisible();
                    expect(
                        await option
                            .locator('svg')
                            .evaluate(
                                (element) => getComputedStyle(element).color,
                            ),
                    ).toBe(optionColours[choice]);
                }
                await page.screenshot({
                    path: test.info().outputPath(`choice-menu-${theme}.png`),
                    animations: 'disabled',
                });
                await page.keyboard.press('Escape');
                await scroll.evaluate((element) => {
                    element.scrollTop = 0;
                });
                await expect(
                    wizard.getByText(
                        'More projects below. Scroll to see them.',
                        { exact: true },
                    ),
                ).toBeVisible();
                const reset = wizard.getByRole('button', {
                    name: 'Keep current for all',
                    exact: true,
                });
                const resetBounds = await reset.boundingBox();
                const tableHeaderBounds = await wizard
                    .getByRole('columnheader', { name: 'Project', exact: true })
                    .boundingBox();
                await wizard
                    .getByRole('button', {
                        name: 'Choice for Custom Build: Decide later',
                        exact: true,
                    })
                    .scrollIntoViewIfNeeded();
                await scroll.evaluate((element) => {
                    element.scrollTop = element.scrollHeight;
                });
                await withinWindow(reset);
                expect(await reset.boundingBox()).toEqual(resetBounds);
                expect(
                    Math.abs(
                        ((
                            await wizard
                                .getByRole('columnheader', {
                                    name: 'Project',
                                    exact: true,
                                })
                                .boundingBox()
                        )?.y ?? -1) - (tableHeaderBounds?.y ?? -1),
                    ),
                ).toBeLessThanOrEqual(1);
                await expect(
                    wizard.getByText(
                        'More projects below. Scroll to see them.',
                        { exact: true },
                    ),
                ).toBeHidden();
                await scroll.evaluate((element) => {
                    element.scrollTop = 0;
                });
            }
            if (screen === 'review') {
                expect(
                    await scroll.evaluate((element) => element.scrollTop),
                ).toBe(0);
                const versions = wizard.getByRole('list', {
                    name: 'Reviewed versions for Night Garden',
                    exact: true,
                });
                await expect(versions).toHaveCount(1);
                await expect(versions.getByRole('listitem')).toHaveCount(3);
                const project = wizard.getByRole('row').filter({
                    has: page.getByRole('list', {
                        name: 'Reviewed versions for Night Garden',
                        exact: true,
                    }),
                });
                await expect(project).toContainText(
                    'Applies to all 3 versions',
                );
                await expect(
                    project.getByText('Share templates', { exact: true }),
                ).toHaveCount(1);
                for (const version of [
                    '4.3.stable',
                    '4.4.stable',
                    '4.4.stable .NET',
                ])
                    await expect(
                        versions.getByText(version, { exact: true }),
                    ).toBeVisible();
                await expect(
                    versions.getByText('2 files - 4 KiB', { exact: true }),
                ).toHaveCount(3);
                const confirmation = wizard
                    .locator('footer')
                    .getByRole('checkbox', {
                        name: /I understand that Share templates/,
                    });
                await withinWindow(confirmation);
                await expect(
                    wizard.getByRole('button', { name: action, exact: true }),
                ).toBeDisabled();
                await confirmation.check();
                await expect(confirmation).toBeChecked();
                await expect(
                    wizard.getByRole('button', { name: action, exact: true }),
                ).toBeEnabled();
                await scroll.evaluate((element) => {
                    element.scrollTop = element.scrollHeight;
                });
                await withinWindow(confirmation);
                await withinWindow(
                    wizard.getByRole('button', { name: 'Back', exact: true }),
                );
                await scroll.evaluate((element) => {
                    element.scrollTop = 0;
                });
                await expect(
                    wizard.getByText(
                        'More versions below. Scroll to see them.',
                        { exact: true },
                    ),
                ).toBeVisible();
            }
            await expect(wizard.locator('footer')).toBeVisible();
            await withinWindow(
                wizard.getByRole('button', { name: action, exact: true }),
            );
            await page.screenshot({
                path: test.info().outputPath(`${screen}-${theme}.png`),
                animations: 'disabled',
            });
            await wizard
                .getByRole('button', { name: action, exact: true })
                .click();
        }
        await expect(wizard.getByRole('status')).toBeVisible();
        const moving = wizard
            .locator('footer')
            .getByRole('button', { name: 'Moving templates...', exact: true });
        await expect(moving).toBeDisabled();
        await withinWindow(moving);
        await scroll.evaluate((element) => {
            element.scrollTop = element.scrollHeight;
        });
        await withinWindow(wizard.getByRole('progressbar'));
        await withinWindow(moving);
        await scroll.evaluate((element) => {
            element.scrollTop = 0;
        });
        await expect(
            wizard.getByText('More versions below. Scroll to see them.', {
                exact: true,
            }),
        ).toBeVisible();
        await page.screenshot({
            path: test.info().outputPath(`move-${theme}.png`),
            animations: 'disabled',
        });
        await expect(
            wizard.getByRole('heading', {
                name: 'Your migration results',
                exact: true,
            }),
        ).toBeVisible();
        expect(await scroll.evaluate((element) => element.scrollTop)).toBe(0);
        const retry = wizard.locator('footer').getByRole('button', {
            name: 'Try failed versions again (1)',
            exact: true,
        });
        await withinWindow(retry);
        await expect(retry).toBeEnabled();
        await withinWindow(
            wizard.getByRole('button', { name: 'Done', exact: true }),
        );
        await scroll.evaluate((element) => {
            element.scrollTop = element.scrollHeight;
        });
        await withinWindow(retry);
        await withinWindow(
            wizard.getByText(
                'Completed: 11. Could not move: 1. Left for later: 2.',
                { exact: true },
            ),
        );
        await scroll.evaluate((element) => {
            element.scrollTop = 0;
        });
        await expect(
            wizard.getByText('More versions below. Scroll to see them.', {
                exact: true,
            }),
        ).toBeVisible();
        await expect
            .poll(() =>
                wizard
                    .locator(':scope > section')
                    .evaluate(
                        (element) =>
                            element.scrollWidth <= element.clientWidth + 1,
                    ),
            )
            .toBe(true);
        await page.screenshot({
            path: test.info().outputPath(`done-${theme}.png`),
            animations: 'disabled',
        });

        await wizard.getByRole('button', { name: 'Done', exact: true }).click();
        await expect(wizard).toBeHidden();
        await openWizard();
        await chooseStep(wizard);
        await wizard
            .getByRole('switch', {
                name: 'Choose for each version in Night Garden',
                exact: true,
            })
            .check();
        await select(
            wizard,
            'Choice for Night Garden, 4.3.stable',
            'Share templates',
        );
        await select(
            wizard,
            'Choice for Night Garden, 4.4.stable .NET',
            'Decide later',
        );
        await wizard
            .getByRole('button', { name: 'Review choices', exact: true })
            .click();
        await expect(
            wizard.getByText('Separate choices for each version', {
                exact: true,
            }),
        ).toBeVisible();
        await expect(
            wizard.getByRole('list', {
                name: 'Reviewed versions for Night Garden',
                exact: true,
            }),
        ).toHaveCount(3);
        await withinWindow(
            wizard.locator('footer').getByRole('checkbox', {
                name: /I understand that Share templates/,
            }),
        );
        await withinWindow(
            wizard.getByRole('button', { name: 'Move templates', exact: true }),
        );
        await expect(
            wizard.getByRole('button', { name: 'Move templates', exact: true }),
        ).toBeDisabled();
        await expect
            .poll(() =>
                wizard
                    .locator(':scope > section')
                    .evaluate((element) =>
                        Number(getComputedStyle(element).opacity),
                    ),
            )
            .toBe(1);
        await expect
            .poll(() =>
                wizard.evaluate((element) =>
                    Number(getComputedStyle(element).opacity),
                ),
            )
            .toBe(1);
        await page.screenshot({
            path: test.info().outputPath(`review-individual-${theme}.png`),
            animations: 'disabled',
        });
    });
}
