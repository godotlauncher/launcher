import {
    type DynamicModule,
    type FactoryProvider,
    Module,
} from '@mariodebono/di';
import { JsonStoreModule } from '../json-store/json-store.module.js';
import { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import { ToolInstallationCache } from './tool-installation.cache.js';
import { TOOL_INTEGRATION_MODULE_OPTIONS } from './tool-integration.constants.js';
import { ToolIntegrationController } from './tool-integration.controller.js';
import { ToolIntegrationRegistry } from './tool-integration.registry.js';
import { ToolIntegrationService } from './tool-integration.service.js';
import { ToolIntegrationStore } from './tool-integration.store.js';
import type { ToolIntegrationModuleOptions } from './tool-integration.types.js';
import { ToolProcessExecutor } from './tool-process.executor.js';

type ToolIntegrationModuleAsyncOptions = Pick<
    FactoryProvider<ToolIntegrationModuleOptions>,
    'inject' | 'useFactory'
>;

@Module({
    imports: [JsonStoreModule],
    providers: [
        ToolIntegrationRegistry,
        {
            provide: ToolIntegrationStore,
            inject: [
                JsonStoreCoordinatorService,
                TOOL_INTEGRATION_MODULE_OPTIONS,
            ],
            useFactory: (
                coordinator: JsonStoreCoordinatorService,
                options: ToolIntegrationModuleOptions,
            ) => new ToolIntegrationStore(coordinator, options),
        },
        ToolInstallationCache,
        ToolProcessExecutor,
        ToolIntegrationService,
        ToolIntegrationController,
    ],
    exports: [ToolIntegrationService, ToolProcessExecutor],
})
// biome-ignore lint/complexity/noStaticOnlyClass: DI modules use static setup methods
export class ToolIntegrationModule {
    /**
     * Registers the tool integration module with fixed storage options.
     *
     * @param options - Directory and file name used by the tool store.
     * @returns The configured dynamic module.
     */
    static forRoot(options: ToolIntegrationModuleOptions): DynamicModule {
        return {
            module: ToolIntegrationModule,
            providers: [
                {
                    provide: TOOL_INTEGRATION_MODULE_OPTIONS,
                    useValue: validateOptions(options),
                },
            ],
        };
    }

    /**
     * Registers storage options created through dependency injection.
     *
     * @param options - Dependencies and factory used to create options.
     * @returns The configured dynamic module.
     */
    static forRootAsync(
        options: ToolIntegrationModuleAsyncOptions,
    ): DynamicModule {
        return {
            module: ToolIntegrationModule,
            providers: [
                {
                    provide: TOOL_INTEGRATION_MODULE_OPTIONS,
                    inject: options.inject,
                    useFactory: async (...args: unknown[]) =>
                        validateOptions(await options.useFactory(...args)),
                },
            ],
        };
    }
}

/**
 * Checks that the tool store options contain usable values.
 *
 * @param options - Store options to validate.
 * @returns A copy of the validated options.
 */
function validateOptions(
    options: ToolIntegrationModuleOptions,
): ToolIntegrationModuleOptions {
    if (!options.directory.trim()) {
        throw new Error('Tool integration directory must not be empty');
    }
    if (!options.fileName.trim()) {
        throw new Error('Tool integration file name must not be empty');
    }
    return { ...options };
}
