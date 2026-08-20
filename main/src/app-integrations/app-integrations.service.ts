import { Injectable } from '@mariodebono/di';
import type { AppIntegrationSummary } from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { AppIntegrationProviderRegistry } from './app-integration-provider.registry.js';

@Injectable()
export class AppIntegrationsService {
    /**
     * Creates the renderer-safe app integration facade.
     *
     * @param registry - Registry of statically compiled providers.
     */
    constructor(private readonly registry: AppIntegrationProviderRegistry) {}

    /**
     * Lists app integrations without exposing provider instances.
     *
     * @returns Registered integrations in display order.
     */
    list(): AppIntegrationSummary[] {
        return this.registry.list().map(({ metadata }) => ({
            id: metadata.id,
            displayName: metadata.displayName,
            state: 'not-connected',
        }));
    }
}
