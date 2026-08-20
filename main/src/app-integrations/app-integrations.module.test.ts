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

@Injectable({ tags: [APP_INTEGRATION_PROVIDER_TAG] })
class LaterProvider implements AppIntegrationProvider {
    readonly metadata = {
        id: 'later',
        displayName: 'Later',
        order: 20,
    };
}

@Injectable({ tags: [APP_INTEGRATION_PROVIDER_TAG] })
class EarlierProvider implements AppIntegrationProvider {
    readonly metadata = {
        id: 'earlier',
        displayName: 'Earlier',
        order: 10,
    };
}

@Module({
    imports: [AppIntegrationsModule],
    providers: [LaterProvider, EarlierProvider],
})
class TestAppIntegrationsModule {}

@Injectable({ tags: [APP_INTEGRATION_PROVIDER_TAG] })
class DuplicateProvider implements AppIntegrationProvider {
    readonly metadata = {
        id: 'later',
        displayName: 'Duplicate',
        order: 30,
    };
}

@Module({
    imports: [AppIntegrationsModule],
    providers: [LaterProvider, DuplicateProvider],
})
class DuplicateAppIntegrationsModule {}

describe('AppIntegrationsModule', () => {
    it('boots without providers', async () => {
        const app = await createApplication(AppIntegrationsModule, {
            logger: false,
        });

        expect(app.get(AppIntegrationsService).list()).toEqual([]);

        await app.destroyAsync();
    });

    it('lists tagged providers in deterministic order', async () => {
        const app = await createApplication(TestAppIntegrationsModule, {
            logger: false,
        });

        expect(app.get(AppIntegrationsService).list()).toEqual([
            {
                id: 'earlier',
                displayName: 'Earlier',
                state: 'not-connected',
            },
            {
                id: 'later',
                displayName: 'Later',
                state: 'not-connected',
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
