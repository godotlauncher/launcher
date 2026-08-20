import { Module } from '@mariodebono/di';
import { AppIntegrationsModule } from '../../app-integrations.module.js';
import { GitHubAppIntegrationProvider } from './github-app-integration.provider.js';

/** Registers the GitHub app integration provider. */
@Module({
    imports: [AppIntegrationsModule],
    providers: [GitHubAppIntegrationProvider],
})
export class GitHubAppIntegrationModule {}
