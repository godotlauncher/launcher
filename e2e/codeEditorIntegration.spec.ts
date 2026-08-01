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
    createFixtureHome,
    openProjectActionsMenu,
    prepareAppWithStubbedData,
    stubCodeEditorIntegrationSettings,
} from './documentationScreenshots/runtime';
import {
    SAMPLE_PROJECT_PROTOTYPE,
    SAMPLE_VSCODE_SETTINGS_AVAILABLE,
    SAMPLE_VSCODE_SETTINGS_DISABLED,
    SAMPLE_VSCODE_SETTINGS_NOT_FOUND,
    SAMPLE_VSCODE_SETTINGS_OVERRIDDEN,
} from './documentationScreenshots/sampleData';
import { getMainWindow } from './splashscreen/getMainWindow';

let electronApp: ElectronApplication;
let mainPage: Page;
let fixtureHome: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    electronApp = await _electron.launch({
        args: ['.'],
        env: createIsolatedLaunchEnvironment(fixtureHome),
    });
    mainPage = await getMainWindow(electronApp);
});

test.beforeEach(async () => {
    await prepareAppWithStubbedData(mainPage, electronApp);
    const closeCreateButton = mainPage.getByTestId('btnCloseCreateProject');
    if (await closeCreateButton.isVisible().catch(() => false)) {
        await closeCreateButton.click();
        await expect(closeCreateButton).not.toBeVisible();
    }
    await stubCodeEditorIntegrationSettings(electronApp, [
        SAMPLE_VSCODE_SETTINGS_AVAILABLE,
    ]);
});

