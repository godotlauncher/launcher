import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
import type { AppIntegrationsBridge } from '@shared/contracts';
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

    /** Lists every registered app integration. */
    @AppIntegrationsHandler('listIntegrations')
    async listIntegrations() {
        return this.appIntegrations.list();
    }
}
