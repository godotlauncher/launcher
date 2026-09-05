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
    setAppLanguage,
    stubCreateProjectRepositoryInspection,
    stubCreateProjectRepositoryNameAvailability,
    stubCreateProjectPublicationTargets,
    stubCreateProjectResult,
    stubGlobalGitIdentity,
    stubRetryCreateProjectPublicationResults,
} from './support/e2e-fixture-runtime';
import { SAMPLE_PROJECTS } from './support/e2e-fixture-data';
import { THEMES } from './support/e2e-fixture-theme';
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
    await setAppLanguage(mainPage, 'English');
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
    await stubCreateProjectRepositoryNameAvailability(electronApp, {
        status: 'available',
    });
    await stubCreateProjectRepositoryInspection(electronApp, {
        status: 'not-a-repository',
    });
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
    const projectName = mainPage.getByTestId('inputProjectName');
    await expect(projectName).toBeFocused();
    await projectName.fill('My Awesome Game');
    await expect(
        mainPage.getByLabel('A project with this name already exists'),
    ).toBeVisible();
    await expect(mainPage.getByTestId('btnCreateProject')).toBeDisabled();
    await projectName.fill('My Next Awesome Game');
    await expect(
        mainPage.getByLabel('A project with this name already exists'),
    ).toHaveCount(0);

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
        mainPage.getByText('Name looks available', { exact: true }),
    ).toBeVisible();
    await expect(
        mainPage.getByText('Private GitHub repository', { exact: true }),
    ).toBeVisible();
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

        await expect(
            mainPage.getByTestId('btnSelectProjectFolder'),
        ).toBeVisible();
        const browseButton = mainPage.getByTestId(
            'btnSelectProjectFolder',
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
    }

    await repositoryName.fill('hand-picked-name');
    await stubCreateProjectRepositoryNameAvailability(electronApp, {
        status: 'unavailable',
    });
    await repositoryName.fill('existing-game');
    await expect(
        mainPage.getByText('Name already in use', { exact: true }),
    ).toBeVisible();
    await expect(mainPage.getByTestId('btnCreateProject')).toBeDisabled();
    await stubCreateProjectRepositoryNameAvailability(electronApp, {
        status: 'available',
    });
    await repositoryName.fill('hand-picked-name');
    await expect(
        mainPage.getByText('Name looks available', { exact: true }),
    ).toBeVisible();
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
    await mainPage.getByRole('button', { name: 'Add Git identity' }).click();
    await mainPage
        .getByLabel('Recorded as the commit author name.')
        .hover();
    const identityTooltip = mainPage.getByRole('tooltip', {
        name: 'Recorded as the commit author name.',
    });
    await expect(identityTooltip).toBeVisible();
    expect(
        await identityTooltip.evaluate(
            (element) => element.parentElement?.tagName,
        ),
    ).toBe('DIALOG');
    await mainPage.keyboard.press('Escape');
    await mainPage.getByTestId('btnCloseCreateProject').click();
});

