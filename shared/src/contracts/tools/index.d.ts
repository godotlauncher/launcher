export type ToolIntegrationStatus =
    | 'available'
    | 'disabled'
    | 'invalid'
    | 'missing'
    | 'unchecked';

export type ToolIntegrationSummary = {
    id: string;
    displayName: string;
    status: ToolIntegrationStatus;
    version: string | null;
    executablePath: string | null;
};

export type ToolIntegrationBridge = {
    /**
     * Refreshes stale tool integrations and returns their current summaries.
     *
     * @returns Renderer-safe tool integration summaries.
     */
    listIntegrations(): Promise<ToolIntegrationSummary[]>;

    /**
     * Forces every tool integration to rescan.
     *
     * @returns Renderer-safe tool integration summaries.
     */
    rescanIntegrations(): Promise<ToolIntegrationSummary[]>;

    /**
     * Refreshes one tool integration when its cached state is stale.
     *
     * @param toolId - Stable ID of the integration to refresh.
     * @returns The refreshed renderer-safe summary.
     */
    refreshIntegration(toolId: string): Promise<ToolIntegrationSummary>;

    /**
     * Forces one tool integration to rescan.
     *
     * @param toolId - Stable ID of the integration to rescan.
     * @returns The rescanned renderer-safe summary.
     */
    rescanIntegration(toolId: string): Promise<ToolIntegrationSummary>;
};
