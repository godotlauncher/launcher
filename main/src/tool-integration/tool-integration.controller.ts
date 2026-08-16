import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
import type {
    ToolIntegrationBridge,
    ToolIntegrationSummary,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { ToolIntegrationService } from './tool-integration.service.js';
import { mapToolIntegrationSummary } from './tool-integration-summary.mapper.js';

const ToolIntegrationHandler = createIpcHandleTyped<ToolIntegrationBridge>();

/** Handles tool integration requests from the renderer. */
@BridgeController({ namespace: 'toolIntegration' })
export class ToolIntegrationController implements ToolIntegrationBridge {
    /**
     * Creates the tool integration controller.
     *
     * @param service - Internal tool integration lifecycle facade.
     */
    constructor(private readonly service: ToolIntegrationService) {}

    /**
     * Refreshes stale tool integrations for renderer consumers.
     *
     * @returns Renderer-safe integration summaries.
     */
    @ToolIntegrationHandler('listIntegrations')
    async listIntegrations(): Promise<ToolIntegrationSummary[]> {
        const summaries = await this.service.refreshAll();
        return summaries.map(mapToolIntegrationSummary);
    }

    /**
     * Forces every registered tool integration to rescan.
     *
     * @returns Renderer-safe integration summaries.
     */
    @ToolIntegrationHandler('rescanIntegrations')
    async rescanIntegrations(): Promise<ToolIntegrationSummary[]> {
        const summaries = await this.service.rescanAll();
        return summaries.map(mapToolIntegrationSummary);
    }

    /**
     * Refreshes one registered tool while respecting cached freshness.
     *
     * @param toolId - Stable ID of the integration to refresh.
     * @returns The refreshed renderer-safe summary.
     */
    @ToolIntegrationHandler('refreshIntegration')
    async refreshIntegration(toolId: string): Promise<ToolIntegrationSummary> {
        return mapToolIntegrationSummary(await this.service.refresh(toolId));
    }

    /**
     * Forces one registered tool integration to rescan.
     *
     * @param toolId - Stable ID of the integration to rescan.
     * @returns The rescanned renderer-safe summary.
     */
    @ToolIntegrationHandler('rescanIntegration')
    async rescanIntegration(toolId: string): Promise<ToolIntegrationSummary> {
        return mapToolIntegrationSummary(await this.service.rescan(toolId));
    }
}
