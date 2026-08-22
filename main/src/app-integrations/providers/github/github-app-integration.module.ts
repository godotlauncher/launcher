import { Module } from '@mariodebono/di';
import { AppIntegrationsModule } from '../../app-integrations.module.js';
import { GitHubApiClient } from './github-api.client.js';
import { GitHubAppIntegrationProvider } from './github-app-integration.provider.js';
import { GitHubAuthBrokerClient } from './github-auth-broker.client.js';
import { GitHubAuthLoopbackListenerService } from './github-auth-loopback-listener.service.js';
import { GitHubRepositoryBrowsingCapability } from './github-repository-browsing.capability.js';

/** Registers the GitHub app integration provider. */
@Module({
    imports: [AppIntegrationsModule],
    providers: [
        GitHubApiClient,
        GitHubAuthBrokerClient,
        GitHubAuthLoopbackListenerService,
        GitHubAppIntegrationProvider,
        GitHubRepositoryBrowsingCapability,
    ],
})
export class GitHubAppIntegrationModule {}
