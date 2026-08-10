import {
    type DynamicModule,
    type FactoryProvider,
    Module,
} from '@mariodebono/di';
import { JsonStoreModule } from '../json-store/json-store.module.js';
import { JsonStoreCoordinatorService } from '../json-store/json-store-coordinator.service.js';
import { EDITOR_CATALOG_MODULE_OPTIONS } from './editor-catalog.constants.js';
import { EditorCatalogController } from './editor-catalog.controller.js';
import { EditorCatalogService } from './editor-catalog.service.js';
import { EditorCatalogStore } from './editor-catalog.store.js';
import type { EditorCatalogModuleOptions } from './editor-catalog.types.js';
import { GithubEditorCatalogAdapter } from './github-editor-catalog.adapter.js';

/** Options used to create catalog module settings through DI. */
type EditorCatalogModuleAsyncOptions = Pick<
    FactoryProvider<EditorCatalogModuleOptions>,
    'inject' | 'useFactory'
>;

@Module({
    imports: [JsonStoreModule],
    providers: [
        GithubEditorCatalogAdapter,
        // Build the store here so DI can pass the module options to it.
        {
            provide: EditorCatalogStore,
            inject: [
                JsonStoreCoordinatorService,
                EDITOR_CATALOG_MODULE_OPTIONS,
            ],
            useFactory: (
                coordinator: JsonStoreCoordinatorService,
                options: EditorCatalogModuleOptions,
            ) => new EditorCatalogStore(coordinator, options),
        },
        EditorCatalogService,
        EditorCatalogController,
    ],
    exports: [EditorCatalogService],
})
// biome-ignore lint/complexity/noStaticOnlyClass: DI modules use static setup methods
/** Registers the services used by the editor catalog. */
export class EditorCatalogModule {
    /**
     * Registers the catalog module with fixed storage options.
     *
     * @param options - The directory and file name used by the catalog store.
     * @returns The configured catalog module.
     */
    static forRoot(options: EditorCatalogModuleOptions): DynamicModule {
        return {
            module: EditorCatalogModule,
            providers: [
                {
                    provide: EDITOR_CATALOG_MODULE_OPTIONS,
                    useValue: validateOptions(options),
                },
            ],
        };
    }

    /**
     * Registers the catalog module with options created by DI.
     *
     * @param options - The dependencies and factory used to create the options.
     * @returns The configured catalog module.
     */
    static forRootAsync(
        options: EditorCatalogModuleAsyncOptions,
    ): DynamicModule {
        return {
            module: EditorCatalogModule,
            providers: [
                {
                    provide: EDITOR_CATALOG_MODULE_OPTIONS,
                    inject: options.inject,
                    useFactory: async (...args: unknown[]) =>
                        validateOptions(await options.useFactory(...args)),
                },
            ],
        };
    }
}

/**
 * Checks that the catalog storage options contain usable values.
 *
 * @param options - The options to check.
 * @returns A copy of the checked options.
 */
function validateOptions(
    options: EditorCatalogModuleOptions,
): EditorCatalogModuleOptions {
    if (!options.directory.trim()) {
        throw new Error('Editor catalog directory must not be empty');
    }
    if (!options.fileName.trim()) {
        throw new Error('Editor catalog file name must not be empty');
    }

    return { ...options };
}