test('connects GitHub in place and preserves the project form after cancellation', async () => {
    await stubSharedConnection(false, false, 12);
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectCreate').click();
    await mainPage.getByTestId('inputProjectName').fill('Preserved Game');
    const editor = mainPage.getByTestId('selectCreateProjectGodotEditor');
    const editorBefore = await editor.textContent();
    await mainPage.getByRole('checkbox', { name: 'Publish to GitHub' }).check();
    const connect = mainPage.getByRole('button', { name: 'Connect GitHub', exact: true });
    await connect.click();
    const dialog = mainPage.getByRole('dialog', { name: 'Connect GitHub', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Continue in browser' })).toBeEnabled();
    const outputDirectory = path.resolve(process.cwd(), '.internal-docs', 'shared-github-connection');
    await fs.mkdir(outputDirectory, { recursive: true });
    await mainPage.screenshot({ path: path.join(outputDirectory, 'create-project-dark.png') });
    await mainPage.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(connect).toBeFocused();
    await expect(mainPage.getByTestId('inputProjectName')).toHaveValue('Preserved Game');
    await expect(editor).toHaveText(editorBefore ?? '');
    await connect.click();
    await dialog.getByRole('button', { name: 'Continue in browser' }).click();
    await expect(dialog.getByText('fixture-user', { exact: true })).toBeVisible();
    const list = dialog.getByTestId('github-connection-options');
    const footer = dialog.locator('footer');
    await expect(footer.getByRole('button', { name: /Connect selected/i })).toBeVisible();
    const addAccount = dialog.getByRole('button', { name: 'Add another account' });
    const toolbarBefore = await addAccount.boundingBox();
    const footerBefore = await footer.boundingBox();
    await list.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await addAccount.boundingBox()).toEqual(toolbarBefore);
    expect(await footer.boundingBox()).toEqual(footerBefore);
    await dialog.getByRole('checkbox', { name: /fixture-user/ }).check();
    await expect(dialog.getByRole('checkbox', { name: /fixture-user/ })).toBeChecked();
    await mainPage.screenshot({ path: path.join(outputDirectory, 'connection-selection-dark.png') });
    await dialog.getByRole('button', { name: /Connect selected/i }).click();
    await expect(dialog).not.toBeVisible();
    await expect(mainPage.getByTestId('selectCreateProjectGitHubOwner')).toContainText('fixture-user');
    await expect(mainPage.getByTestId('inputProjectName')).toHaveValue('Preserved Game');
    await expect(editor).toHaveText(editorBefore ?? '');
    await expect(mainPage.locator('#createProjectGitHubRepositoryName')).toHaveValue('Preserved-Game');
    await mainPage.getByTestId('btnCloseCreateProject').click();
});

test('ignores a late browser response after cancelling and reopening connection', async () => {
    await stubSharedConnection(true);
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectCreate').click();
    await mainPage.getByTestId('inputProjectName').fill('Cancelled Connection Game');
    await mainPage.getByRole('checkbox', { name: 'Publish to GitHub' }).check();
    const connect = mainPage.getByRole('button', { name: 'Connect GitHub', exact: true });
    await connect.click();
    const dialog = mainPage.getByRole('dialog', { name: 'Connect GitHub', exact: true });
    await dialog.getByRole('button', { name: 'Continue in browser' }).click();
    await expect(dialog.getByText('Complete the connection in your browser, then return here.')).toBeVisible();
    await mainPage.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await connect.click();
    await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & { __releaseConnection?: () => void };
        state.__releaseConnection?.();
    });
    await expect(dialog.getByRole('button', { name: 'Continue in browser' })).toBeVisible();
    await expect(dialog.getByRole('checkbox')).toHaveCount(0);
    await mainPage.keyboard.press('Escape');
    await expect(mainPage.getByTestId('inputProjectName')).toHaveValue('Cancelled Connection Game');
    await mainPage.getByTestId('btnCloseCreateProject').click();
});

test('repairs an expired account within Create Project', async () => {
    await stubSharedConnection(false, true);
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectCreate').click();
    await mainPage.getByTestId('inputProjectName').fill('Reconnect Game');
    await mainPage.getByRole('checkbox', { name: 'Publish to GitHub' }).check();
    await mainPage.getByRole('button', { name: 'Connect GitHub', exact: true }).click();
    const dialog = mainPage.getByRole('dialog', { name: 'Connect GitHub', exact: true });
    await dialog.getByRole('radio', { name: 'fixture-user', exact: true }).check();
    await dialog.getByRole('button', { name: 'Reconnect GitHub', exact: true }).click();
    await dialog.getByRole('checkbox', { name: /fixture-user/ }).check();
    await dialog.getByRole('button', { name: /Connect selected/i }).click();
    await expect(dialog).not.toBeVisible();
    await expect(mainPage.getByTestId('inputProjectName')).toHaveValue('Reconnect Game');
    expect(await electronApp.evaluate(() => (globalThis as typeof globalThis & {
        __reconnectedAccount?: string;
    }).__reconnectedAccount)).toBe('fixture-connection');
    await expect(mainPage.getByTestId('selectCreateProjectGitHubOwner')).toContainText('fixture-user');
    await mainPage.getByTestId('btnCloseCreateProject').click();
});

