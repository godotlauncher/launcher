import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFixtureHome, setAppLanguage } from './support/e2e-fixture-runtime';
import { getMainWindow } from './splashscreen/getMainWindow';

type CredentialStorageStatus = {
    startupPreference: 'automatic' | 'gnome-libsecret';
    selectionSource: 'automatic' | 'preference' | 'command-line';
    requestedBackend: string | null;
    activeBackend: string;
    available: boolean;
};

let electronApp: ElectronApplication;
let mainPage: Page;
let fixtureHome: string;

test.setTimeout(60000);

test.beforeEach(async () => {
    fixtureHome = await createFixtureHome();
    await launchApp();
});

test.afterEach(async () => {
    await electronApp?.close();
    await fs.rm(fixtureHome, { recursive: true, force: true });
});

test('confirms a save, disables modal actions while pending, and shows restart guidance', async () => {
    await stubCredentialStorageHandlers({
        platform: 'linux',
        status: automaticStatus(),
        recordPreferenceSaves: true,
        pendingPreferenceSave: true,
    });
    await openConnections();

    const choice = mainPage.getByLabel(/Saved choice:/);
    await expect(choice).toHaveValue('automatic');
    await choice.selectOption('gnome-libsecret');
    await mainPage.getByRole('button', { name: 'Save choice' }).click();

    const confirmation = mainPage.getByRole('dialog', {
        name: 'Change credential storage?',
    });
    await expect(confirmation).toContainText(
        'Save Secret Service as your credential storage choice?',
    );
    await expect(confirmation).toContainText(
        'Changing this choice may require reconnecting GitHub. Existing credentials will be kept.',
    );
    await confirmation.getByRole('button', { name: 'Save choice' }).click();
    await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await expect(
        confirmation.getByRole('button', { name: 'Saving...' }),
    ).toBeDisabled();

    await releasePreferenceSave();
    await expect.poll(readPreferenceSaveCalls).toHaveLength(1);
    expect((await readPreferenceSaveCalls())[0]?.[0]).toMatchObject({
        linux_credential_storage: 'gnome-libsecret',
    });
    const success = mainPage.getByRole('dialog', {
        name: 'Credential storage choice saved',
    });
    await expect(success).toContainText(
        'Fully quit Godot Launcher, including its system tray process, and open it again to apply the saved choice.',
    );
    await success.getByRole('button', { name: 'Not now' }).click();
    await expect(
        mainPage.getByText(
            'The saved choice differs from the choice used at startup. A full restart is required.',
        ),
    ).toBeVisible();
});

test('cancelling or escaping the confirmation leaves the saved choice untouched', async () => {
    await stubCredentialStorageHandlers({
        platform: 'linux',
        status: automaticStatus(),
        recordPreferenceSaves: true,
    });
    await openConnections();

    const choice = mainPage.getByLabel(/Saved choice:/);
    await choice.selectOption('gnome-libsecret');
    await mainPage.getByRole('button', { name: 'Save choice' }).click();
    const confirmation = mainPage.getByRole('dialog', {
        name: 'Change credential storage?',
    });
    await confirmation.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmation).toHaveCount(0);

    await mainPage.getByRole('button', { name: 'Save choice' }).click();
    await expect(confirmation).toBeVisible();
    await mainPage.keyboard.press('Escape');

    expect(await readPreferenceSaveCalls()).toEqual([]);
    await expect(mainPage.getByText('Saved choice: Automatic')).toBeVisible();
});

test('keeps the saved choice when confirmed saving fails', async () => {
    await stubCredentialStorageHandlers({
        platform: 'linux',
        status: automaticStatus(),
        preferenceSaveError: 'Fixture preference write failure',
    });
    await openConnections();

    await mainPage.getByLabel(/Saved choice:/).selectOption('gnome-libsecret');
    await mainPage.getByRole('button', { name: 'Save choice' }).click();
    await mainPage
        .getByRole('dialog', { name: 'Change credential storage?' })
        .getByRole('button', { name: 'Save choice' })
        .click();

    const failure = mainPage.getByRole('dialog', {
        name: 'Could not save credential storage',
    });
    await expect(failure).toBeVisible();
    await failure.getByRole('button', { name: 'Ok' }).click();
    await expect(mainPage.getByText('Saved choice: Automatic')).toBeVisible();
    await expect(mainPage.getByLabel(/Saved choice:/)).toHaveValue('automatic');
});

