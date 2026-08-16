import { Module } from '@mariodebono/di';
import { ToolIntegrationModule } from '../../tool-integration.module.js';
import { GitController } from './git.controller.js';
import { GitService } from './git.service.js';
import { GitIdentitySettingsService } from './git-identity-settings.service.js';
import { GitToolIntegration } from './git-tool.integration.js';
import { GitToolConfigurationService } from './git-tool-configuration.service.js';

@Module({
    imports: [ToolIntegrationModule],
    providers: [
        GitToolIntegration,
        GitToolConfigurationService,
        GitService,
        GitIdentitySettingsService,
        GitController,
    ],
    exports: [
        GitToolConfigurationService,
        GitService,
        GitIdentitySettingsService,
    ],
})
export class GitModule {}
