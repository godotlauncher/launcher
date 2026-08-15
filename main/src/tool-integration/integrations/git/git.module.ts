import { Module } from '@mariodebono/di';
import { ToolIntegrationModule } from '../../tool-integration.module.js';
import { GitController } from './git.controller.js';
import { GitService } from './git.service.js';
import { GitToolIntegration } from './git-tool.integration.js';

@Module({
    imports: [ToolIntegrationModule],
    providers: [GitToolIntegration, GitService, GitController],
    exports: [GitService],
})
export class GitModule {}
