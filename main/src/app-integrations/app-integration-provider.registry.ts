// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import {
    Injectable,
    ModuleRef,
    type OnModuleInit,
    type ProviderToken,
} from '@mariodebono/di';
import { APP_INTEGRATION_PROVIDER_TAG } from './app-integration.constants.js';
import type { AppIntegrationProvider } from './app-integration.types.js';

@Injectable()
export class AppIntegrationProviderRegistry implements OnModuleInit {
    private readonly providers = new Map<string, AppIntegrationProvider>();

    /**
     * Creates the registry backed by tagged providers in the application graph.
     *
     * @param moduleRef - Runtime DI accessor used to discover providers.
     */
    constructor(private readonly moduleRef: ModuleRef) {}

    /**
     * Discovers and validates statically registered app integrations.
     */
    async onModuleInit(): Promise<void> {
        const tokens = this.moduleRef.findByTag(APP_INTEGRATION_PROVIDER_TAG);
        const providers = await Promise.all(
            tokens.map((token) =>
                this.moduleRef.resolve(
                    token as ProviderToken<AppIntegrationProvider>,
                ),
            ),
        );

        this.register(providers);
    }

    /**
     * Lists providers in deterministic display order.
     *
     * @returns Registered app integration providers.
     */
    list(): AppIntegrationProvider[] {
        return [...this.providers.values()];
    }

    /**
     * Replaces the registry contents with validated providers.
     *
     * @param providers - Providers discovered from the DI graph.
     */
    private register(providers: readonly AppIntegrationProvider[]): void {
        const ordered = [...providers].sort(
            (left, right) =>
                left.metadata.order - right.metadata.order ||
                left.metadata.id.localeCompare(right.metadata.id),
        );

        this.providers.clear();
        for (const provider of ordered) {
            const id = provider.metadata.id.trim();
            if (!id || !provider.metadata.displayName.trim()) {
                throw new Error('Invalid app integration provider metadata');
            }
            if (this.providers.has(id)) {
                throw new Error(`Duplicate app integration provider: ${id}`);
            }
            this.providers.set(id, provider);
        }
    }
}
