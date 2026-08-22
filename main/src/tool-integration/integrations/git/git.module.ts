import { Module } from '@mariodebono/di';
import { ToolIntegrationModule } from '../../tool-integration.module.js';
import { GitController } from './git.controller.js';
import { GitService } from './git.service.js';
import { GitCloneService } from './git-clone.service.js';
import { GitCredentialSessionService } from './git-credential-session.service.js';
import { GitIdentitySettingsService } from './git-identity-settings.service.js';
import { GitToolIntegration } from './git-tool.integration.js';
import { GitToolConfigurationService } from './git-tool-configuration.service.js';
import { PublicGitSourceService } from './public-git-source.service.js';

@Module({
    imports: [ToolIntegrationModule],
    providers: [
        GitToolIntegration,
        GitToolConfigurationService,
        GitCredentialSessionService,
        GitCloneService,
        GitService,
        GitIdentitySettingsService,
        PublicGitSourceService,
        GitController,
    ],
    exports: [
        GitToolConfigurationService,
        GitService,
        GitIdentitySettingsService,
        GitCloneService,
        PublicGitSourceService,
    ],
})
export class GitModule {}
