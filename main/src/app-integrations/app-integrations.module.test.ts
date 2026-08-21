import 'reflect-metadata';
import { createApplication, Injectable, Module } from '@mariodebono/di';
import { describe, expect, it, vi } from 'vitest';
import { APP_INTEGRATION_PROVIDER_TAG } from './app-integration.constants.js';
import type { AppIntegrationProvider } from './app-integration.types.js';
import { AppIntegrationsModule } from './app-integrations.module.js';
import { AppIntegrationsService } from './app-integrations.service.js';

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
}));

@Injectable({ tags: [APP_INTEGRATION_PROVIDER_TAG] })
class LaterProvider implements AppIntegrationProvider {
    readonly metadata = {
        id: 'later',
        displayName: 'Later',
        order: 20,
    };

    connect = vi.fn();
    isCredentialValid = vi.fn(() => true);
    refresh = vi.fn();
    prepareCredentialRevocation = vi.fn();
    revokeCredential = vi.fn();
    openManageAccess = vi.fn();
}

@Injectable({ tags: [APP_INTEGRATION_PROVIDER_TAG] })
class EarlierProvider implements AppIntegrationProvider {
    readonly metadata = {
        id: 'earlier',
        displayName: 'Earlier',
        order: 10,
    };

    connect = vi.fn();
    isCredentialValid = vi.fn(() => true);
    refresh = vi.fn();
    prepareCredentialRevocation = vi.fn();
    revokeCredential = vi.fn();
    openManageAccess = vi.fn();
}

@Module({
    imports: [
        AppIntegrationsModule.forRoot({
            directory: '/config',
            metadataFileName: 'app-integrations.json',
            secretsFileName: 'app-integration-secrets.json',
        }),
    ],
    providers: [LaterProvider, EarlierProvider],
})
class TestAppIntegrationsModule {}

@Module({
    imports: [
        AppIntegrationsModule.forRoot({
            directory: '/config',
            metadataFileName: 'app-integrations.json',
            secretsFileName: 'app-integration-secrets.json',
        }),
    ],
})
class EmptyAppIntegrationsModule {}

@Injectable({ tags: [APP_INTEGRATION_PROVIDER_TAG] })
class DuplicateProvider implements AppIntegrationProvider {
    readonly metadata = {
        id: 'later',
        displayName: 'Duplicate',
        order: 30,
    };

    connect = vi.fn();
    isCredentialValid = vi.fn(() => true);
    refresh = vi.fn();
    prepareCredentialRevocation = vi.fn();
    revokeCredential = vi.fn();
    openManageAccess = vi.fn();
}

@Module({
    imports: [
        AppIntegrationsModule.forRoot({
            directory: '/config',
            metadataFileName: 'app-integrations.json',
            secretsFileName: 'app-integration-secrets.json',
        }),
    ],
    providers: [LaterProvider, DuplicateProvider],
})
class DuplicateAppIntegrationsModule {}

describe('AppIntegrationsModule', () => {
    it('boots without providers', async () => {
        const app = await createApplication(EmptyAppIntegrationsModule, {
            logger: false,
        });

        await expect(app.get(AppIntegrationsService).list()).resolves.toEqual(
            [],
        );

        await app.destroyAsync();
    });

    it('lists tagged providers in deterministic order', async () => {
        const app = await createApplication(TestAppIntegrationsModule, {
            logger: false,
        });

        await expect(app.get(AppIntegrationsService).list()).resolves.toEqual([
            {
                id: 'earlier',
                displayName: 'Earlier',
                state: 'not-connected',
                connectionStage: null,
                connections: [],
                connectionOptions: [],
            },
            {
                id: 'later',
                displayName: 'Later',
                state: 'not-connected',
                connectionStage: null,
                connections: [],
                connectionOptions: [],
            },
        ]);

        await app.destroyAsync();
    });

    it('rejects duplicate provider IDs during bootstrap', async () => {
        await expect(
            createApplication(DuplicateAppIntegrationsModule, {
                logger: false,
            }),
        ).rejects.toThrow('Duplicate app integration provider: later');
    });
});
