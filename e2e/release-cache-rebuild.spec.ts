import fs from 'node:fs/promises';
import path from 'node:path';
import type { EditorCatalogResult, GetEditorCatalogOptions } from '@shared/contracts';
import {
    _electron,
    type ElectronApplication,
    expect,
    type Page,
    test,
} from './support/electron.fixture';
import { getMainWindow } from './splashscreen/getMainWindow';
import { SAMPLE_INSTALLED_RELEASES } from './support/e2e-fixture-data';
import { createFixtureHome, prepareAppWithStubbedData, setAppLanguage } from './support/e2e-fixture-runtime';

type FixtureWindow = Window & {
    __di_electron__: { invoke: (channel: string, ...args: unknown[]) => Promise<unknown> };
};
type FixtureState = typeof globalThis & { __cacheRebuildEvents?: string[] };

let app: ElectronApplication;
let page: Page;
let fixtureHome: string;
let initialCatalogue: EditorCatalogResult;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
    fixtureHome = await createFixtureHome();
    const env = Object.fromEntries(Object.entries(process.env).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
    ));
    delete env.ELECTRON_RUN_AS_NODE;
    app = await _electron.launch({
        args: ['.', `--user-data-dir=${path.join(fixtureHome, 'electron-user-data')}`],
        env: { ...env, GODOT_LAUNCHER_E2E_FIXTURES: '1', GODOT_LAUNCHER_E2E_HOME_DIR: fixtureHome },
    });
    page = await getMainWindow(app);
    await setAppLanguage(page, 'English');
});
test.afterAll(async () => {
    await app?.close();
    if (fixtureHome) await fs.rm(fixtureHome, { recursive: true, force: true });
});
test.beforeEach(async () => {
    await page.evaluate(() => localStorage.removeItem('gdlauncher.clearReleaseCache.lastClearedAt'));
    await prepareAppWithStubbedData(page, app, { installedReleases: [SAMPLE_INSTALLED_RELEASES[0]] });
    const response = await page.evaluate(() =>
        (window as FixtureWindow).__di_electron__.invoke('editorCatalog.getCatalog', { refreshIfStale: false }),
    );
    initialCatalogue = (response as { data: EditorCatalogResult }).data;
});

for (const mode of ['success', 'rate-limit', 'reload-failure'] as const) {
    test(`Settings cache rebuild handles ${mode} without an extra refresh`, async () => {
        await stubRebuild(mode);
        await page.getByTestId('btnSettings').click();
        await page.getByTestId('tabInstalls').click();
        const button = page.getByRole('button', { name: 'Refresh cache', exact: true });
        await expect(button).toBeEnabled();
        await button.click();

        if (mode === 'success') {
            await expect(page.getByText('Cache Refreshed Successfully', { exact: true })).toBeVisible();
            await expect(page.getByRole('button', { name: /^Refresh cache \(/ })).toBeDisabled();
        } else {
            await expect(page.getByText('Unable to Refresh Cache', { exact: true })).toBeVisible();
            await expect(page.getByText('Cache Refreshed Successfully', { exact: true })).not.toBeVisible();
            await expect(button).toBeEnabled();
        }
        expect(await readEvents()).toEqual(mode === 'rate-limit' ? ['rebuild'] : ['rebuild', 'read:false']);

        await page.getByRole('dialog').getByRole('button', { name: 'Ok', exact: true }).click();
        await openInstallDrawer();
        const expectedVersion = mode === 'success' ? '4.99-stable' : initialCatalogue.releases.find((release) => !release.prerelease)!.version;
        await expect(page.getByRole('dialog').getByText(expectedVersion, { exact: true }).first()).toBeVisible();
        await page.keyboard.press('Escape');
    });
}

test('the normal editor refresh continues to use only the catalogue refresh', async () => {
    await stubRebuild('success');
    await openInstallDrawer();
    await page.getByTestId('btnRefreshInstallEditorCatalog').click();
    await expect.poll(readEvents).toEqual(['refresh']);
});

/**
 * Stubs the existing IPC boundaries while exercising the real release provider.
 * @param mode - Outcome of the rebuild or its cache-only reload.
 */
async function stubRebuild(mode: 'success' | 'rate-limit' | 'reload-failure'): Promise<void> {
    await app.evaluate(({ ipcMain }, injected) => {
        const state = globalThis as FixtureState;
        state.__cacheRebuildEvents = [];
        let catalogue = injected.catalogue;
        for (const channel of ['app.clearReleaseCache', 'editorCatalog.getCatalog', 'editorCatalog.refreshCatalog']) ipcMain.removeHandler(channel);
        ipcMain.handle('app.clearReleaseCache', async () => {
            state.__cacheRebuildEvents?.push('rebuild');
            if (injected.mode === 'rate-limit') return { success: false, error: { type: 'Error', message: 'GitHub 429: too many requests' } };
            const stable = catalogue.releases.find((release) => !release.prerelease)!;
            catalogue = { ...catalogue, releases: [{ ...stable, id: 'official-stable:4.99-stable', tag: '4.99-stable', version: '4.99-stable', baseVersion: '4.99', name: 'Godot 4.99', versionParts: { ...stable.versionParts, minor: 99 } }] };
            return { success: true, data: undefined };
        });
        ipcMain.handle('editorCatalog.getCatalog', async (_event, options: GetEditorCatalogOptions) => {
            state.__cacheRebuildEvents?.push(`read:${options?.refreshIfStale}`);
            if (injected.mode === 'reload-failure') return { success: false, error: { type: 'Error', message: 'Cannot read rebuilt catalogue' } };
            return { success: true, data: catalogue };
        });
        ipcMain.handle('editorCatalog.refreshCatalog', async () => {
            state.__cacheRebuildEvents?.push('refresh');
            return { success: true, data: catalogue };
        });
    }, { mode, catalogue: initialCatalogue });
}

/** Reads the observed bridge calls from the Electron main process. */
async function readEvents(): Promise<string[]> {
    return app.evaluate(() => (globalThis as FixtureState).__cacheRebuildEvents ?? []);
}

/** Opens the editor catalogue through the application's visible controls. */
async function openInstallDrawer(): Promise<void> {
    await page.getByTestId('btnInstalls').click();
    await page.getByTestId('btnInstallEditor').click();
    await expect(page.getByTestId('btnRefreshInstallEditorCatalog')).toBeVisible();
}
