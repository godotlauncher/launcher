import type {
    CodeEditorId,
    CodeEditorInstallationSummary,
    CodeEditorIntegrationSettings,
    CodeEditorIntegrationSummary,
    CodeEditorPathValidationResult,
    UpdateCodeEditorIntegrationSettings,
} from '@shared/contracts';
import { useCallback } from 'react';
import { codeEditorIntegrationBridge } from '../bridge.ts';

export type CodeEditorIntegrationsHook = {
    listIntegrations: () => Promise<CodeEditorIntegrationSummary[]>;
    listIntegrationSettings: () => Promise<CodeEditorIntegrationSettings[]>;
    updateIntegrationSettings: (
        integrationId: CodeEditorId,
        settings: UpdateCodeEditorIntegrationSettings,
    ) => Promise<CodeEditorIntegrationSettings>;
    setDefaultIntegration: (
        integrationId: CodeEditorId,
    ) => Promise<CodeEditorIntegrationSettings[]>;
    scanIntegration: (
        integrationId: CodeEditorId,
    ) => Promise<CodeEditorInstallationSummary | null>;
    scanIntegrations: () => Promise<CodeEditorInstallationSummary[]>;
    validateIntegrationPath: (
        integrationId: CodeEditorId,
        pathToValidate: string,
    ) => Promise<CodeEditorPathValidationResult>;
};

export function useCodeEditorIntegrations(): CodeEditorIntegrationsHook {
    const listIntegrations = useCallback(
        () => codeEditorIntegrationBridge.listIntegrations(),
        [],
    );
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
    const scanIntegration = useCallback(
        (integrationId: CodeEditorId) =>
            codeEditorIntegrationBridge.scanIntegration(integrationId),
        [],
    );
    const scanIntegrations = useCallback(
        () => codeEditorIntegrationBridge.scanIntegrations(),
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
        listIntegrations,
        listIntegrationSettings,
        updateIntegrationSettings,
        setDefaultIntegration,
        scanIntegration,
        scanIntegrations,
        validateIntegrationPath,
    };
}