test('shows override diagnostics inline while leaving an unavailable selector operable', async () => {
    await stubCredentialStorageHandlers({
        platform: 'linux',
        status: {
            startupPreference: 'automatic',
            selectionSource: 'command-line',
            requestedBackend: 'gnome-libsecret',
            activeBackend: 'basic_text',
            available: false,
        },
    });
    await openConnections();

    await expect(
        mainPage.getByText('A launch flag controls credential storage for this session (gnome-libsecret). Remove the flag before restarting if you want to use the saved choice.'),
    ).toBeVisible();
    await expect(mainPage.getByLabel(/Saved choice:/)).toBeEnabled();
    const details = mainPage.getByRole('region', { name: 'Credential storage Linux only' });
    await expect(details).toContainText(
        'A launch flag controls credential storage for this session (gnome-libsecret). Remove the flag before restarting if you want to use the saved choice.',
    );
    await expect(details).toContainText(
        'Secret Service was requested but is not the active backend. Check that a compatible Secret Service keyring is running, then fully restart Godot Launcher.',
    );
    await expect(mainPage.getByRole('button', { name: 'Storage details' })).toHaveCount(0);
});

test('saving the startup choice reports that no restart is needed', async () => {
    await stubCredentialStorageHandlers({
        platform: 'linux',
        status: automaticStatus(),
        recordPreferenceSaves: true,
    });
    await openConnections();

    const choice = mainPage.getByLabel(/Saved choice:/);
    await choice.selectOption('gnome-libsecret');
    await mainPage.getByRole('button', { name: 'Save choice' }).click();
    await mainPage
        .getByRole('dialog', { name: 'Change credential storage?' })
        .getByRole('button', { name: 'Save choice' })
        .click();
    await mainPage
        .getByRole('dialog', { name: 'Credential storage choice saved' })
        .getByRole('button', { name: 'Not now' })
        .click();

    await choice.selectOption('automatic');
    await mainPage.getByRole('button', { name: 'Save choice' }).click();
    await mainPage
        .getByRole('dialog', { name: 'Change credential storage?' })
        .getByRole('button', { name: 'Save choice' })
        .click();
    const success = mainPage.getByRole('dialog', {
        name: 'Credential storage choice saved',
    });
    await expect(success).toContainText(
        'The saved choice matches the choice used at startup. No restart is needed for this change.',
    );
    await success.getByRole('button', { name: 'Ok' }).click();
    await expect(mainPage.getByText('The saved choice differs from the choice used at startup. A full restart is required.')).toHaveCount(0);
});

test('hides credential storage controls on Windows', async () => {
    await stubCredentialStorageHandlers({
        platform: 'win32',
        status: null,
    });
    await openConnections();

    await expect(
        mainPage.getByRole('heading', { name: 'Credential storage' }),
    ).toHaveCount(0);
});

test('hides credential storage controls on macOS', async () => {
    await stubCredentialStorageHandlers({
        platform: 'darwin',
        status: null,
    });
    await openConnections();

    await expect(
        mainPage.getByRole('heading', { name: 'Credential storage' }),
    ).toHaveCount(0);
});

test('restarts through the existing bridge after saving the Linux preference', async () => {
    await stubCredentialStorageHandlers({
        platform: 'linux',
        status: automaticStatus(),
        recordPreferenceSaves: true,
    });
    await openConnections();
    await expect(mainPage.getByRole('heading', { name: 'Credential storage Linux only' })).toBeVisible();
    await mainPage.getByLabel(/Saved choice:/).selectOption('gnome-libsecret');
    await mainPage.getByRole('button', { name: 'Save choice' }).click();
    await mainPage.getByRole('dialog').getByRole('button', { name: 'Save choice' }).click();
    await expect(mainPage.getByRole('dialog', { name: 'Credential storage choice saved' })).toBeVisible();
    expect((await readPreferenceSaveCalls())[0]?.[0]).toMatchObject({
        linux_credential_storage: 'gnome-libsecret',
    });
    await electronApp.evaluate(({ ipcMain }) => {
        const state = globalThis as typeof globalThis & { restartCalls?: number };
        state.restartCalls = 0;
        ipcMain.removeHandler('app.relaunchApp');
        ipcMain.handle('app.relaunchApp', () => {
            state.restartCalls = (state.restartCalls ?? 0) + 1;
            return { success: true };
        });
    });
    await mainPage.getByRole('dialog').getByRole('button', { name: 'Restart now' }).click();
    await expect.poll(() => electronApp.evaluate(() =>
        (globalThis as typeof globalThis & { restartCalls?: number }).restartCalls,
    )).toBe(1);

});