test('uses the shared connection dialog from Settings', async () => {
    await stubSharedConnection();
    const card = mainPage.getByTestId('app-integration-github');
    const dialog = mainPage.getByRole('dialog', { name: 'Connect GitHub', exact: true });
    const outputDirectory = path.resolve(process.cwd(), '.internal-docs', 'shared-github-connection');
    await fs.mkdir(outputDirectory, { recursive: true });
    for (const theme of THEMES) {
        await applyTheme(mainPage, theme);
        await mainPage.getByTestId('btnConnections').click();
        await card.getByRole('button', { name: 'Connect GitHub', exact: true }).click();
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Continue in browser' })).toBeEnabled();
        await mainPage.screenshot({ path: path.join(outputDirectory, `settings-${theme.name}.png`) });
        await mainPage.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible();
    }
    await card.getByRole('button', { name: 'Connect GitHub', exact: true }).click();
    await dialog.getByRole('button', { name: 'Continue in browser' }).click();
    await dialog.getByRole('checkbox', { name: /fixture-user/ }).check();
    await dialog.getByRole('button', { name: /Connect selected/i }).click();
    await expect(dialog).not.toBeVisible();
    await expect(mainPage).toHaveURL(/settings\/connections$/);
    await expect(card.getByRole('button', { name: 'Add connection', exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Manage GitHub connections' }).click();
    const management = mainPage.getByRole('dialog', { name: 'GitHub connections', exact: true });
    await management.getByRole('button', { name: 'Add connection', exact: true }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Continue in browser' }).focus();
    await mainPage.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await mainPage.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(management).toBeVisible();
    await mainPage.keyboard.press('Escape');
    await expect(management).not.toBeVisible();
});

/**
 * Stubs browser authorisation and owner loading without contacting GitHub.
 * @param deferConnection - Whether authorisation waits for an explicit test response.
 * @param expiredConnection - Whether an existing account needs reauthorisation.
 * @param optionCount - Number of accounts available for the chooser.
 */
async function stubSharedConnection(deferConnection = false, expiredConnection = false, optionCount = 1): Promise<void> {
    await electronApp.evaluate(({ ipcMain }, { deferConnection, expiredConnection, optionCount }) => {
        let connected = false;
        const target = {
            id: 'fixture-target', login: 'fixture-user', type: 'user',
            availability: 'available', capabilities: ['repository-browsing', 'repository-creation'],
        };
        const summary = {
            id: 'github', displayName: 'GitHub', state: 'not-connected',
            connectionStage: null as string | null,
            connections: [] as unknown[], connectionOptions: [] as unknown[],
        };
        if (expiredConnection) {
            summary.state = 'reauthorisation-required';
            summary.connections = [{ id: 'fixture-connection', accountLogin: 'fixture-user',
                accountDisplayName: null, state: 'reauthorisation-required', accessTargets: [target] }];
        }
        ipcMain.removeHandler('appIntegrations.reconnect');
        ipcMain.handle('appIntegrations.reconnect', (_event, _provider, connectionId: string) => {
            const state = globalThis as typeof globalThis & { __reconnectedAccount?: string };
            state.__reconnectedAccount = connectionId;
            summary.state = 'selection-required';
            summary.connectionStage = 'choosing';
            summary.connectionOptions = Array.from({ length: optionCount }, (_, index) => ({ id: `fixture-option-${index}`, login: index === 0 ? 'fixture-user' : `fixture-org-${index}`, type: index === 0 ? 'user' : 'organization' }));
            return { success: true, data: { ok: true, integration: summary } };
        });
        ipcMain.removeHandler('appIntegrations.refresh');
        ipcMain.handle('appIntegrations.refresh', () => ({ success: true, data: { ok: true, integration: summary } }));
        ipcMain.removeHandler('appIntegrations.listIntegrations');
        ipcMain.handle('appIntegrations.listIntegrations', () => ({ success: true, data: [summary] }));
        ipcMain.removeHandler('appIntegrations.connect');
        ipcMain.handle('appIntegrations.connect', async () => {
            if (deferConnection) {
                await new Promise<void>((resolve) => {
                    const state = globalThis as typeof globalThis & { __releaseConnection?: () => void };
                    state.__releaseConnection = resolve;
                });
            }
            summary.state = 'selection-required';
            summary.connectionStage = 'choosing';
            summary.connectionOptions = Array.from({ length: optionCount }, (_, index) => ({ id: `fixture-option-${index}`, login: index === 0 ? 'fixture-user' : `fixture-org-${index}`, type: index === 0 ? 'user' : 'organization' }));
            return { success: true, data: { ok: true, integration: summary } };
        });
        ipcMain.removeHandler('appIntegrations.finishConnections');
        ipcMain.handle('appIntegrations.finishConnections', () => {
            connected = true;
            summary.state = 'connected';
            summary.connectionStage = null;
            summary.connectionOptions = [];
            summary.connections = [{
                id: 'fixture-connection', accountLogin: 'fixture-user', accountDisplayName: null,
                state: 'connected', accessTargets: [target],
            }];
            return { success: true, data: { ok: true, integration: summary } };
        });
        ipcMain.removeHandler('appIntegrations.cancel');
        ipcMain.handle('appIntegrations.cancel', () => {
            summary.state = connected ? 'connected' : 'not-connected';
            summary.connectionStage = null;
            summary.connectionOptions = [];
            return { success: true, data: { ok: true, integration: summary } };
        });
        ipcMain.removeHandler('projects.listCreateProjectPublicationTargets');
        ipcMain.handle('projects.listCreateProjectPublicationTargets', () => ({
            success: true,
            data: connected ? { success: true, targets: [{
                providerId: 'github', connectionId: 'fixture-connection', accessTargetId: 'fixture-target',
                ownerLogin: 'fixture-user', ownerType: 'user', accountLogin: 'fixture-user',
            }] } : { success: false, reason: 'connection-required' },
        }));
    }, { deferConnection, expiredConnection, optionCount });
}

test('keeps local and disconnected publishing layouts within the drawer', async () => {
    await stubCreateProjectPublicationTargets(electronApp, {
        success: false,
        reason: 'connection-required',
    });
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectCreate').click();
    const body = mainPage.locator('.drawer-panel form > div.overflow-y-auto');
    await expect.poll(() => body.evaluate(
        (element) => element.scrollHeight <= element.clientHeight + 1,
    )).toBe(true);
    await mainPage.getByRole('checkbox', { name: 'Publish to GitHub' }).check();
    await expect(mainPage.getByRole('button', { name: 'Connect GitHub' })).toBeVisible();
    await expect.poll(() => body.evaluate(
        (element) => element.scrollHeight <= element.clientHeight + 1,
    )).toBe(true);
    await expect(mainPage.getByTestId('btnCreateProject')).toBeDisabled();
    if (process.env.GODOT_LAUNCHER_DESIGN_QA === '1') {
        await mainPage.screenshot({ path: path.resolve(
            process.cwd(), '.internal-docs', 'create-project-disconnected-layout.png',
        ) });
    }
    await mainPage.getByRole('checkbox', { name: 'Publish to GitHub' }).uncheck();
    await expect(mainPage.getByRole('button', { name: 'Connect GitHub' })).toHaveCount(0);
    await mainPage.getByTestId('btnCloseCreateProject').click();
});

test('blocks a conflicting name and shows app-style recovery', async () => {
    await stubGlobalGitIdentity(electronApp, {
        name: 'Mario Debono',
        email: 'mario@example.com',
    });
    await stubCreateProjectResult(electronApp, {
        success: false,
        error: 'The project was created locally.',
        projectDetails: {
            ...SAMPLE_PROJECTS[0],
            name: 'Conflict Game',
            path: path.join(fixtureHome, 'Projects', 'Conflict Game'),
        },
        publication: {
            status: 'failed',
            attemptId: 'availability-conflict-attempt',
            stage: 'remote-create',
            reason: 'repository-name-unavailable-or-policy-rejected',
            intendedRepository: {
                owner: 'mariodebono',
                name: 'Conflict-Game',
                webUrl: 'https://github.com/mariodebono/Conflict-Game',
            },
            canRetry: true,
            canEdit: true,
        },
    });

    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectCreate').click();
    await mainPage.getByTestId('inputProjectName').fill('Conflict Game');
    await mainPage
        .getByRole('checkbox', { name: 'Publish to GitHub' })
        .check();
    await expect(
        mainPage.getByText('Name looks available', { exact: true }),
    ).toBeVisible();
    await stubCreateProjectRepositoryNameAvailability(electronApp, {
        status: 'unavailable',
    });

    await mainPage.getByTestId('btnCreateProject').click();
    const recoveryDialog = mainPage.getByRole('dialog', {
        name: 'Could not publish to GitHub',
    });
    await expect(recoveryDialog).toBeVisible();
    await expect(
        recoveryDialog.locator('.lucide-triangle-alert.text-error'),
    ).toBeVisible();
    await expect(
        recoveryDialog.getByText('Name already in use', { exact: true }),
    ).toBeVisible();
    await expect(
        recoveryDialog.getByRole('button', { name: 'Retry publishing' }),
    ).toBeDisabled();
    await expect(
        recoveryDialog.getByRole('button', { name: 'Open on GitHub' }),
    ).toHaveCount(0);

    if (process.env.GODOT_LAUNCHER_DESIGN_QA === '1') {
        await mainPage.screenshot({
            path: path.resolve(
                process.cwd(),
                '.internal-docs',
                'create-project-github-publishing-recovery-modal.png',
            ),
        });
    }

    await recoveryDialog
        .getByRole('button', { name: 'Continue locally' })
        .click();
    await expect(recoveryDialog).toBeHidden();
});

test('checks and confirms an exact empty repository after uncertain creation', async () => {
    await stubGlobalGitIdentity(electronApp, {
        name: 'Mario Debono',
        email: 'mario@example.com',
    });
    const projectDetails = {
        ...SAMPLE_PROJECTS[0],
        name: 'Recovery Game',
        path: path.join(fixtureHome, 'Projects', 'Recovery Game'),
    };
    const repository = {
        owner: 'mariodebono',
        name: 'Recovery-Game',
        webUrl: 'https://github.com/mariodebono/Recovery-Game',
    };
    await stubCreateProjectResult(electronApp, {
        success: false,
        error: 'The project was created locally.',
        projectDetails,
        publication: {
            status: 'failed',
            attemptId: 'uncertain-creation-attempt',
            stage: 'remote-create',
            reason: 'remote-creation-uncertain',
            intendedRepository: repository,
            recoveryAction: 'check-and-retry',
            canRetry: true,
            canEdit: false,
        },
    });
    await stubRetryCreateProjectPublicationResults(electronApp, [
        {
            success: false,
            error: 'Confirmation required.',
            projectDetails,
            publication: {
                status: 'failed',
                attemptId: 'uncertain-creation-attempt',
                stage: 'remote-create',
                reason: 'remote-creation-uncertain',
                repository,
                recoveryAction: 'confirm-recovered-repository',
                canRetry: true,
                canEdit: false,
            },
        },
        {
            success: true,
            projectDetails,
            publication: { status: 'published', repository },
        },
    ]);

    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectCreate').click();
    await mainPage.getByTestId('inputProjectName').fill('Recovery Game');
    await mainPage
        .getByRole('checkbox', { name: 'Publish to GitHub' })
        .check();
    await expect(
        mainPage.getByText('Name looks available', { exact: true }),
    ).toBeVisible();
    await mainPage
        .getByRole('checkbox', { name: 'Edit now' })
        .uncheck();
    await mainPage.getByTestId('btnCreateProject').click();

    const recoveryDialog = mainPage.getByRole('dialog', {
        name: 'Could not publish to GitHub',
    });
    await expect(
        recoveryDialog.getByRole('button', { name: 'Check and retry' }),
    ).toBeVisible();
    await recoveryDialog
        .getByRole('button', { name: 'Check and retry' })
        .click();
    await expect(
        recoveryDialog.getByText(
            'GitHub contains this exact empty repository. Confirm that you want Launcher to use it.',
        ),
    ).toBeVisible();
    await expect(
        recoveryDialog.getByRole('button', {
            name: 'Use this repository',
        }),
    ).toBeVisible();
    await recoveryDialog
        .getByRole('button', { name: 'Use this repository' })
        .click();

    await expect(recoveryDialog).toBeHidden();
    await expect(mainPage.getByText('Published to GitHub')).toBeVisible();
});

test('confirms a parent repository before creating locally once', async () => {
    const repositoryRoot = path.join(fixtureHome, 'Projects', 'Parent');
    const projectDetails = {
        ...SAMPLE_PROJECTS[0],
        name: 'Parent Repository Game',
        path: path.join(repositoryRoot, 'Parent-Repository-Game'),
    };
    await stubCreateProjectRepositoryInspection(electronApp, {
        status: 'inside-work-tree',
        root: repositoryRoot,
        isProjectRoot: false,
        kind: 'standard',
    });
    await stubRecordedCreateProjectResults(electronApp, [{
        success: true,
        projectDetails,
        gitSetup: {
            status: 'existing-repository',
            root: repositoryRoot,
            isProjectRoot: false,
            kind: 'standard',
        },
        publication: { status: 'not-requested' },
    }]);

    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectCreate').click();
    await mainPage
        .getByTestId('inputProjectName')
        .fill('Parent Repository Game');
    await mainPage.getByRole('checkbox', { name: 'Use Git LFS' }).check();
    await mainPage
        .getByRole('checkbox', { name: 'Publish to GitHub' })
        .check();
    await expect(
        mainPage.getByText('Name looks available', { exact: true }),
    ).toBeVisible();
    await mainPage
        .getByRole('checkbox', { name: 'Edit now' })
        .uncheck();

    await mainPage.getByTestId('btnCreateProject').click();
    let dialog = mainPage.getByRole('dialog', {
        name: 'This project will be inside another Git repository',
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(repositoryRoot);
    await expect(dialog).toContainText(
        'Launcher will not create a separate Git repository or initial commit.',
    );
    await expect(dialog).toContainText('Git LFS will not be set up.');
    await expect(dialog).toContainText(
        'The project will not be published to GitHub.',
    );
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await expect(dialog).toBeHidden();
    await expect(mainPage.getByTestId('inputProjectName')).toHaveValue(
        'Parent Repository Game',
    );
    await expect
        .poll(async () => await readRecordedCreateProjectCalls(electronApp))
        .toHaveLength(0);

    await stubDelayedCreateProjectRepositoryInspection(
        electronApp,
        {
            status: 'inside-work-tree',
            root: repositoryRoot,
            isProjectRoot: false,
            kind: 'standard',
        },
        150,
    );
    await mainPage.getByTestId('btnCreateProject').click();
    await mainPage
        .getByTestId('inputProjectName')
        .fill('Changed After Submission');
    dialog = mainPage.getByRole('dialog', {
        name: 'This project will be inside another Git repository',
    });
    await dialog.getByRole('button', { name: 'Continue' }).click();

    const completion = mainPage.getByRole('dialog', {
        name: 'Project created',
    });
    await expect(completion).toBeVisible();
    await expect(completion).toContainText(
        'Your project is ready on this computer.',
    );
    const [request] = await readRecordedCreateProjectCalls(electronApp);
    expect(request[4]).toBe(true);
    expect(request[6]).toBeUndefined();
    expect(request[7]).toBeUndefined();
    expect(request[0]).toBe('Parent Repository Game');
    expect(request[8]).toEqual({ root: repositoryRoot });
    await completion.getByRole('button', { name: 'Done' }).click();
    await expect(mainPage.getByTestId('btnCloseCreateProject')).toBeHidden();
});

test('shows local completion when a parent repository appears after preflight', async () => {
    const repositoryRoot = path.join(fixtureHome, 'Projects', 'Late Parent');
    const projectDetails = {
        ...SAMPLE_PROJECTS[0],
        name: 'Late Parent Game',
        path: path.join(repositoryRoot, 'Late-Parent-Game'),
    };
    await stubGlobalGitIdentity(electronApp, {
        name: 'Mario Debono',
        email: 'mario@example.com',
    });
    await stubRecordedCreateProjectResults(electronApp, [
        {
            success: false,
            parentRepositoryConfirmation: {
                root: repositoryRoot,
                isProjectRoot: false,
                kind: 'standard',
            },
        },
        {
            success: true,
            projectDetails,
            gitSetup: {
                status: 'existing-repository',
                root: repositoryRoot,
                isProjectRoot: false,
                kind: 'standard',
            },
            publication: { status: 'not-requested' },
        },
    ]);

    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectCreate').click();
    await mainPage.getByTestId('inputProjectName').fill('Late Parent Game');
    await mainPage
        .getByRole('checkbox', { name: 'Publish to GitHub' })
        .check();
    await expect(
        mainPage.getByText('Name looks available', { exact: true }),
    ).toBeVisible();
    await mainPage
        .getByRole('checkbox', { name: 'Edit now' })
        .uncheck();
    await mainPage.getByTestId('btnCreateProject').click();

    const confirmation = mainPage.getByRole('dialog', {
        name: 'This project will be inside another Git repository',
    });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Continue' }).click();

    const completion = mainPage.getByRole('dialog', {
        name: 'Project created',
    });
    await expect(completion).toBeVisible();
    await expect(completion).toContainText(repositoryRoot);
    await expect(
        mainPage.getByRole('dialog', {
            name: 'Could not publish to GitHub',
        }),
    ).toHaveCount(0);
    await completion.getByRole('button', { name: 'Done' }).click();
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
        GODOT_LAUNCHER_E2E_FIXTURES: '1',
        GODOT_LAUNCHER_E2E_HOME_DIR: homeDir,
        NODE_OPTIONS: existingNodeOptions
            ? `${existingNodeOptions} ${requireOverrideOption}`
            : requireOverrideOption,
    };
    delete environment.ELECTRON_RUN_AS_NODE;
    return environment;
}

/**
 * Replaces Create Project with a recorder and deterministic result.
 *
 * @param app - Electron app whose Create Project handler should be replaced.
 * @param result - Result returned after recording each request.
 * @returns A promise that ends when the handler is ready.
 */
async function stubRecordedCreateProjectResults(
    app: ElectronApplication,
    results: Parameters<typeof stubCreateProjectResult>[1][],
): Promise<void> {
    await app.evaluate(
        (
            { ipcMain },
            injectedResults: Parameters<typeof stubCreateProjectResult>[1][],
        ) => {
            const state = globalThis as typeof globalThis & {
                __parentRepositoryCreateProjectCalls?: unknown[][];
                __parentRepositoryCreateProjectResultIndex?: number;
            };
            state.__parentRepositoryCreateProjectCalls = [];
            state.__parentRepositoryCreateProjectResultIndex = 0;
            ipcMain.removeHandler('projects.createProject');
            ipcMain.handle(
                'projects.createProject',
                async (_event, ...args) => {
                    state.__parentRepositoryCreateProjectCalls?.push(args);
                    const index =
                        state.__parentRepositoryCreateProjectResultIndex ?? 0;
                    state.__parentRepositoryCreateProjectResultIndex =
                        index + 1;
                    return {
                        success: true,
                        data:
                            injectedResults[
                                Math.min(index, injectedResults.length - 1)
                            ],
                    };
                },
            );
        },
        results,
    );
}

/**
 * Delays one repository inspection so the form can change after submission.
 *
 * @param app - Electron app whose repository inspection should be replaced.
 * @param result - Repository inspection returned after the delay.
 * @param delayMs - Delay before returning the inspection.
 * @returns A promise that ends when the handler is ready.
 */
async function stubDelayedCreateProjectRepositoryInspection(
    app: ElectronApplication,
    result: Parameters<typeof stubCreateProjectRepositoryInspection>[1],
    delayMs: number,
): Promise<void> {
    await app.evaluate(
        (
            { ipcMain },
            input: {
                result: Parameters<
                    typeof stubCreateProjectRepositoryInspection
                >[1];
                delayMs: number;
            },
        ) => {
            const channel = 'projects.inspectCreateProjectRepository';
            ipcMain.removeHandler(channel);
            ipcMain.handle(channel, async () => {
                await new Promise((resolve) =>
                    setTimeout(resolve, input.delayMs),
                );
                return { success: true, data: input.result };
            });
        },
        { result, delayMs },
    );
}

/**
 * Reads the Create Project requests recorded by the parent-repository test.
 *
 * @param app - Electron app that owns the recorder.
 * @returns Recorded Create Project argument arrays.
 */
async function readRecordedCreateProjectCalls(
    app: ElectronApplication,
): Promise<unknown[][]> {
    return await app.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __parentRepositoryCreateProjectCalls?: unknown[][];
        };
        return state.__parentRepositoryCreateProjectCalls ?? [];
    });
}
