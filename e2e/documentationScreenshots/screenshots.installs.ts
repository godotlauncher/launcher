import { type ElectronApplication, expect } from '@playwright/test';
import {
    applyTheme,
    closeActionMenu,
    dismissVisibleAlert,
    getInstallsView,
    hideInstallsManifestDropOverlay,
    openFirstReleaseActionsMenu,
    prepareAppWithStubbedData,
    publishReleaseInstallProgress,
    showInstallsManifestDropOverlay,
    stubCustomEditorDuplicateRegistration,
    stubInstallReleaseFailure,
} from './runtime';
import {
    SAMPLE_AVAILABLE_RELEASES,
    SAMPLE_CUSTOM_RELEASE,
    SAMPLE_INSTALLED_RELEASES,
    SAMPLE_INSTALLED_RELEASES_CUSTOM_OVERVIEW,
    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM_AND_UNAVAILABLE,
    SAMPLE_INSTALLED_RELEASES_WITHOUT_LATEST,
} from './sampleData';
import type { ElectronPage, ScreenshotConfig, ThemeConfig } from './types';

const DOWNLOAD_ERROR_SCREENSHOTS: ScreenshotConfig[] = [
    createDownloadErrorScreenshot({
        fileBase: 'screen_installs_download_error',
        description: 'Install New Version view with interrupted download error',
        error: 'Download interrupted. The Godot download server may be busy or the connection was closed. Please try again in a few minutes.',
        visibleError: 'Download interrupted.',
    }),
    createDownloadErrorScreenshot({
        fileBase: 'screen_installs_download_asset_not_found',
        description: 'Install New Version view with unavailable release asset error',
        error: 'This release asset is no longer available. Refresh the release list and try again.',
        visibleError: 'This release asset is no longer available.',
    }),
    createDownloadErrorScreenshot({
        fileBase: 'screen_installs_download_rate_limited',
        description: 'Install New Version view with GitHub rate limit error',
        error: 'GitHub is temporarily limiting download requests. Please try again in a few minutes.',
        visibleError: 'GitHub is temporarily limiting download requests.',
    }),
    createDownloadErrorScreenshot({
        fileBase: 'screen_installs_download_service_unavailable',
        description: 'Install New Version view with GitHub download service error',
        error: "GitHub's download service is temporarily unavailable. Please try again in a few minutes. Check githubstatus.com for updates.",
        visibleError: "GitHub's download service is temporarily unavailable.",
        externalLinkLabel: 'githubstatus.com',
    }),
];

