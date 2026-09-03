import 'reflect-metadata';
import { createApplication, Module } from '@mariodebono/di';
import { ConfigModule, ConfigService } from '@mariodebono/di-config';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

import type { AppConfig } from '../config/index.js';
import { EDITOR_CATALOG_MODULE_OPTIONS } from './editor-catalog.constants.js';
import { EditorCatalogModule } from './editor-catalog.module.js';
import { EditorCatalogService } from './editor-catalog.service.js';
import type { EditorCatalogModuleOptions } from './editor-catalog.types.js';

describe('EditorCatalogModule', () => {
    it('registers async options and exports its service', async () => {
        @Module({
            imports: [
                ConfigModule.forRoot<AppConfig>({
                    cache: true,
                    isGlobal: true,
                    loadProcessEnv: false,
                    load: [createConfig],
                }),
                EditorCatalogModule.forRootAsync({
                    inject: [ConfigService],
                    useFactory: (configService: ConfigService<AppConfig>) => ({
                        directory: configService.getOrThrow('paths.configDir'),
                        fileName: 'editor-catalog.json',
                    }),
                }),
            ],
        })
        class TestAppModule {}

        const application = await createApplication(TestAppModule, {
            logger: false,
        });

        expect(application.get(EditorCatalogService)).toBeInstanceOf(
            EditorCatalogService,
        );
        expect(
            application.get<EditorCatalogModuleOptions>(
                EDITOR_CATALOG_MODULE_OPTIONS,
            ),
        ).toEqual({
            directory: '/config',
            fileName: 'editor-catalog.json',
        });
        await application.destroyAsync();
    });

    it('rejects an empty directory', () => {
        expect(() =>
            EditorCatalogModule.forRoot({
                directory: '  ',
                fileName: 'editor-catalog.json',
            }),
        ).toThrow('Editor catalog directory must not be empty');
    });

    it('rejects an empty file name', () => {
        expect(() =>
            EditorCatalogModule.forRoot({
                directory: '/config',
                fileName: '  ',
            }),
        ).toThrow('Editor catalog file name must not be empty');
    });
});

/**
 * Creates app config for the module test.
 *
 * @returns App config with fixed test paths.
 */
function createConfig(): AppConfig {
    return {
        appName: 'Godot Launcher',
        isDev: true,
        debugMode: false,
        disableSandbox: false,
        disableDevMenu: false,
        startHidden: false,
        e2eFixtures: false,
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
