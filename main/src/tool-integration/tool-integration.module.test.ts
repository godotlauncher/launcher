import 'reflect-metadata';
import { createApplication, Injectable, Module } from '@mariodebono/di';
import { ConfigModule, ConfigService } from '@mariodebono/di-config';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/index.js';
import {
    TOOL_INTEGRATION_MODULE_OPTIONS,
    TOOL_INTEGRATION_TAG,
} from './tool-integration.constants.js';
import { ToolIntegrationModule } from './tool-integration.module.js';
import { ToolIntegrationRegistry } from './tool-integration.registry.js';
import type {
    ToolInstallation,
    ToolIntegration,
    ToolIntegrationModuleOptions,
    ToolSettings,
} from './tool-integration.types.js';

vi.mock('../utils/platform.utils.js', () => ({
    findExecutable: vi.fn(),
}));

@Injectable({ tags: [TOOL_INTEGRATION_TAG] })
class LaterToolIntegration implements ToolIntegration {
    readonly metadata = {
        id: 'later',
        displayName: 'Later',
        order: 20,
    };

    /** @inheritdoc */
    detectInstallation(
        _settings: ToolSettings,
    ): Promise<ToolInstallation | null> {
        return Promise.resolve(null);
    }

    /** @inheritdoc */
    validateInstallation(
        _installation: ToolInstallation,
    ): Promise<ToolInstallation | null> {
        return Promise.resolve(null);
    }
}

@Injectable({ tags: [TOOL_INTEGRATION_TAG] })
class EarlierToolIntegration extends LaterToolIntegration {
    override readonly metadata = {
        id: 'earlier',
        displayName: 'Earlier',
        order: 10,
    };
}

@Module({
    imports: [
        ToolIntegrationModule.forRoot({
            directory: '/config',
            fileName: 'tool-integrations.json',
        }),
    ],
    providers: [LaterToolIntegration, EarlierToolIntegration],
})
class TestToolModule {}

@Injectable({ tags: [TOOL_INTEGRATION_TAG] })
class DuplicateToolIntegration extends LaterToolIntegration {
    override readonly metadata = {
        id: 'later',
        displayName: 'Duplicate',
        order: 30,
    };
}

@Module({
    imports: [
        ToolIntegrationModule.forRoot({
            directory: '/config',
            fileName: 'tool-integrations.json',
        }),
    ],
    providers: [LaterToolIntegration, DuplicateToolIntegration],
})
class DuplicateToolModule {}

describe('ToolIntegrationModule', () => {
    it('boots with the production Git provider', async () => {
        const app = await createApplication(
            ToolIntegrationModule.forRoot({
                directory: '/config',
                fileName: 'tool-integrations.json',
            }),
            { logger: false },
        );

        const registry = app.get(ToolIntegrationRegistry);
        expect(
            registry.list().map((integration) => integration.metadata.id),
        ).toEqual(['git']);

        await app.destroyAsync();
    });

    it('discovers tagged providers in deterministic order', async () => {
        const app = await createApplication(TestToolModule, { logger: false });

        const registry = app.get(ToolIntegrationRegistry);
        const integrations = registry.list();

        expect(
            integrations.map((integration) => integration.metadata.id),
        ).toEqual(['earlier', 'later', 'git']);
        await app.destroyAsync();
    });

    it('rejects duplicate stable tool IDs during bootstrap', async () => {
        await expect(
            createApplication(DuplicateToolModule, { logger: false }),
        ).rejects.toThrow('Duplicate tool integration: later');
    });

    it('rejects invalid store options', () => {
        expect(() =>
            ToolIntegrationModule.forRoot({
                directory: '  ',
                fileName: 'tool-integrations.json',
            }),
        ).toThrow('Tool integration directory must not be empty');
        expect(() =>
            ToolIntegrationModule.forRoot({
                directory: '/config',
                fileName: '  ',
            }),
        ).toThrow('Tool integration file name must not be empty');
    });

    it('registers async store options through the application config', async () => {
        @Module({
            imports: [
                ConfigModule.forRoot<AppConfig>({
                    cache: true,
                    isGlobal: true,
                    loadProcessEnv: false,
                    load: [createConfig],
                }),
                ToolIntegrationModule.forRootAsync({
                    inject: [ConfigService],
                    useFactory: (configService: ConfigService<AppConfig>) => ({
                        directory: configService.getOrThrow('paths.configDir'),
                        fileName: 'tool-integrations.json',
                    }),
                }),
            ],
        })
        class AsyncToolModule {}

        const app = await createApplication(AsyncToolModule, { logger: false });

        expect(
            app.get<ToolIntegrationModuleOptions>(
                TOOL_INTEGRATION_MODULE_OPTIONS,
            ),
        ).toEqual({
            directory: '/config',
            fileName: 'tool-integrations.json',
        });
        await app.destroyAsync();
    });
});

/**
 * Creates application config for async module option tests.
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
