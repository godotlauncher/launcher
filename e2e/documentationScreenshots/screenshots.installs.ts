import { expect, type ElectronApplication } from '@playwright/test';
import type { ElectronPage, ScreenshotConfig, ThemeConfig } from './types';
import {
    SAMPLE_AVAILABLE_RELEASES,
    SAMPLE_CUSTOM_RELEASE,
    SAMPLE_INSTALLED_RELEASES,
    SAMPLE_INSTALLED_RELEASES_CUSTOM_OVERVIEW,
    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM,
    SAMPLE_INSTALLED_RELEASES_WITH_CUSTOM_AND_UNAVAILABLE,
    SAMPLE_INSTALLED_RELEASES_WITHOUT_LATEST,
} from './sampleData';
import {
    applyTheme,
    closeActionMenu,
    dismissVisibleAlert,
    hideInstallsManifestDropOverlay,
    openFirstReleaseActionsMenu,
    prepareAppWithStubbedData,
    publishReleaseInstallProgress,
    showInstallsManifestDropOverlay,
    stubCustomEditorDuplicateRegistration,
    stubInstallReleaseFailure,
} from './runtime';

export const INSTALLS_SCREENSHOTS: ScreenshotConfig[] = [
{
        fileBase: 'screen_installs_view',
        description: 'Installs view',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            await page.waitForTimeout(600);
        },
    },
    {
        fileBase: 'screen_installs_menu',
        description: 'Installs view action menu',
        navigate: async (page: ElectronPage) => {
            await page.getByTestId('btnInstalls').click();
            await expect(
                page.getByText(SAMPLE_INSTALLED_RELEASES[0].version, {
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
            await expect(
                page.getByText(SAMPLE_INSTALLED_RELEASES[0].version, {
                    exact: true,
                }),
            ).toBeVisible({ timeout: 10000 });
            await expect(
                page.getByText(SAMPLE_CUSTOM_RELEASE.name!),
            ).toBeVisible({ timeout: 10000 });
            await expect(
                page.getByText(SAMPLE_INSTALLED_RELEASES[1].version, {
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

            await expect(page.getByText('Downloading').first()).toBeVisible({
                timeout: 10000,
            });
            await expect(page.getByText('Queued #1').first()).toBeVisible({
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
    {
        fileBase: 'screen_installs_download_error',
        description: 'Install New Version view with download error',
        navigate: async (
            page: ElectronPage,
            electronApp: ElectronApplication,
            theme: ThemeConfig,
        ) => {
            await prepareAppWithStubbedData(page, electronApp, {
                installedReleases: SAMPLE_INSTALLED_RELEASES_WITHOUT_LATEST,
            });
            await stubInstallReleaseFailure(
                electronApp,
                'Download interrupted. The Godot download server may be busy or the connection was closed. Please try again in a few minutes.',
            );
            await applyTheme(page, theme);
            await page.getByTestId('btnInstalls').click();

            const installButton = page.getByTestId('btnInstallEditor');
            const closeButton = page.getByTestId('btnCloseInstallEditor');
            await expect(installButton).toBeVisible({ timeout: 10000 });
            await installButton.click({ force: true });
            await expect(closeButton).toBeVisible({ timeout: 10000 });

            await page.getByTestId('btnDownload4.7-stable').click();
            await expect(
                page.getByText('Download interrupted.', { exact: false }),
            ).toBeVisible({ timeout: 10000 });
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
    }
];
