import type {
    CodeEditorId,
    CodeEditorIntegrationSettings,
    CodeEditorPathValidationResult,
    UpdateCodeEditorIntegrationSettings,
} from '@shared/contracts';
import { useCallback } from 'react';
import { codeEditorIntegrationBridge } from '../bridge.ts';

export type CodeEditorIntegrationsHook = {
    listIntegrationSettings: () => Promise<CodeEditorIntegrationSettings[]>;
    updateIntegrationSettings: (
        integrationId: CodeEditorId,
        settings: UpdateCodeEditorIntegrationSettings,
    ) => Promise<CodeEditorIntegrationSettings>;
    setDefaultIntegration: (
        integrationId: CodeEditorId,
    ) => Promise<CodeEditorIntegrationSettings[]>;
    validateIntegrationPath: (
        integrationId: CodeEditorId,
        pathToValidate: string,
    ) => Promise<CodeEditorPathValidationResult>;
};

export function useCodeEditorIntegrations(): CodeEditorIntegrationsHook {
    const listIntegrationSettings = useCallback(
        () => codeEditorIntegrationBridge.listIntegrationSettings(),
        [],
    );
    const updateIntegrationSettings = useCallback(
        (
            integrationId: CodeEditorId,
            settings: UpdateCodeEditorIntegrationSettings,
        ) =>
            codeEditorIntegrationBridge.updateIntegrationSettings(
                integrationId,
                settings,
            ),
        [],
    );
    const setDefaultIntegration = useCallback(
        (integrationId: CodeEditorId) =>
            codeEditorIntegrationBridge.setDefaultIntegration(integrationId),
        [],
    );
    const validateIntegrationPath = useCallback(
        (integrationId: CodeEditorId, pathToValidate: string) =>
            codeEditorIntegrationBridge.validateIntegrationPath(
                integrationId,
                pathToValidate,
            ),
        [],
    );

    return {
        listIntegrationSettings,
        updateIntegrationSettings,
        setDefaultIntegration,
        validateIntegrationPath,
    };
}
