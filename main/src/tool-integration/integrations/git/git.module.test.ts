import 'reflect-metadata';
import { createApplication, Module } from '@mariodebono/di';
import { describe, expect, it, vi } from 'vitest';
import { ToolIntegrationModule } from '../../tool-integration.module.js';
import { ToolIntegrationRegistry } from '../../tool-integration.registry.js';
import { GitController } from './git.controller.js';
import { GitModule } from './git.module.js';
import { GitService } from './git.service.js';
import { GitIdentitySettingsService } from './git-identity-settings.service.js';
import { GitToolConfigurationService } from './git-tool-configuration.service.js';

vi.mock('../../../utils/platform.utils.js', () => ({
    findExecutable: vi.fn(),
}));

vi.mock('@mariodebono/di-electron', () => ({
    BridgeController: () => () => undefined,
    createIpcHandleTyped: () => () => () => undefined,
}));

@Module({
    imports: [
        ToolIntegrationModule.forRoot({
            directory: '/config',
            fileName: 'tool-integrations.json',
        }),
        GitModule,
    ],
})
class TestGitModule {}

describe('GitModule', () => {
    it('exports the Git service over the configured tool integration', async () => {
        const app = await createApplication(TestGitModule, { logger: false });

        expect(app.get(GitService)).toBeInstanceOf(GitService);
        expect(app.get(GitIdentitySettingsService)).toBeInstanceOf(
            GitIdentitySettingsService,
        );
        expect(app.get(GitToolConfigurationService)).toBeInstanceOf(
            GitToolConfigurationService,
        );
        expect(app.get(GitController)).toBeInstanceOf(GitController);
        expect(
            app
                .get(ToolIntegrationRegistry)
                .list()
                .map((integration) => integration.metadata.id),
        ).toEqual(['git']);

        await app.destroyAsync();
    });
});
