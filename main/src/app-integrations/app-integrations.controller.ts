import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
import type {
    AppIntegrationDisconnectOptions,
    AppIntegrationsBridge,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { AppIntegrationsService } from './app-integrations.service.js';

const AppIntegrationsHandler = createIpcHandleTyped<AppIntegrationsBridge>();

/** Handles app integration requests from the renderer. */
@BridgeController({ namespace: 'appIntegrations' })
export class AppIntegrationsController implements AppIntegrationsBridge {
    /**
     * Creates the app integrations controller.
     *
     * @param appIntegrations - Renderer-safe integration facade.
     */
    constructor(private readonly appIntegrations: AppIntegrationsService) {}

    /** @returns Every registered app integration. */
    @AppIntegrationsHandler('listIntegrations')
    async listIntegrations() {
        return await this.appIntegrations.list();
    }

    /**
     * Starts a provider connection in the system browser.
     *
     * @param integrationId - Registered integration ID.
     * @returns The updated integration result.
     */
    @AppIntegrationsHandler('connect')
    async connect(integrationId: string) {
        return await this.appIntegrations.connect(integrationId);
    }

    /**
     * Finishes short-lived installation choices.
     *
     * @param integrationId - Registered integration ID.
     * @param optionIds - Opaque connection option IDs.
     * @returns The updated integration result.
     */
    @AppIntegrationsHandler('finishConnections')
    async finishConnections(integrationId: string, optionIds: string[]) {
        return await this.appIntegrations.finishConnections(
            integrationId,
            optionIds,
        );
    }

    /**
     * Opens the provider installation flow for an authorised user.
     *
     * @param integrationId - Registered integration ID.
     * @returns The updated integration result.
     */
    @AppIntegrationsHandler('installConnection')
    async installConnection(integrationId: string) {
        return await this.appIntegrations.installConnection(integrationId);
    }

    /**
     * Cancels the active provider connection attempt.
     *
     * @param integrationId - Registered integration ID.
     * @returns The updated integration result.
     */
    @AppIntegrationsHandler('cancel')
    async cancel(integrationId: string) {
        return await this.appIntegrations.cancel(integrationId);
    }

    /**
     * Reauthorises an existing provider connection.
     *
     * @param integrationId - Registered integration ID.
     * @param connectionId - Target local connection ID.
     * @param accessTargetId - Renderer-safe installation target ID.
     * @returns The updated integration result.
     */
    @AppIntegrationsHandler('reconnect')
    async reconnect(integrationId: string, connectionId: string) {
        return await this.appIntegrations.reconnect(
            integrationId,
            connectionId,
        );
    }

    /**
     * Refreshes credentials and installation availability.
     *
     * @param integrationId - Registered integration ID.
     * @returns The updated integration result.
     */
    @AppIntegrationsHandler('refresh')
    async refresh(integrationId: string) {
        return await this.appIntegrations.refresh(integrationId);
    }

    /**
     * Opens the provider's repository access settings.
     *
     * @param integrationId - Registered integration ID.
     * @param connectionId - Target local connection ID.
     * @param accessTargetId - Renderer-safe installation target ID.
     * @returns The updated integration result.
     */
    @AppIntegrationsHandler('manageAccess')
    async manageAccess(
        integrationId: string,
        connectionId: string,
        accessTargetId: string,
    ) {
        return await this.appIntegrations.manageAccess(
            integrationId,
            connectionId,
            accessTargetId,
        );
    }

    /**
     * Removes one local provider connection.
     *
     * @param integrationId - Registered integration ID.
     * @param connectionId - Target local connection ID.
     * @param accessTargetId - Renderer-safe installation target ID.
     * @param options - Explicit final-connection revocation choice.
     * @returns The updated integration result.
     */
    @AppIntegrationsHandler('disconnect')
    async disconnect(
        integrationId: string,
        connectionId: string,
        accessTargetId: string,
        options: AppIntegrationDisconnectOptions,
    ) {
        return await this.appIntegrations.disconnect(
            integrationId,
            connectionId,
            accessTargetId,
            options,
        );
    }
}
