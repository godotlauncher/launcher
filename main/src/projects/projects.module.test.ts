import 'reflect-metadata';
import { createApplication, Module } from '@mariodebono/di';
import { ConfigModule } from '@mariodebono/di-config';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));
vi.mock('electron', () => ({
    app: {
        getAppPath: vi.fn(() => '/app'),
        isPackaged: false,
    },
    dialog: {
        showOpenDialog: vi.fn(),
        showMessageBox: vi.fn(),
    },
}));
vi.mock('electron-updater', () => ({
    default: {
        autoUpdater: {},
    },
}));

import { AppIntegrationsModule } from '../app-integrations/app-integrations.module.js';
import type { AppConfig } from '../config/index.js';
import { EditorCatalogModule } from '../editor-catalog/editor-catalog.module.js';
import { EditorProjectRepairAdapter } from '../editor-installs/editor-project-repair.adapter.js';
import { TrayAvailabilityService } from '../services/tray-availability.service.js';
import { ToolIntegrationModule } from '../tool-integration/tool-integration.module.js';
import { ProjectRepositoryOriginIndexService } from './project-repository-origin-index.service.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsModule } from './projects.module.js';
import { ProjectsService } from './projects.service.js';
import { ProjectsStore } from './projects.store.js';

describe('ProjectsModule', () => {
    it('resolves the project boundary with one store and tray service', async () => {
        @Module({
            imports: [
                ConfigModule.forRoot<AppConfig>({
                    cache: true,
                    isGlobal: true,
                    loadProcessEnv: false,
                    load: [createConfig],
                }),
                EditorCatalogModule.forRoot({
                    directory: '/config',
                    fileName: 'editor-catalog.json',
                }),
                ToolIntegrationModule.forRoot({
                    directory: '/config',
                    fileName: 'tool-integrations.json',
                }),
                AppIntegrationsModule.forRoot({
                    directory: '/config',
                    metadataFileName: 'app-integrations.json',
                    secretsFileName: 'app-integration-secrets.json',
                }),
                ProjectsModule,
            ],
        })
        class TestAppModule {}

        const application = await createApplication(TestAppModule, {
            logger: false,
        });

        expect(application.get(ProjectsService)).toBeInstanceOf(
            ProjectsService,
        );
        expect(application.get(ProjectsController)).toBeInstanceOf(
            ProjectsController,
        );
        expect(
            application.get(ProjectRepositoryOriginIndexService),
        ).toBeInstanceOf(ProjectRepositoryOriginIndexService);
        expect(application.get(ProjectsStore)).toBe(
            application.get(ProjectsStore),
        );
        expect(
            (
                application.get(EditorProjectRepairAdapter) as unknown as {
                    projectsStore: ProjectsStore;
                }
            ).projectsStore,
        ).toBe(application.get(ProjectsStore));
        expect(application.get(TrayAvailabilityService)).toBe(
            application.get(TrayAvailabilityService),
        );
        await application.destroyAsync();
    });
});

/** Creates fixed configuration for the provider graph test. */
function createConfig(): AppConfig {
    return {
        appName: 'Godot Launcher',
        isDev: true,
        debugMode: false,
        disableSandbox: false,
        disableDevMenu: false,
        startHidden: false,
        docsScreenshots: false,
        paths: {
            dataDir: '/data',
            configDir: '/config',
            projectDir: '/projects',
            prefsPath: '/config/prefs.json',
            releaseCachePath: '/config/releases.json',
            prereleaseCachePath: '/config/prereleases.json',
            installedReleasesCachePath: '/config/installed-releases.json',
            migrationStatePath: '/config/migrations.json',
        },
    };
}
