import { Module } from '@mariodebono/di';
import { ToolIntegrationModule } from '../../tool-integration.module.js';
import { GitLfsToolIntegration } from './git-lfs-tool.integration.js';

@Module({
    imports: [ToolIntegrationModule],
    providers: [GitLfsToolIntegration],
})
export class GitLfsModule {}
