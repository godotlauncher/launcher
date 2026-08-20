import 'reflect-metadata';
import { createApplication, Module } from '@mariodebono/di';
import { describe, expect, it, vi } from 'vitest';
import { AppIntegrationsModule } from '../../app-integrations.module.js';
import { AppIntegrationsService } from '../../app-integrations.service.js';
import { GitHubAppIntegrationModule } from './github-app-integration.module.js';

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

@Module({
    imports: [AppIntegrationsModule, GitHubAppIntegrationModule],
})
class TestModule {}

describe('GitHubAppIntegrationModule', () => {
    it('registers GitHub with the app integrations service', async () => {
        const app = await createApplication(TestModule, { logger: false });

        expect(app.get(AppIntegrationsService).list()).toEqual([
            {
                id: 'github',
                displayName: 'GitHub',
                state: 'not-connected',
            },
        ]);

        await app.destroyAsync();
    });
});
