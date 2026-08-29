import 'reflect-metadata';
import { createApplication, Module } from '@mariodebono/di';
import { ConfigModule } from '@mariodebono/di-config';
import { describe, expect, it, vi } from 'vitest';
import { AppConfigSchema } from '../../../config/index.js';
import { AppIntegrationsModule } from '../../app-integrations.module.js';
import { AppIntegrationsService } from '../../app-integrations.service.js';
import { GitHubAppIntegrationModule } from './github-app-integration.module.js';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

vi.mock('electron', () => ({
    safeStorage: {
        isEncryptionAvailable: vi.fn(() => true),
        getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret'),
        encryptString: vi.fn((value: string) => Buffer.from(value)),
        decryptString: vi.fn((value: Buffer) => value.toString()),
    },
    shell: { openExternal: vi.fn() },
}));

@Module({
    imports: [
        ConfigModule.forRoot({
            cache: true,
            isGlobal: true,
            loadProcessEnv: false,
            load: [
                () =>
                    AppConfigSchema.parse({
                        appName: 'Test',
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
                            installedReleasesCachePath:
                                '/config/installed.json',
                            prereleaseCachePath: '/config/prereleases.json',
                            migrationStatePath: '/config/migrations.json',
                        },
                    }),
            ],
            validationSchema: AppConfigSchema,
        }),
        AppIntegrationsModule.forRoot({
            directory: '/config',
            metadataFileName: 'app-integrations.json',
            secretsFileName: 'app-integration-secrets.json',
        }),
        GitHubAppIntegrationModule,
    ],
})
class TestModule {}

describe('GitHubAppIntegrationModule', () => {
    it('registers GitHub with the app integrations service', async () => {
        const app = await createApplication(TestModule, { logger: false });

        await expect(app.get(AppIntegrationsService).list()).resolves.toEqual([
            {
                id: 'github',
                displayName: 'GitHub',
                state: 'not-connected',
                connectionStage: null,
                connections: [],
                connectionOptions: [],
            },
        ]);

        await app.destroyAsync();
    });
});
