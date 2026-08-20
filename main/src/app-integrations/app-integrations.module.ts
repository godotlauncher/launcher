import { Module } from '@mariodebono/di';
import { AppIntegrationProviderRegistry } from './app-integration-provider.registry.js';
import { AppIntegrationsController } from './app-integrations.controller.js';
import { AppIntegrationsService } from './app-integrations.service.js';

/** Owns statically compiled remote app integrations. */
@Module({
    providers: [
        AppIntegrationProviderRegistry,
        AppIntegrationsService,
        AppIntegrationsController,
    ],
    exports: [AppIntegrationsService],
})
export class AppIntegrationsModule {}