test.afterAll(async () => {
    await electronApp.close();
    await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('SelectField supports keyboard navigation and announces its selected code editor', async () => {
    await openCreateProject();

    const trigger = mainPage.getByTestId('selectCreateProjectCodeEditor');
    await expect(trigger).toHaveText('Visual Studio Code');
    await expect(trigger).toHaveAccessibleName(
        'Code Editor: Visual Studio Code',
    );

    await trigger.focus();
    await trigger.press('Space');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const noneOption = mainPage.getByRole('option', {
        name: 'None',
        exact: true,
    });
    const vscodeOption = mainPage.getByRole('option', {
        name: 'Visual Studio Code',
        exact: true,
    });

    await expect(vscodeOption).toBeFocused();
    await expect(vscodeOption).toHaveAttribute('aria-selected', 'true');
    await expect(noneOption).toHaveAttribute('aria-selected', 'false');

    await mainPage.keyboard.press('Home');
    await expect(noneOption).toBeFocused();
    await mainPage.keyboard.press('ArrowDown');
    await expect(vscodeOption).toBeFocused();
    await mainPage.keyboard.press('ArrowUp');
    await expect(noneOption).toBeFocused();
    await mainPage.keyboard.press('End');
    await expect(vscodeOption).toBeFocused();

    await mainPage.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toBeFocused();

    await trigger.press('Enter');
    await mainPage.keyboard.press('Home');
    await mainPage.keyboard.press('Enter');
    await expect(trigger).toHaveText('None');
    await expect(trigger).toHaveAccessibleName('Code Editor: None');

    await trigger.press('Space');
    await mainPage.keyboard.press('End');
    await mainPage.keyboard.press('Tab');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).not.toBeFocused();
});

test('Create Project submits both an integration and explicit None', async () => {
    await stubRecordedIpcHandler(electronApp, {
        key: 'createProject',
        channel: 'app.createProject',
        data: {
            success: false,
            error: 'Captured Create Project request.',
        },
    });
    await openCreateProject();

    await mainPage
        .getByTestId('inputProjectName')
        .fill('Code-Editor-E2E-Project');

    const trigger = mainPage.getByTestId('selectCreateProjectCodeEditor');
    await expect(trigger).toHaveText('Visual Studio Code');
    await mainPage.getByTestId('btnCreateProject').click();
    await expect
        .poll(async () =>
            (await readRecordedIpcCalls(electronApp, 'createProject')).map(
                (args) => args[3] as string | null | undefined,
            ),
        )
        .toEqual(['vscode']);

    await trigger.click();
    await mainPage
        .getByRole('option', { name: 'None', exact: true })
        .click();
    await expect(trigger).toHaveText('None');
    await mainPage.getByTestId('btnCreateProject').click();

    await expect
        .poll(async () =>
            (await readRecordedIpcCalls(electronApp, 'createProject')).map(
                (args) => args[3] as string | null | undefined,
            ),
        )
        .toEqual(['vscode', null]);
});

test('Project Settings preserves an unavailable selection and can save explicit None', async () => {
    await stubCodeEditorIntegrationSettings(electronApp, [
        SAMPLE_VSCODE_SETTINGS_NOT_FOUND,
    ]);
    await stubRecordedIpcHandler(electronApp, {
        key: 'projectCodeEditor',
        channel: 'app.setProjectCodeEditor',
        data: {
            ...SAMPLE_PROJECT_PROTOTYPE,
            codeEditorId: null,
        },
    });

    await mainPage.getByTestId('btnProjects').click();
    await openProjectActionsMenu(mainPage, SAMPLE_PROJECT_PROTOTYPE.name);
    await mainPage
        .getByRole('button', { name: 'Project Settings' })
        .click();

    const dialog = mainPage.getByRole('dialog', {
        name: `${SAMPLE_PROJECT_PROTOTYPE.name} Settings`,
    });
    await expect(dialog).toBeVisible();

    const trigger = dialog.getByTestId('selectProjectCodeEditor');
    await expect(trigger).toHaveText('Visual Studio Code (Not found)');
    await expect(trigger).toHaveAccessibleName(
        'Code Editor: Visual Studio Code (Not found)',
    );

    await trigger.click();
    await expect(
        mainPage.getByRole('option', {
            name: 'Visual Studio Code (Not found)',
            exact: true,
        }),
    ).toBeDisabled();
    await mainPage
        .getByRole('option', { name: 'None', exact: true })
        .click();

    const updateButton = dialog.getByRole('button', {
        name: 'Update',
        exact: true,
    });
    await expect(updateButton).toBeEnabled();
    await updateButton.click();

    await expect
        .poll(async () =>
            (
                await readRecordedIpcCalls(
                    electronApp,
                    'projectCodeEditor',
                )
            ).map((args) => args[1] as string | null | undefined),
        )
        .toEqual([null]);
    await expect(dialog).not.toBeVisible();
});

test('Project launch warns when its selected code editor is unavailable', async () => {
    await stubRecordedIpcHandler(electronApp, {
        key: 'projectLaunch',
        channel: 'app.launchProject',
        data: {
            launched: false,
            reason: 'code_editor_unavailable',
            integration: {
                id: 'vscode',
                displayName: 'Visual Studio Code',
                capabilities: { dotnet: true },
            },
        },
    });

    await mainPage.getByTestId('btnProjects').click();
    await mainPage
        .getByRole('button', {
            name: SAMPLE_PROJECT_PROTOTYPE.name,
            exact: true,
        })
        .click();

    const warningDialog = mainPage.getByRole('dialog', {
        name: 'Visual Studio Code was not found',
    });
    await expect(warningDialog).toBeVisible();
    await expect(warningDialog).toContainText(
        'Godot can still launch, but opening scripts in this editor may fail.',
    );

    await expect(warningDialog.getByRole('button')).toHaveText([
        'Launch anyway',
        'Disable & Launch',
        'Open settings',
        'Cancel',
    ]);
    await warningDialog
        .getByRole('button', { name: 'Launch anyway', exact: true })
        .click();
    await expect(warningDialog).not.toBeVisible();
    await expect
        .poll(async () =>
            (await readRecordedIpcCalls(electronApp, 'projectLaunch')).map(
                (args) => args[1],
            ),
        )
        .toEqual([
            undefined,
            {
                allowMissingCodeEditor: true,
            },
        ]);
});

test('Code Editor settings lock overlapping actions and recover from a failed update', async () => {
    await stubRecordedIpcHandler(electronApp, {
        key: 'integrationUpdate',
        channel: 'codeEditorIntegration.updateIntegrationSettings',
        data: SAMPLE_VSCODE_SETTINGS_AVAILABLE,
        pending: true,
        error: 'Simulated integration update failure.',
    });
    await stubRecordedIpcHandler(electronApp, {
        key: 'integrationRescan',
        channel: 'codeEditorIntegration.rescanIntegration',
        data: SAMPLE_VSCODE_SETTINGS_AVAILABLE,
    });
    const integrationRow = await openCodeEditorSettings();

    const enabledSwitch = integrationRow.getByRole('checkbox', {
        name: 'Enabled: Visual Studio Code',
    });
    const defaultButton = integrationRow.getByTestId(
        'btn-set-default-code-editor-vscode',
    );
    await expect(defaultButton).toHaveAccessibleName(
        'Set as default: Visual Studio Code',
    );
    const editButton = integrationRow.getByRole('button', {
        name: 'Edit: Visual Studio Code',
    });
    const rescanButton = integrationRow.getByTestId(
        'btn-rescan-code-editor-vscode',
    );
    await expect(rescanButton).toHaveAccessibleName(
        'Rescan: Visual Studio Code',
    );
    await rescanButton.click();
    await expect
        .poll(() => readRecordedIpcCalls(electronApp, 'integrationRescan'))
        .toHaveLength(1);

    await enabledSwitch.click();
    const disableDialog = mainPage.getByRole('dialog', {
        name: 'Disable Visual Studio Code?',
    });
    await expect(disableDialog).toBeVisible();
    const disableDialogLayer = await disableDialog.evaluate((element) =>
        Number.parseInt(
            window.getComputedStyle(element.parentElement as HTMLElement)
                .zIndex,
            10,
        ),
    );
    const drawerLayer = await drawer.evaluate((element) =>
        Number.parseInt(
            window.getComputedStyle(element.parentElement as HTMLElement)
                .zIndex,
            10,
        ),
    );
    expect(disableDialogLayer).toBeGreaterThan(drawerLayer);
    await expect(disableDialog).toContainText(
        'Configured projects: 3. .NET projects: 1.',
    );
    await expect(disableDialog).toContainText(
        'Existing projects will keep this editor selection',
    );
    await expect(
        readRecordedIpcCalls(electronApp, 'integrationUpdate'),
    ).resolves.toHaveLength(0);

    await disableDialog
        .getByRole('button', { name: 'Disable', exact: true })
        .click();
    await expect(integrationRow.getByRole('status')).toBeVisible();
    await expect(enabledSwitch).toBeDisabled();
    await expect(defaultButton).toBeDisabled();
    await expect(editButton).toBeDisabled();
    await expect
        .poll(() => readRecordedIpcCalls(electronApp, 'integrationUpdate'))
        .toHaveLength(1);

    await releaseRecordedIpcHandler(electronApp, 'integrationUpdate');
    await expect(integrationRow.getByRole('alert')).toHaveText(
        'Visual Studio Code: Unable to save code editor settings.',
    );
    await expect(enabledSwitch).toBeEnabled();
    await expect(enabledSwitch).toBeChecked();

    await stubRecordedIpcHandler(electronApp, {
        key: 'defaultIntegration',
        channel: 'codeEditorIntegration.setDefaultIntegration',
        data: [{ ...SAMPLE_VSCODE_SETTINGS_AVAILABLE, isDefault: true }],
    });
    await defaultButton.click();
    await expect(defaultButton).toHaveAttribute('aria-pressed', 'true');
    await expect(defaultButton).toHaveAccessibleName(
        'Default code editor: Visual Studio Code',
    );
    await expect(integrationRow.getByRole('alert')).toHaveCount(0);
    await expect
        .poll(async () =>
            (
                await readRecordedIpcCalls(
                    electronApp,
                    'defaultIntegration',
                )
            ).map((args) => String(args[0])),
        )
        .toEqual(['vscode']);
});

test('Code Editor drawer resets overrides and stays locked while saving', async () => {
    await stubCodeEditorIntegrationSettings(electronApp, [
        SAMPLE_VSCODE_SETTINGS_OVERRIDDEN,
    ]);
    await stubRecordedIpcHandler(electronApp, {
        key: 'integrationUpdate',
        channel: 'codeEditorIntegration.updateIntegrationSettings',
        data: SAMPLE_VSCODE_SETTINGS_AVAILABLE,
        pending: true,
    });
    const integrationRow = await openCodeEditorSettings();

    await integrationRow
        .getByRole('button', { name: 'Edit: Visual Studio Code' })
        .click();

    const dialog = mainPage.getByRole('dialog', {
        name: 'Visual Studio Code settings',
    });
    await expect(dialog).toBeVisible();

    await dialog
        .getByRole('button', {
            name: 'Use automatic detection',
            exact: true,
        })
        .click();
    await dialog
        .getByRole('button', { name: 'Reset to default', exact: true })
        .click();
    await expect(dialog.locator('#codeEditorExecFlags')).toHaveValue(
        SAMPLE_VSCODE_SETTINGS_AVAILABLE.defaultExecFlags,
    );

    await dialog
        .getByRole('button', { name: 'Save', exact: true })
        .click();
    await expect(
        dialog.getByRole('button', { name: 'Close drawer' }),
    ).toBeDisabled();
    await expect(
        dialog.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeDisabled();
    await expect(
        dialog.getByRole('checkbox', { name: 'Enabled', exact: true }),
    ).toBeDisabled();
    await expect(dialog.locator('#codeEditorCustomPath')).toBeDisabled();
    await expect(dialog.locator('#codeEditorExecFlags')).toBeDisabled();

    await mainPage.keyboard.press('Escape');
    await expect(dialog).toBeVisible();

    await releaseRecordedIpcHandler(electronApp, 'integrationUpdate');
    await expect(dialog).not.toBeVisible();
    await expect
        .poll(async () =>
            (
                await readRecordedIpcCalls(
                    electronApp,
                    'integrationUpdate',
                )
            ).map((args) => ({
                integrationId: String(args[0]),
                settings: args[1],
            })),
        )
        .toEqual([
            {
                integrationId: 'vscode',
                settings: {
                    enabled: true,
                    customPath: null,
                    execFlagsOverride: null,
                },
            },
        ]);
});

test('Code Editor drawer confirms disabling when settings are saved', async () => {
    await stubCodeEditorIntegrationSettings(electronApp, [
        SAMPLE_VSCODE_SETTINGS_AVAILABLE,
    ]);
    await stubRecordedIpcHandler(electronApp, {
        key: 'integrationUpdate',
        channel: 'codeEditorIntegration.updateIntegrationSettings',
        data: SAMPLE_VSCODE_SETTINGS_DISABLED,
    });
    const integrationRow = await openCodeEditorSettings();

    await integrationRow
        .getByRole('button', { name: 'Edit: Visual Studio Code' })
        .click();

    const drawer = mainPage.getByRole('dialog', {
        name: 'Visual Studio Code settings',
    });
    const enabledSwitch = drawer.getByRole('checkbox', {
        name: 'Enabled',
        exact: true,
    });
    await enabledSwitch.uncheck();
    await drawer
        .getByRole('button', { name: 'Save', exact: true })
        .click();

    const disableDialog = mainPage.getByRole('dialog', {
        name: 'Disable Visual Studio Code?',
    });
    await expect(disableDialog).toBeVisible();
    await expect(disableDialog).toContainText(
        'Configured projects: 3. .NET projects: 1.',
    );
    await expect(
        readRecordedIpcCalls(electronApp, 'integrationUpdate'),
    ).resolves.toHaveLength(0);

    await disableDialog
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
    await expect(disableDialog).not.toBeVisible();
    await expect(drawer).toBeVisible();
    await expect(enabledSwitch).not.toBeChecked();

    await drawer
        .getByRole('button', { name: 'Save', exact: true })
        .click();
    await mainPage
        .getByRole('dialog', { name: 'Disable Visual Studio Code?' })
        .getByRole('button', { name: 'Disable', exact: true })
        .click();

    await expect(drawer).not.toBeVisible();
    await expect
        .poll(async () =>
            (
                await readRecordedIpcCalls(
                    electronApp,
                    'integrationUpdate',
                )
            ).map((args) => ({
                integrationId: String(args[0]),
                settings: args[1],
            })),
        )
        .toEqual([
            {
                integrationId: 'vscode',
                settings: {
                    enabled: false,
                    customPath: null,
                    execFlagsOverride: null,
                },
            },
        ]);
});

test('Code Editor file-dialog waiting overlay stays above the settings drawer', async () => {
    await stubRecordedIpcHandler(electronApp, {
        key: 'fileDialog',
        channel: 'app.openFileDialog',
        data: {
            canceled: true,
            filePaths: [],
            bookmarks: [],
        },
        pending: true,
    });
    const integrationRow = await openCodeEditorSettings();
    await integrationRow
        .getByRole('button', { name: 'Edit: Visual Studio Code' })
        .click();

    const dialog = mainPage.getByRole('dialog', {
        name: 'Visual Studio Code settings',
    });
    await dialog
        .getByRole('button', { name: 'Browse', exact: true })
        .click();

    const overlayMessage = mainPage.getByText(
        'Waiting for file selection...',
        { exact: true },
    );
    await expect(overlayMessage).toBeVisible();
    const overlay = overlayMessage.locator('..');
    const overlayZIndex = await overlay.evaluate((element) =>
        Number.parseInt(getComputedStyle(element).zIndex, 10),
    );
    const drawerZIndex = await dialog.evaluate((element) =>
        Number.parseInt(
            getComputedStyle(element.parentElement as HTMLElement).zIndex,
            10,
        ),
    );
    expect(overlayZIndex).toBeGreaterThan(drawerZIndex);

    await releaseRecordedIpcHandler(electronApp, 'fileDialog');
    await expect(overlayMessage).not.toBeVisible();
    await expect(dialog).toBeVisible();
});

async function openCreateProject() {
    await mainPage.getByTestId('btnProjects').click();
    await mainPage.getByTestId('btnProjectCreate').click();
    await expect(
        mainPage.getByTestId('selectCreateProjectCodeEditor'),
    ).toBeVisible();
}

async function openCodeEditorSettings() {
    await mainPage.getByTestId('btnSettings').click();
    await mainPage.getByTestId('tabCodeEditors').click();
    const integrationRow = mainPage.getByTestId(
        'code-editor-integration-vscode',
    );
    await expect(integrationRow).toBeVisible();
    return integrationRow;
}

function createIsolatedLaunchEnvironment(homeDir: string) {
    const overrideHomeScript = path.resolve(
        process.cwd(),
        'e2e',
        'support',
        'overrideHome.cjs',
    );
    const existingNodeOptions = process.env.NODE_OPTIONS?.trim();
    const requireOverrideOption = `--require "${overrideHomeScript}"`;
    const launchEnv: Record<string, string> = {
        ...Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
            ),
        ),
        NODE_ENV: 'development',
        APPDATA: path.join(homeDir, 'AppData', 'Roaming'),
        LOCALAPPDATA: path.join(homeDir, 'AppData', 'Local'),
        GODOT_LAUNCHER_DOCS_SCREENSHOTS: '1',
        GODOT_LAUNCHER_DOCS_HOME_DIR: homeDir,
        NODE_OPTIONS: existingNodeOptions
            ? `${existingNodeOptions} ${requireOverrideOption}`
            : requireOverrideOption,
    };
    delete launchEnv.ELECTRON_RUN_AS_NODE;
    return launchEnv;
}