test('shows a restart failure modal and keeps the saved preference', async () => {
    await stubCredentialStorageHandlers({ platform: 'linux', status: automaticStatus() });
    await electronApp.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler('app.relaunchApp');
        ipcMain.handle('app.relaunchApp', () => { throw new Error('Restart failed'); });
    });
    await openConnections();
    await mainPage.getByLabel(/Saved choice:/).selectOption('gnome-libsecret');
    await mainPage.getByRole('button', { name: 'Save choice' }).click();
    await mainPage.getByRole('dialog').getByRole('button', { name: 'Save choice' }).click();
    await mainPage.getByRole('dialog').getByRole('button', { name: 'Restart now' }).click();
    const failure = mainPage.getByRole('dialog', { name: 'Could not restart Godot Launcher' });
    await expect(failure).toContainText('Your choice is saved. Quit Godot Launcher completely and reopen it to apply the saved choice.');
    await failure.getByRole('button', { name: 'Ok' }).click();
    await expect(mainPage.getByRole('dialog')).toHaveCount(0);
    await expect(mainPage.getByLabel(/Saved choice:/)).toHaveValue('gnome-libsecret');
    await expect(mainPage.getByText('The saved choice differs from the choice used at startup. A full restart is required.')).toBeVisible();
});

for (const available of [true, false]) {
    test(`keeps storage collapsed when available=${available}`, async () => {
        await stubCredentialStorageHandlers({
            platform: 'linux', status: {...automaticStatus(), available},
        });
        await openConnections(false);
        const toggle = mainPage.getByRole('button', { name: 'Credential storage', exact: true });
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(mainPage.getByLabel(/Saved choice:/)).toBeHidden();
        await expect(mainPage.getByRole('status').filter({hasText: available ? 'Secure storage is available.' : 'Secure storage is unavailable.'}).first()).toBeVisible();
        if (available) await toggle.click();
        else await mainPage.getByRole('button', { name: 'Configure storage' }).click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expect(mainPage.getByLabel(/Saved choice:/)).toBeVisible();
        await toggle.click();
        await expect(mainPage.getByLabel(/Saved choice:/)).toBeHidden();
    });
}

/** Launches a new isolated Electron application for the current fixture home. */
async function launchApp(): Promise<void> {
    electronApp = await _electron.launch({
        args: [
            '.',
            `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`,
        ],
        env: createIsolatedLaunchEnvironment(fixtureHome),
    });
    mainPage = await getMainWindow(electronApp);
    await setAppLanguage(mainPage, 'English', false);
}

/**
 * Opens Connections and optionally expands credential storage.
 * @param expand - Whether to open the advanced storage controls.
 */
async function openConnections(expand = true): Promise<void> {
    await mainPage.getByTestId('btnSettings').click();
    await mainPage.getByTestId('tabConnections').click();
    await expect(mainPage.getByTestId('tabConnections')).toHaveAttribute(
        'aria-selected',
        'true',
    );
    const toggle = mainPage.getByRole('button', { name: 'Credential storage', exact: true });
    if (expand && await toggle.isVisible()) await toggle.click();
}

/** Returns a healthy status selected automatically at application startup. */
function automaticStatus(): CredentialStorageStatus {
    return {
        startupPreference: 'automatic',
        selectionSource: 'automatic',
        requestedBackend: null,
        activeBackend: 'gnome_libsecret',
        available: true,
    };
}

type CredentialStorageHandlerOptions = {
    platform: string;
    status: CredentialStorageStatus | null;
    recordPreferenceSaves?: boolean;
    pendingPreferenceSave?: boolean;
    preferenceSaveError?: string;
};