export const INSTALLS_SCREENSHOTS: ScreenshotConfig[] = [
    {
        fileBase: 'screen_installs_view',
        description: 'Installs view',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            await expect(page.getByTestId('inputInstallSearch')).toBeFocused();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_installs_menu',
        description: 'Installs view action menu',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            const installsView = getInstallsView(page);
            await expect(
                installsView.getByText(SAMPLE_INSTALLED_RELEASES[0].version, {
                    exact: true,
                }),
            ).toBeVisible({ timeout: 10000 });
            await openFirstReleaseActionsMenu(page);
            await page.waitForTimeout(600);
        },
        cleanup: closeActionMenu,
    },
    {
        fileBase: 'screen_installs_custom_editors',
        description: 'Installs view with a custom editor',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp, {
                installedReleases: SAMPLE_INSTALLED_RELEASES_CUSTOM_OVERVIEW,
            });
            await applyTheme(page, theme);
            await page.getByTestId('btnInstalls').click();
            const installsView = getInstallsView(page);
            await expect(
                installsView.getByText(SAMPLE_INSTALLED_RELEASES[0].version, {
                    exact: true,
                }),
            ).toBeVisible({ timeout: 10000 });
            await expect(
                installsView.getByText(SAMPLE_CUSTOM_RELEASE.name!),
            ).toBeVisible({ timeout: 10000 });
            await expect(
                installsView.getByText(SAMPLE_INSTALLED_RELEASES[1].version, {
                    exact: true,
                }),
            ).not.toBeVisible({ timeout: 10000 });
            await page.waitForTimeout(600);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
        },
    },
    {
        fileBase: 'screen_installs_full_details',
        description: 'Installs view with custom and unavailable editors',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp, {
                installedReleases:
                    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM_AND_UNAVAILABLE,
            });
            await applyTheme(page, theme);
            await page.getByTestId('btnInstalls').click();
            await expect(
                page.getByText(SAMPLE_CUSTOM_RELEASE.name!),
            ).toBeVisible({ timeout: 10000 });
            await page.waitForTimeout(600);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
        },
    },
    {
        fileBase: 'screen_installs_custom_editor_menu',
        description: 'Installs view add custom editor menu',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            await page.getByTestId('btnAddCustomEngineMenu').click();
            await expect(
                page.getByTestId('btnCreateCustomEditorManifest'),
            ).toBeVisible({ timeout: 10000 });
            await page.waitForTimeout(400);
        },
        cleanup: async (page: ElectronPage) => {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
        },
    },
    {
        fileBase: 'screen_installs_custom_editor_drawer',
        description: 'Create custom editor manifest drawer',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            await page.getByTestId('btnAddCustomEngineMenu').click();
            await page.getByTestId('btnCreateCustomEditorManifest').click();
            await expect(
                page.getByRole('dialog', {
                    name: 'Create custom editor manifest',
                }),
            ).toBeVisible({ timeout: 10000 });
            await page.waitForTimeout(400);
        },
        cleanup: async (page: ElectronPage) => {
            const drawer = page.getByRole('dialog', {
                name: 'Create custom editor manifest',
            });
            if (await drawer.isVisible().catch(() => false)) {
                await page.keyboard.press('Escape');
            }
            await page.waitForTimeout(300);
        },
    },
    {
        fileBase: 'screen_installs_custom_manifest_drop',
        description: 'Installs view custom editor manifest drop prompt',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            await page.waitForTimeout(600);
            await showInstallsManifestDropOverlay(page, true);
            await page.waitForTimeout(400);
        },
        cleanup: async (page: ElectronPage) => {
            await hideInstallsManifestDropOverlay(page, true);
            await page.waitForTimeout(200);
        },
    },
    {
        fileBase: 'screen_installs_custom_manifest_drop_unsupported',
        description: 'Installs view unsupported custom editor manifest prompt',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            await page.waitForTimeout(600);
            await showInstallsManifestDropOverlay(page, false);
            await page.waitForTimeout(400);
        },
        cleanup: async (page: ElectronPage) => {
            await hideInstallsManifestDropOverlay(page, false);
            await page.waitForTimeout(200);
        },
    },
    {
        fileBase: 'screen_installs_custom_editor_replace',
        description: 'Replace custom editor confirmation dialog',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp, {
                installedReleases: SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
            });
            await stubCustomEditorDuplicateRegistration(electronApp);
            await applyTheme(page, theme);
            await page.getByTestId('btnInstalls').click();
            await page.getByTestId('btnAddCustomEngineMenu').click();
            await page.getByTestId('btnAddCustomEngine').click();
            await expect(
                page.getByRole('dialog', {
                    name: 'Replace custom editor?',
                }),
            ).toBeVisible({ timeout: 10000 });
            await page.waitForTimeout(400);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            const cancelButton = page.getByTestId('btnAlert1');
            if (await cancelButton.isVisible().catch(() => false)) {
                await cancelButton.click();
            }
            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
        },
    },
    {
        fileBase: 'screen_installs_new_version',
        description: 'Install New Version view',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            const installButton = page.getByTestId('btnInstallEditor');
            const closeButton = page.getByTestId('btnCloseInstallEditor');

            for (let attempt = 0; attempt < 3; attempt++) {
                await expect(installButton).toBeVisible({ timeout: 10000 });
                await installButton.click({ force: true });
                if (await closeButton.isVisible().catch(() => false)) {
                    break;
                }
                await page.waitForTimeout(250);
            }

            await expect(closeButton).toBeVisible({ timeout: 10000 });
            await page.waitForTimeout(400);
        },
        cleanup: async (page: ElectronPage) => {
            await dismissVisibleAlert(page);
            const closeButton = page.getByTestId('btnCloseInstallEditor');
            if (await closeButton.isVisible().catch(() => false)) {
                await closeButton.click();
            } else {
                await page.keyboard.press('Escape');
            }
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_installs_catalog_error',
        description: 'Install editor catalog update error',
        navigate: navigateToCatalogErrorScreenshot,
        cleanup: cleanupCatalogErrorScreenshot,
    },
    {
        fileBase: 'screen_installs_download_progress',
        description: 'Install New Version view with download progress',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp, {
                installedReleases: SAMPLE_INSTALLED_RELEASES_WITHOUT_LATEST,
            });
            await applyTheme(page, theme);
            await page.getByTestId('btnInstalls').click();

            const installButton = page.getByTestId('btnInstallEditor');
            const closeButton = page.getByTestId('btnCloseInstallEditor');
            await expect(installButton).toBeVisible({ timeout: 10000 });
            await installButton.click({ force: true });
            await expect(closeButton).toBeVisible({ timeout: 10000 });
            const editorDrawer = page.getByRole('dialog', {
                name: 'Install Godot Editor',
            }).last();

            const release = SAMPLE_AVAILABLE_RELEASES[0];
            await publishReleaseInstallProgress(electronApp, [
                {
                    id: `${release.version}:gdscript`,
                    version: release.version,
                    mono: false,
                    prerelease: release.prerelease,
                    published_at: release.published_at,
                    stage: 'downloading',
                    percent: 55,
                    receivedBytes: 56 * 1024 * 1024,
                    totalBytes: 102 * 1024 * 1024,
                },
                {
                    id: `${release.version}:dotnet`,
                    version: release.version,
                    mono: true,
                    prerelease: release.prerelease,
                    published_at: release.published_at,
                    stage: 'queued',
                    queuePosition: 1,
                },
            ]);

            const gdscriptProgress = editorDrawer.getByTestId(
                `installProgress${release.version}`,
            ).first();
            const dotnetProgress = editorDrawer.getByTestId(
                `installProgress${release.version}-mono`,
            ).first();
            await expect(gdscriptProgress).toHaveRole('status');
            await expect(
                gdscriptProgress.getByText('Downloading'),
            ).toBeVisible({ timeout: 10000 });
            await expect(dotnetProgress).toHaveRole('status');
            await expect(dotnetProgress.getByText('Queued #1')).toBeVisible({
                timeout: 10000,
            });
            await page.waitForTimeout(400);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            const closeButton = page.getByTestId('btnCloseInstallEditor');
            if (await closeButton.isVisible().catch(() => false)) {
                await closeButton.click();
            } else {
                await page.keyboard.press('Escape');
            }

            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
            await page.waitForTimeout(600);
        },
    },
    ...DOWNLOAD_ERROR_SCREENSHOTS,
];

