import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
import type {
    CodeEditorId,
    CodeEditorInstallationSummary,
    CodeEditorIntegrationBridge,
    CodeEditorIntegrationSettings,
    CodeEditorIntegrationSummary,
    CodeEditorPathValidationResult,
    UpdateCodeEditorIntegrationSettings,
} from '@shared/contracts';
// biome-ignore lint/style/useImportType: Required for DI constructor metadata
import { CodeEditorIntegrationService } from './codeEditorIntegration.service.js';

const CodeEditorIntegrationHandler =
    createIpcHandleTyped<CodeEditorIntegrationBridge>();

@BridgeController({ namespace: 'codeEditorIntegration' })
export class CodeEditorIntegrationController
    implements CodeEditorIntegrationBridge
{
    constructor(
        private readonly codeEditorIntegrationService: CodeEditorIntegrationService,
    ) {}

    @CodeEditorIntegrationHandler('listIntegrations')
    async listIntegrations(): Promise<CodeEditorIntegrationSummary[]> {
        return this.codeEditorIntegrationService.listIntegrations();
    }

    @CodeEditorIntegrationHandler('listIntegrationSettings')
    listIntegrationSettings(): Promise<CodeEditorIntegrationSettings[]> {
        return this.codeEditorIntegrationService.listIntegrationSettings();
    }

    @CodeEditorIntegrationHandler('updateIntegrationSettings')
    updateIntegrationSettings(
        integrationId: CodeEditorId,
        settings: UpdateCodeEditorIntegrationSettings,
    ): Promise<CodeEditorIntegrationSettings> {
        return this.codeEditorIntegrationService.updateIntegrationSettings(
            integrationId,
            settings,
        );
    }

    @CodeEditorIntegrationHandler('scanIntegration')
    scanIntegration(
        integrationId: CodeEditorId,
    ): Promise<CodeEditorInstallationSummary | null> {
        return this.codeEditorIntegrationService.scanIntegration(integrationId);
    }

    @CodeEditorIntegrationHandler('scanIntegrations')
    scanIntegrations(): Promise<CodeEditorInstallationSummary[]> {
        return this.codeEditorIntegrationService.scanIntegrations();
    }

    @CodeEditorIntegrationHandler('validateIntegrationPath')
    validateIntegrationPath(
        integrationId: CodeEditorId,
        pathToValidate: string,
    ): Promise<CodeEditorPathValidationResult> {
        return this.codeEditorIntegrationService.validateIntegrationPath(
            integrationId,
            pathToValidate,
        );
    }
}
