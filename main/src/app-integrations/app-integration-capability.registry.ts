// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import {
    Injectable,
    ModuleRef,
    type OnModuleInit,
    type ProviderToken,
} from '@mariodebono/di';
import { APP_INTEGRATION_CAPABILITY_TAG } from './app-integration.constants.js';
import type {
    AppIntegrationCapability,
    AppIntegrationCapabilityKind,
} from './app-integration-capability.types.js';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { AppIntegrationProviderRegistry } from './app-integration-provider.registry.js';

const CAPABILITY_KINDS = new Set<AppIntegrationCapabilityKind>([
    'repository-browsing',
]);

@Injectable()
export class AppIntegrationCapabilityRegistry implements OnModuleInit {
    private readonly capabilities = new Map<string, AppIntegrationCapability>();

    /**
     * Creates the capability registry.
     *
     * @param moduleRef - Runtime DI accessor used to discover capabilities.
     * @param providers - Validated app integration provider registry.
     */
    constructor(
        private readonly moduleRef: ModuleRef,
        private readonly providers: AppIntegrationProviderRegistry,
    ) {}

    /** Discovers and validates statically registered capabilities. */
    async onModuleInit(): Promise<void> {
        const tokens = this.moduleRef.findByTag(APP_INTEGRATION_CAPABILITY_TAG);
        const capabilities = await Promise.all(
            tokens.map((token) =>
                this.moduleRef.resolve(
                    token as ProviderToken<AppIntegrationCapability>,
                ),
            ),
        );
        this.register(capabilities);
    }

    /**
     * Returns a capability for one provider and kind.
     *
     * @param providerId - Registered provider ID.
     * @param kind - Supported capability kind.
     * @returns The matching capability.
     */
    get(
        providerId: string,
        kind: AppIntegrationCapabilityKind,
    ): AppIntegrationCapability {
        const capability = this.capabilities.get(this.key(providerId, kind));
        if (!capability) {
            throw new Error('Unknown app integration capability');
        }
        return capability;
    }

    /**
     * Replaces the registry contents with validated capabilities.
     *
     * @param capabilities - Capabilities discovered from the DI graph.
     */
    private register(capabilities: readonly AppIntegrationCapability[]): void {
        const ordered = [...capabilities].sort((left, right) =>
            this.key(
                left.metadata.providerId,
                left.metadata.kind,
            ).localeCompare(
                this.key(right.metadata.providerId, right.metadata.kind),
            ),
        );
        this.capabilities.clear();
        for (const capability of ordered) {
            const providerId = capability.metadata.providerId.trim();
            const kind = capability.metadata.kind;
            this.providers.get(providerId);
            if (!CAPABILITY_KINDS.has(kind)) {
                throw new Error('Unknown app integration capability kind');
            }
            const key = this.key(providerId, kind);
            if (this.capabilities.has(key)) {
                throw new Error(`Duplicate app integration capability: ${key}`);
            }
            this.capabilities.set(key, capability);
        }
    }

    /**
     * Builds a collision-safe registry key.
     *
     * @param providerId - Registered provider ID.
     * @param kind - Capability kind.
     * @returns Registry key.
     */
    private key(providerId: string, kind: string): string {
        return `${providerId}\u0000${kind}`;
    }
}
