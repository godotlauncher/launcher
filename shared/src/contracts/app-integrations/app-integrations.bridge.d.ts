import type { AppIntegrationSummary } from './app-integration.types.js';

/**
 * Lists app integrations that are available to the renderer.
 */
export type AppIntegrationsBridge = {
    /**
     * Lists registered app integrations in display order.
     *
     * @returns Renderer-safe app integration summaries.
     */
    listIntegrations(): Promise<AppIntegrationSummary[]>;
};
