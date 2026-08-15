// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import {
    Injectable,
    ModuleRef,
    type OnModuleInit,
    type ProviderToken,
} from '@mariodebono/di';
import { TOOL_INTEGRATION_TAG } from './tool-integration.constants.js';
import type { ToolId, ToolIntegration } from './tool-integration.types.js';

@Injectable()
export class ToolIntegrationRegistry implements OnModuleInit {
    private readonly integrations = new Map<ToolId, ToolIntegration>();

    /**
     * Creates a registry backed by tagged providers in the application graph.
     *
     * @param moduleRef - Runtime DI accessor used to discover tool providers.
     */
    constructor(private readonly moduleRef: ModuleRef) {}

    /**
     * Resolves tagged providers and builds the stable-ID registry.
     *
     * @returns A promise that resolves after all providers are registered.
     */
    async onModuleInit(): Promise<void> {
        const tokens = this.moduleRef.findByTag(TOOL_INTEGRATION_TAG);
        const integrations = await Promise.all(
            tokens.map((token) =>
                this.moduleRef.resolve(token as ProviderToken<ToolIntegration>),
            ),
        );

        this.register(integrations);
    }

    /**
     * Reports whether a tool ID is registered.
     *
     * @param toolId - Stable tool ID to check.
     * @returns Whether the registry contains the tool.
     */
    has(toolId: string): boolean {
        return this.integrations.has(toolId);
    }

    /**
     * Returns one registered integration.
     *
     * @param toolId - Stable tool ID to resolve.
     * @returns The registered tool integration.
     */
    get(toolId: ToolId): ToolIntegration {
        const integration = this.integrations.get(toolId);
        if (!integration) {
            throw new Error(`Unknown tool integration: ${toolId}`);
        }
        return integration;
    }

    /**
     * Lists integrations in deterministic display order.
     *
     * @returns Registered integrations sorted by order and stable ID.
     */
    list(): ToolIntegration[] {
        return [...this.integrations.values()];
    }

    /**
     * Replaces the registry contents with a validated provider list.
     *
     * @param integrations - Tagged tool providers to register.
     */
    private register(integrations: readonly ToolIntegration[]): void {
        const ordered = [...integrations].sort(
            (left, right) =>
                left.metadata.order - right.metadata.order ||
                left.metadata.id.localeCompare(right.metadata.id),
        );

        this.integrations.clear();
        for (const integration of ordered) {
            const { id } = integration.metadata;
            if (this.integrations.has(id)) {
                throw new Error(`Duplicate tool integration: ${id}`);
            }
            this.integrations.set(id, integration);
        }
    }
}
