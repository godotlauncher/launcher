import {
    type DynamicModule,
    type FactoryProvider,
    Module,
} from '@mariodebono/di';
import { JsonStoreModule } from '../json-store/json-store.module.js';
import { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import { APP_INTEGRATION_MODULE_OPTIONS } from './app-integration.constants.js';
import type { AppIntegrationModuleOptions } from './app-integration.types.js';
import { AppIntegrationCapabilityRegistry } from './app-integration-capability.registry.js';
import { AppIntegrationProviderRegistry } from './app-integration-provider.registry.js';
import { AppIntegrationSecretsStore } from './app-integration-secrets.store.js';
import { AppIntegrationSecureStorageAdapter } from './app-integration-secure-storage.adapter.js';
import { AppIntegrationsController } from './app-integrations.controller.js';
import { AppIntegrationsService } from './app-integrations.service.js';
import { AppIntegrationsStore } from './app-integrations.store.js';
import { RepositoryHostingService } from './repository-hosting.service.js';

type AppIntegrationsModuleAsyncOptions = Pick<
    FactoryProvider<AppIntegrationModuleOptions>,
    'inject' | 'useFactory'
>;

@Module({
    imports: [JsonStoreModule],
    providers: [
        AppIntegrationProviderRegistry,
        AppIntegrationCapabilityRegistry,
        {
            provide: AppIntegrationsStore,
            inject: [
                JsonStoreCoordinatorService,
                APP_INTEGRATION_MODULE_OPTIONS,
            ],
            useFactory: (
                coordinator: JsonStoreCoordinatorService,
                options: AppIntegrationModuleOptions,
            ) => new AppIntegrationsStore(coordinator, options),
        },
        {
            provide: AppIntegrationSecretsStore,
            inject: [
                JsonStoreCoordinatorService,
                APP_INTEGRATION_MODULE_OPTIONS,
            ],
            useFactory: (
                coordinator: JsonStoreCoordinatorService,
                options: AppIntegrationModuleOptions,
            ) => new AppIntegrationSecretsStore(coordinator, options),
        },
        AppIntegrationSecureStorageAdapter,
        AppIntegrationsService,
        RepositoryHostingService,
        AppIntegrationsController,
    ],
    exports: [
        AppIntegrationCapabilityRegistry,
        AppIntegrationsService,
        RepositoryHostingService,
    ],
})
// biome-ignore lint/complexity/noStaticOnlyClass: DI modules use static setup methods
export class AppIntegrationsModule {
    /** Registers fixed app integration storage options. */
    static forRoot(options: AppIntegrationModuleOptions): DynamicModule {
        return {
            module: AppIntegrationsModule,
            providers: [
                {
                    provide: APP_INTEGRATION_MODULE_OPTIONS,
                    useValue: validateOptions(options),
                },
            ],
        };
    }

    /** Registers app integration storage options created through DI. */
    static forRootAsync(
        options: AppIntegrationsModuleAsyncOptions,
    ): DynamicModule {
        return {
            module: AppIntegrationsModule,
            providers: [
                {
                    provide: APP_INTEGRATION_MODULE_OPTIONS,
                    inject: options.inject,
                    useFactory: async (...args: unknown[]) =>
                        validateOptions(await options.useFactory(...args)),
                },
            ],
        };
    }
}

/** Validates app integration storage paths. */
function validateOptions(
    options: AppIntegrationModuleOptions,
): AppIntegrationModuleOptions {
    if (
        !options.directory.trim() ||
        !options.metadataFileName.trim() ||
        !options.secretsFileName.trim()
    ) {
        throw new Error('App integration storage options must not be empty');
    }
    return { ...options };
}
