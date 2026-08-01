import {
    BridgeController,
    createIpcHandleTyped,
} from '@mariodebono/di-electron';
import type {
    CodeEditorId,
    CodeEditorIntegrationBridge,
    CodeEditorIntegrationSettings,
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

    @CodeEditorIntegrationHandler('listIntegrationSettings')
    listIntegrationSettings(): Promise<CodeEditorIntegrationSettings[]> {
        return this.codeEditorIntegrationService.listIntegrationSettings();
    }

    @CodeEditorIntegrationHandler('rescanIntegration')
    rescanIntegration(
        integrationId: CodeEditorId,
    ): Promise<CodeEditorIntegrationSettings> {
        return this.codeEditorIntegrationService.rescanIntegration(
            integrationId,
        );
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

    @CodeEditorIntegrationHandler('setDefaultIntegration')
    setDefaultIntegration(
        integrationId: CodeEditorId,
    ): Promise<CodeEditorIntegrationSettings[]> {
        return this.codeEditorIntegrationService.setDefaultIntegration(
            integrationId,
        );
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
