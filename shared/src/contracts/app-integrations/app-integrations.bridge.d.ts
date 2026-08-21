import type {
    AppIntegrationActionResult,
    AppIntegrationSummary,
} from './app-integration.types.js';

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

    /**
     * Starts an integration connection in the system browser.
     *
     * @param integrationId - Registered integration ID.
     */
    connect(integrationId: string): Promise<AppIntegrationActionResult>;

    /**
     * Finishes existing verified installation choices.
     *
     * @param integrationId - Registered integration ID.
     * @param optionIds - Short-lived opaque connection option IDs.
     */
    finishConnections(
        integrationId: string,
        optionIds: string[],
    ): Promise<AppIntegrationActionResult>;

    /**
     * Opens the provider installation flow for the authorised user.
     *
     * @param integrationId - Registered integration ID.
     */
    installConnection(
        integrationId: string,
    ): Promise<AppIntegrationActionResult>;

    /**
     * Cancels the active connection attempt for an integration.
     *
     * @param integrationId - Registered integration ID.
     */
    cancel(integrationId: string): Promise<AppIntegrationActionResult>;

    /**
     * Reauthorises an existing integration connection.
     *
     * @param integrationId - Registered integration ID.
     * @param connectionId - Target local connection ID.
     */
    reconnect(
        integrationId: string,
        connectionId: string,
    ): Promise<AppIntegrationActionResult>;

    /**
     * Refreshes credentials and installation availability.
     *
     * @param integrationId - Registered integration ID.
     */
    refresh(integrationId: string): Promise<AppIntegrationActionResult>;

    /**
     * Opens the provider-owned repository access settings.
     *
     * @param integrationId - Registered integration ID.
     * @param connectionId - Target local connection ID.
     * @param accessTargetId - Renderer-safe installation target ID.
     */
    manageAccess(
        integrationId: string,
        connectionId: string,
        accessTargetId: string,
    ): Promise<AppIntegrationActionResult>;

    /**
     * Removes the local integration connection and credentials.
     *
     * @param integrationId - Registered integration ID.
     * @param connectionId - Target local connection ID.
     * @param accessTargetId - Renderer-safe installation target ID.
     */
    disconnect(
        integrationId: string,
        connectionId: string,
        accessTargetId: string,
    ): Promise<AppIntegrationActionResult>;
};