/**
 * Replaces platform, storage-status, and optional preference-save IPC handlers.
 *
 * @param options - Linux fixture status and save-handler behaviour.
 */
async function stubCredentialStorageHandlers(
    options: CredentialStorageHandlerOptions,
): Promise<void> {
    await electronApp.evaluate(
        ({ ipcMain }, injected: CredentialStorageHandlerOptions) => {
            const state = globalThis as typeof globalThis & {
                __credentialStorageE2E?: {
                    preferenceSaveCalls: unknown[][];
                    releasePreferenceSave?: () => void;
                };
            };
            state.__credentialStorageE2E = { preferenceSaveCalls: [] };

            ipcMain.removeHandler('app.getPlatform');
            ipcMain.handle('app.getPlatform', () => ({
                success: true,
                data: injected.platform,
            }));

            ipcMain.removeHandler('app.getCredentialStorageStatus');
            ipcMain.handle('app.getCredentialStorageStatus', () => ({
                success: true,
                data: injected.status,
            }));

            if (injected.preferenceSaveError) {
                ipcMain.removeHandler('app.setUserPreferences');
                ipcMain.handle('app.setUserPreferences', () => {
                    throw new Error(injected.preferenceSaveError);
                });
                return;
            }

            if (!injected.recordPreferenceSaves) return;
            const fixtureIpc = ipcMain as typeof ipcMain & {
                _invokeHandlers: Map<string, (...args: unknown[]) => unknown>;
            };
            const handler = fixtureIpc._invokeHandlers.get(
                'app.setUserPreferences',
            );
            if (!handler) {
                throw new Error('Missing app.setUserPreferences handler.');
            }
            ipcMain.removeHandler('app.setUserPreferences');
            ipcMain.handle('app.setUserPreferences', async (event, ...args) => {
                state.__credentialStorageE2E?.preferenceSaveCalls.push(args);
                if (injected.pendingPreferenceSave) {
                    await new Promise<void>((resolve) => {
                        state.__credentialStorageE2E!.releasePreferenceSave =
                            resolve;
                    });
                }
                return handler(event, ...args);
            });
        },
        options,
    );
    await mainPage.reload();
    await setAppLanguage(mainPage, 'English', false);
}

/** Returns preference writes observed by the IPC recording wrapper. */
async function readPreferenceSaveCalls(): Promise<unknown[][]> {
    return await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __credentialStorageE2E?: { preferenceSaveCalls: unknown[][] };
        };
        return state.__credentialStorageE2E?.preferenceSaveCalls ?? [];
    });
}

/** Releases a preference save that is deliberately held pending by the fixture. */
async function releasePreferenceSave(): Promise<void> {
    await electronApp.evaluate(() => {
        const state = globalThis as typeof globalThis & {
            __credentialStorageE2E?: { releasePreferenceSave?: () => void };
        };
        const release = state.__credentialStorageE2E?.releasePreferenceSave;
        if (!release) {
            throw new Error('No pending credential-storage preference save.');
        }
        release();
    });
}

/**
 * Creates an environment that keeps this test's launcher data isolated.
 *
 * @param homeDir - Temporary home directory for this Electron fixture.
 * @returns Environment values for the launched Electron process.
 */
function createIsolatedLaunchEnvironment(
    homeDir: string,
): Record<string, string> {
    const launchEnvironment: Record<string, string> = {
        ...Object.fromEntries(
            Object.entries(process.env).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
            ),
        ),
        APPDATA: path.join(homeDir, 'AppData', 'Roaming'),
        HOME: homeDir,
        LOCALAPPDATA: path.join(homeDir, 'AppData', 'Local'),
        USERPROFILE: homeDir,
        XDG_CACHE_HOME: path.join(homeDir, '.cache'),
        XDG_CONFIG_HOME: path.join(homeDir, '.config'),
        XDG_DATA_HOME: path.join(homeDir, '.local', 'share'),
        XDG_STATE_HOME: path.join(homeDir, '.local', 'state'),
        GODOT_LAUNCHER_E2E_FIXTURES: '1',
        GODOT_LAUNCHER_E2E_HOME_DIR: homeDir,
    };
    delete launchEnvironment.ELECTRON_RUN_AS_NODE;
    return launchEnvironment;
}
