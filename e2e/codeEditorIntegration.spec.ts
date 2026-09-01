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
    prepareAppWithStubbedData,
    setAppLanguage,
    stubCodeEditorIntegrationSettings,
    stubGlobalGitIdentity,
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
    await setAppLanguage(mainPage, 'English');
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

test('Confirmation dialogs contain focus and restore it after Escape', async () => {
    const integrationRow = await openCodeEditorSettings();
    const enabledSwitch = integrationRow.getByRole('checkbox', {
        name: 'Enabled: Visual Studio Code',
    });
    await enabledSwitch.click();

    const dialog = mainPage.getByRole('dialog', {
        name: 'Disable Visual Studio Code?',
    });
    const cancelButton = dialog.getByRole('button', {
        name: 'Cancel',
        exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(cancelButton).toBeFocused();
    expect(await dialog.evaluate((element) => element.matches(':modal'))).toBe(
        true,
    );

    const projectsNavigation = mainPage.getByTestId('btnProjects');
    await projectsNavigation.evaluate((element) => element.focus());
    await expect(cancelButton).toBeFocused();

    await mainPage.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(enabledSwitch).toBeFocused();
    await expect(enabledSwitch).toBeChecked();
});

test('Alerts focus their safe action and remain modal', async () => {
    await stubRecordedIpcHandler(electronApp, {
        key: 'clearReleaseCache',
        channel: 'app.clearReleaseCache',
        data: undefined,
        error: 'Simulated cache refresh failure.',
    });
    await mainPage.getByTestId('btnSettings').click();
    await mainPage.getByTestId('tabInstalls').click();

    const refreshButton = mainPage.getByRole('button', {
        name: 'Refresh cache',
        exact: true,
    });
    await refreshButton.click();

    const dialog = mainPage.getByRole('dialog', {
        name: 'Unable to Refresh Cache',
    });
    const okButton = dialog.getByRole('button', { name: 'Ok', exact: true });
    await expect(dialog).toBeVisible();
    await expect(okButton).toBeFocused();
    expect(await dialog.evaluate((element) => element.matches(':modal'))).toBe(
        true,
    );

    await mainPage.getByTestId('btnProjects').evaluate((element) =>
        element.focus(),
    );
    await expect(okButton).toBeFocused();

    await mainPage.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
});

test('Git identity dialog returns to Create Project and blocks Escape while saving', async () => {
    const projectName = 'Modal Focus E2E Project';
    await stubGlobalGitIdentity(electronApp, { name: '', email: '' });
    await openCreateProject();

    await mainPage.getByTestId('inputProjectName').fill(projectName);
    const createButton = mainPage.getByTestId('btnCreateProject');
    await createButton.click();

    const warningDialog = mainPage.getByRole('dialog', {
        name: 'Git identity required',
    });
    const warningTitle = warningDialog.getByRole('heading', {
        name: 'Git identity required',
    });
    await expect(warningDialog).toBeVisible();
    await expect(warningTitle).toBeFocused();
    expect(
        await warningDialog.evaluate((element) => element.matches(':modal')),
    ).toBe(true);

    const projectNameInput = mainPage.getByTestId('inputProjectName');
    await projectNameInput.evaluate((element) => element.focus());
    await expect(warningTitle).toBeFocused();

    await mainPage.keyboard.press('Escape');
    await expect(warningDialog).toHaveCount(0);
    const createDrawer = mainPage.getByRole('dialog', {
        name: 'New Project',
    });
    await expect(createDrawer).toBeVisible();
    expect(
        await createDrawer.evaluate((element) =>
            element.contains(document.activeElement),
        ),
    ).toBe(true);

    await stubRecordedIpcHandler(electronApp, {
        key: 'saveIdentityPreset',
        channel: 'git.saveProjectIdentityPreset',
        data: {
            success: true,
            preset: {
                name: 'Modal User',
                email: 'modal@example.com',
                useForNewRepositories: true,
            },
        },
        pending: true,
    });
    await stubRecordedIpcHandler(electronApp, {
        key: 'createProjectAfterIdentity',
        channel: 'projects.createProject',
        data: {
            success: false,
            error: 'Captured Create Project request.',
        },
    });

    await createButton.click();
    await warningDialog
        .getByRole('button', { name: 'Add Git identity', exact: true })
        .click();
    const identityDialog = mainPage.getByRole('dialog', {
        name: 'Add Git identity',
    });
    await identityDialog.getByLabel('Name', { exact: true }).fill('Modal User');
    await identityDialog
        .getByLabel('Email', { exact: true })
        .fill('modal@example.com');
    await identityDialog
        .getByLabel('Save as default local identity', { exact: true })
        .check();
    const saveButton = identityDialog.getByRole('button', {
        name: 'Save and create project',
        exact: true,
    });
    await saveButton.click();
    await expect
        .poll(() => readRecordedIpcCalls(electronApp, 'saveIdentityPreset'))
        .toHaveLength(1);
    await expect(saveButton).toBeDisabled();

    await mainPage.keyboard.press('Escape');
    await expect(identityDialog).toBeVisible();

    await releaseRecordedIpcHandler(electronApp, 'saveIdentityPreset');
    await expect(identityDialog).toHaveCount(0);
    await expect
        .poll(() =>
            readRecordedIpcCalls(electronApp, 'createProjectAfterIdentity'),
        )
        .toHaveLength(1);
});

test('Create Project submits both an integration and explicit None', async () => {
    const projectName = 'Code Editor E2E Project';

    await stubGlobalGitIdentity(electronApp, {
        name: 'John Doe',
        email: 'john.doe@example.com',
    });
    await stubRecordedIpcHandler(electronApp, {
        key: 'createProject',
        channel: 'projects.createProject',
        data: {
            success: false,
            error: 'Captured Create Project request.',
        },
    });
    await openCreateProject();

    const projectNameInput = mainPage.getByTestId('inputProjectName');
    await projectNameInput.fill(projectName);
    await expect(projectNameInput).toHaveValue(projectName);

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
    await expect
        .poll(async () =>
            (await readRecordedIpcCalls(electronApp, 'createProject')).map(
                (args) => args[0] as string | undefined,
            ),
        )
        .toEqual([projectName]);

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
    await expect
        .poll(async () =>
            (await readRecordedIpcCalls(electronApp, 'createProject')).map(
                (args) => args[0] as string | undefined,
            ),
        )
        .toEqual([projectName, projectName]);
});

test('Project Settings preserves an unavailable selection and can save explicit None', async () => {
    await stubCodeEditorIntegrationSettings(electronApp, [
        SAMPLE_VSCODE_SETTINGS_NOT_FOUND,
    ]);
    await stubRecordedIpcHandler(electronApp, {
        key: 'projectCodeEditor',
        channel: 'projects.setProjectCodeEditor',
        data: {
            ...SAMPLE_PROJECT_PROTOTYPE,
            codeEditorId: null,
        },
    });

    await mainPage.getByTestId('btnProjects').click();
    const projectCard = mainPage.locator('[data-project-path]').filter({
        has: mainPage.getByText(SAMPLE_PROJECT_PROTOTYPE.name, { exact: true }),
    });
    await projectCard.getByTestId('btnProjectSettings').click();

    const dialog = mainPage.getByRole('dialog', {
        name: `${SAMPLE_PROJECT_PROTOTYPE.name} Settings`,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('tabProjectSettings_codeEditor').click();

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
        channel: 'projects.launchProject',
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
    const projectCard = mainPage.locator('[data-project-path]').filter({
        has: mainPage.getByText(SAMPLE_PROJECT_PROTOTYPE.name, { exact: true }),
    });
    await projectCard.getByTestId('btnEditProjectInGodot').click();

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

test('Tooltip stays inside the viewport without expanding settings overflow', async () => {
    const displayName =
        'Visual Studio Code with an intentionally long integration name';
    await stubCodeEditorIntegrationSettings(electronApp, [
        {
            ...SAMPLE_VSCODE_SETTINGS_AVAILABLE,
            integration: {
                ...SAMPLE_VSCODE_SETTINGS_AVAILABLE.integration,
                displayName,
            },
        },
    ]);
    const integrationRow = await openCodeEditorSettings();
    const scroller = integrationRow.locator(
        'xpath=ancestor::div[contains(@class, "overflow-y-auto")][1]',
    );
    const defaultButton = integrationRow.getByTestId(
        'btn-set-default-code-editor-vscode',
    );
    const readOverflow = () =>
        scroller.evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
        }));

    await expect
        .poll(async () => {
            const overflow = await readOverflow();
            return overflow.scrollWidth - overflow.clientWidth;
        })
        .toBe(0);

    const tooltipText = await defaultButton.getAttribute('aria-label');
    expect(tooltipText).toBeTruthy();
    await defaultButton.hover();
    const tooltip = mainPage.getByRole('tooltip');
    await mainPage.waitForTimeout(250);
    expect(await tooltip.count()).toBe(0);
    await mainPage.mouse.move(0, 0);
    await mainPage.waitForTimeout(350);
    expect(await tooltip.count()).toBe(0);

    await defaultButton.hover();
    await expect(tooltip).toHaveText(tooltipText as string);
    await expect(tooltip).toBeVisible();
    await expect
        .poll(async () =>
            await tooltip.evaluate(
                (element) => element.parentElement === document.body,
            ),
        )
        .toBe(true);

    const tooltipId = await tooltip.getAttribute('id');
    expect(tooltipId).toBeTruthy();
    await expect(defaultButton).toHaveAttribute(
        'aria-describedby',
        tooltipId as string,
    );
    await expect(tooltip).toHaveClass(/bg-neutral/);
    await expect(tooltip).toHaveClass(/text-neutral-content/);
    await mainPage.mouse.move(0, 0);
    await expect(tooltip).toHaveCount(0);
    await defaultButton.focus();
    await expect(tooltip).toBeVisible();

    const assertInsideViewport = async () => {
        const box = await tooltip.boundingBox();
        const viewport = mainPage.viewportSize();
        expect(box).not.toBeNull();
        expect(viewport).not.toBeNull();
        expect(box?.x).toBeGreaterThanOrEqual(8);
        expect(box?.y).toBeGreaterThanOrEqual(8);
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
            (viewport?.width ?? 0) - 8,
        );
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
            (viewport?.height ?? 0) - 8,
        );
        return box;
    };

    const initialBox = await assertInsideViewport();
    const initialTriggerBox = await defaultButton.boundingBox();
    await expect
        .poll(async () => {
            const overflow = await readOverflow();
            return overflow.scrollWidth - overflow.clientWidth;
        })
        .toBe(0);

    const scrollFixture = await scroller.evaluate((element) => {
        const spacer = document.createElement('div');
        spacer.dataset.tooltipScrollFixture = '';
        spacer.style.height = '1000px';
        spacer.style.minHeight = '1000px';
        element.append(spacer);
        element.style.setProperty('flex', '0 0 100px', 'important');
        element.style.setProperty('height', '100px', 'important');
        element.style.setProperty('min-height', '0', 'important');
        element.style.setProperty('max-height', '100px', 'important');
        element.scrollTop = 100;
        element.dispatchEvent(new Event('scroll'));
        return {
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
            scrollTop: element.scrollTop,
        };
    });
    expect(scrollFixture.scrollHeight).toBeGreaterThan(
        scrollFixture.clientHeight,
    );
    expect(scrollFixture.scrollTop).toBeGreaterThan(0);
    await expect
        .poll(async () => (await defaultButton.boundingBox())?.y)
        .not.toBe(initialTriggerBox?.y);
    await expect
        .poll(async () => (await tooltip.boundingBox())?.y)
        .not.toBe(initialBox?.y);
    await assertInsideViewport();
    await scroller.evaluate((element) => {
        element.scrollTop = 0;
        element
            .querySelector('[data-tooltip-scroll-fixture]')
            ?.remove();
        element.style.removeProperty('flex');
        element.style.removeProperty('height');
        element.style.removeProperty('min-height');
        element.style.removeProperty('max-height');
    });

    const beforeResizeX = (await tooltip.boundingBox())?.x;
    await mainPage.setViewportSize({ width: 1100, height: 600 });
    await expect
        .poll(async () => (await tooltip.boundingBox())?.x)
        .not.toBe(beforeResizeX);
    await assertInsideViewport();

    await mainPage.mouse.move(0, 0);
    await expect(tooltip).toBeVisible();
    await defaultButton.blur();
    await expect(tooltip).toHaveCount(0);

    await defaultButton.focus();
    await expect(tooltip).toBeVisible();
    await mainPage.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);

    await defaultButton.blur();
    await defaultButton.focus();
    await expect(tooltip).toBeVisible();
    await defaultButton.press('Enter');
    await expect(tooltip).toHaveCount(0);
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
    await disableDialog
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
    await expect(disableDialog).not.toBeVisible();

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
