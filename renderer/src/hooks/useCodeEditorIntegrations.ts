import type {
    CodeEditorId,
    CodeEditorInstallationSummary,
    CodeEditorIntegrationSummary,
    CodeEditorPathValidationResult,
} from '@shared/contracts';
import { useCallback } from 'react';
import { codeEditorIntegrationBridge } from '../bridge.ts';

export type CodeEditorIntegrationsHook = {
    listIntegrations: () => Promise<CodeEditorIntegrationSummary[]>;
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
        scanIntegration,
        scanIntegrations,
        validateIntegrationPath,
    };
}
