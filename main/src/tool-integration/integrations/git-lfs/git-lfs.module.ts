import { Module } from '@mariodebono/di';
import { ToolIntegrationModule } from '../../tool-integration.module.js';
import { GitModule } from '../git/git.module.js';
import { GitLfsController } from './git-lfs.controller.js';
import { GitLfsService } from './git-lfs.service.js';
import { GitLfsToolIntegration } from './git-lfs-tool.integration.js';

@Module({
    imports: [ToolIntegrationModule, GitModule],
    providers: [GitLfsToolIntegration, GitLfsService, GitLfsController],
    exports: [GitLfsService],
})
export class GitLfsModule {}