type DownloadErrorScreenshotOptions = Pick<
    ScreenshotConfig,
    'fileBase' | 'description'
> & {
    error: string;
    visibleError: string;
    externalLinkLabel?: string;
};

/** Creates the common install-drawer screenshot for one download failure. */
function createDownloadErrorScreenshot({
    fileBase,
    description,
    error,
    visibleError,
    externalLinkLabel,
}: DownloadErrorScreenshotOptions): ScreenshotConfig {
    return {
        fileBase,
        description,
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp, {
                installedReleases: SAMPLE_INSTALLED_RELEASES_WITHOUT_LATEST,
            });
            await stubInstallReleaseFailure(electronApp, error);
            await applyTheme(page, theme);
            await page.getByTestId('btnInstalls').click();

            const installButton = page.getByTestId('btnInstallEditor');
            const closeButton = page.getByTestId('btnCloseInstallEditor');
            await expect(installButton).toBeVisible({ timeout: 10000 });
            await installButton.click({ force: true });
            await expect(closeButton).toBeVisible({ timeout: 10000 });

            await page
                .getByRole('dialog', { name: 'Install Godot Editor' })
                .last()
                .getByTestId('btnDownload4.7-stable')
                .first()
                .click();
            await expect(
                page.getByText(visibleError, { exact: false }),
            ).toBeVisible({ timeout: 10000 });
            if (externalLinkLabel) {
                await expect(
                    page.getByRole('button', { name: externalLinkLabel }),
                ).toBeVisible({ timeout: 10000 });
            }

            await page.waitForTimeout(400);
        },
        cleanup: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await dismissVisibleAlert(page);

            const closeButton = page.getByTestId('btnCloseInstallEditor');
            if (await closeButton.isVisible().catch(() => false)) {
                await closeButton.click();
            } else {
                await page.keyboard.press('Escape');
            }

            await prepareAppWithStubbedData(page, electronApp);
            await applyTheme(page, theme);
            await page.waitForTimeout(600);
        },
    };
}

/**
 * Opens the editor drawer with a mocked catalog refresh error.
 *
 * @param page - The Electron page to prepare.
 * @param electronApp - The Electron app that owns the mocked handlers.
 * @param theme - The screenshot theme to restore after reloading.
 * @returns A promise that ends when the error modal is visible.
 */
async function navigateToCatalogErrorScreenshot(
    page: ElectronPage,
    electronApp: ElectronApplication,
    theme: ThemeConfig,
): Promise<void> {
    const technicalError =
        'Failed to fetch editor catalog: 403; API rate limit exceeded for this address.';
    await prepareAppWithStubbedData(page, electronApp, {
        catalogRefreshError: technicalError,
    });
    await applyTheme(page, theme);
    await page.getByTestId('btnInstalls').click();
    await page.getByTestId('btnInstallEditor').click();

    const errorDialog = page.getByRole('dialog', {
        name: 'Could not update editor list',
    });
    await expect(errorDialog).toBeVisible({ timeout: 10000 });
    await expect(errorDialog).toContainText(
        'The saved editor list is still available.',
    );
    await expect(page.getByText(technicalError)).toHaveCount(0);
    await page.waitForTimeout(400);
}

/**
 * Restores the normal mocked catalog after the error screenshot.
 *
 * @param page - The Electron page to restore.
 * @param electronApp - The Electron app that owns the mocked handlers.
 * @param theme - The screenshot theme to restore after reloading.
 * @returns A promise that ends when the normal mocked page is ready.
 */
async function cleanupCatalogErrorScreenshot(
    page: ElectronPage,
    electronApp: ElectronApplication,
    theme: ThemeConfig,
): Promise<void> {
    await dismissVisibleAlert(page);
    const closeButton = page.getByTestId('btnCloseInstallEditor');
    if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
    } else {
        await page.keyboard.press('Escape');
    }

    await prepareAppWithStubbedData(page, electronApp);
    await applyTheme(page, theme);
    await page.waitForTimeout(600);
}