type RecordedIpcHandlerOptions = {
    key: string;
    channel: string;
    data: unknown;
    pending?: boolean;
    error?: string;
};

async function stubRecordedIpcHandler(
    app: ElectronApplication,
    options: RecordedIpcHandlerOptions,
) {
    await app.evaluate(
        (
            { ipcMain },
            injected: RecordedIpcHandlerOptions,
        ) => {
            const state = globalThis as typeof globalThis & {
                __codeEditorE2EHandlers?: Record<
                    string,
                    { calls: unknown[][]; release?: () => void }
                >;
            };
            const handlers = (state.__codeEditorE2EHandlers ??= {});
            handlers[injected.key] = { calls: [] };
            ipcMain.removeHandler(injected.channel);
            ipcMain.handle(injected.channel, async (_event, ...args) => {
                const handler = handlers[injected.key];
                handler.calls.push(args);

                if (injected.pending) {
                    await new Promise<void>((resolve) => {
                        handler.release = resolve;
                    });
                }

                return injected.error
                    ? {
                          success: false,
                          error: {
                              type: 'Error',
                              message: injected.error,
                          },
                      }
                    : { success: true, data: injected.data };
            });
        },
        options,
    );
}

async function readRecordedIpcCalls(
    app: ElectronApplication,
    key: string,
): Promise<unknown[][]> {
    return await app.evaluate(
        (_electron, injectedKey: string) => {
            const state = globalThis as typeof globalThis & {
                __codeEditorE2EHandlers?: Record<
                    string,
                    { calls: unknown[][] }
                >;
            };
            return state.__codeEditorE2EHandlers?.[injectedKey]?.calls ?? [];
        },
        key,
    );
}

async function releaseRecordedIpcHandler(
    app: ElectronApplication,
    key: string,
) {
    await app.evaluate((_electron, injectedKey: string) => {
        const state = globalThis as typeof globalThis & {
            __codeEditorE2EHandlers?: Record<
                string,
                { release?: () => void }
            >;
        };
        const release =
            state.__codeEditorE2EHandlers?.[injectedKey]?.release;
        if (!release) {
            throw new Error(`No pending IPC handler found for ${injectedKey}.`);
        }
        release();
    }, key);
}
