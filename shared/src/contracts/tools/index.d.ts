export type InstalledTool = {
    name: string;
    version: string | null;
    path: string;
};

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
};
